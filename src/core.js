const bootstrap = require('./bootstrap')
const LongPoll = require('./longPoll')
const Router = require('./router')
const VkApi = require('./api')
const request = require('request')
const http = require('http')
const https = require('https')
const path = require('path')
const fs = require("fs")
const {LongPollSettings, extractUserIdFromUpdate, isStartWithCommand, getAttachKey} = require('./tools')

class Bot {
	constructor(token) {
		this.token = token
		this.api = new VkApi(token)
		this.router = new Router(this.api)
		this.onError = console.error
		this.onLog = console.log
		this.onUpdate = () => {
		}
		this.on = this.router.on.bind(this.router)
		this.removeEventListener = this.router.removeEventListener.bind(this.router)
		this.onNextMessage = this.router.onNextMessage.bind(this.router)
		this.removePeerIdListener = this.router.removePeerIdListener.bind(this.router)
		this.onCommand = (command, callback) => {
			this.on("message_new", msg => msg.HasCommand(command), callback)
		}

		this.userCache = {}
		this.userContext = {}
		this.userLastEvent = {}
		this.userInCacheCount = 0
		this.fetchUser = true
		this.maxUsersInCache = 10000

		this.groupId = null
		this.groupName = null
		this.groupScreen = null
		this.lockQueue = 0
		this.queue = []

		this.sessionTime = 1000 * 60 * 60

		this.fetchFieldsForUser = [
			'sex',
			'bdate',
			'city',
			'country',
			'photo_200',
			'domain',
			'domain',
			'first_name_gen',
			'first_name_dat',
			'first_name_acc',
			'first_name_ins',
			'first_name_abl',
			'timezone',
			'verified'
		]

		this.emptyUser = {
			id: 0,
			first_name: "DELETED",
			last_name: "DELETED",
			sex: 0,
			member: 0,
			getContext: () => {
				return {}
			}
		}

		this.logEventsOnConsole = false
		this.logMessagesOnConsole = false

		this.router.onResponse = params => {
			if (this.logMessagesOnConsole) {
				const inputText = params.message
				const peerId = params.peer_id
				const message = [
					(new Date()).toLocaleTimeString(),
					"<-:",
					"@" + peerId,
					inputText ? inputText : (params.attachment ? params.attachment : "[NO RESPONSE TEXT AND ATTACHMENTS]"),
				]
				console.debug(message.join(" "))
			}
		}

		this.dispatchUpdates = updates => {
			if (this.fetchUser) {
				const ids = updates
					.reduce((arr, update) => {
						const peerId = extractUserIdFromUpdate(update.type, update['object'])
						if (peerId && peerId > 0 && peerId < 2e9) {
							if (this.userCache[peerId] === undefined) {
								return arr.concat([peerId])
							}
						}
						return arr
					}, [])

				if (ids.length) {
					this.fillCache(ids, updates).then(() => {
					})
					return
				}
			}
			this.processUpdates(updates)
		}

		this.dispatch = update => this.dispatchUpdates([update])
	}

	dispatchFromHttp(eventObject, response) {
		if (eventObject && eventObject.type === 'confirmation') {
			this.onLog("Received confirmation request from vk.com")
			this.onLog("Fetching confirmation code for group: "+eventObject.group_id)
			this.api.call("groups.getCallbackConfirmationCode", {group_id: eventObject.group_id})
				.then(r => {
					this.onLog("confirmation code successful send")
					response.send(r.code)
				})
				.catch(e => {
					this.onError(e)
					response.send("Cant fetch code from API: " + e.message)
				})
		} else {
			response.send("ok")
			if (eventObject) {
				this.dispatch(eventObject)
			}
		}
	}

	/**
	 * @param {function|string|RegExp|Array} filter
	 * @param {function|string} callback
	 * @return {*}
	 */
	onMessage(filter, callback = undefined) {
		if (callback === undefined) {
			callback = filter
			filter = () => true
		}
		return this.on("message_new", filter, callback)
	}

	_start() {
		this.fetchFieldsForUser.forEach(key => {
			this.emptyUser[key] = ""
		})

		return bootstrap(this.token)
			.then(async ({api, group}) => {
				this.onLog(`Бот запущен в группе ${group.name} https://vk.com/${group.screen_name}`)
				this.groupId = group.id
				this.groupName = group.name
				this.groupScreen = group.screen_name
			})
			.catch(e => {
				this.onLog("BOT START FAILED: " + e.message)
				this.onError(e)
				throw e
			})
	}

	getParamsForEvents() {
		const requestedEvents = {}
		for (let key in this.router.listeners) {
			if (this.router.listeners.hasOwnProperty(key)) {
				requestedEvents[key] = 1
			}
		}

		return Object.assign({}, {...LongPollSettings, group_id: this.groupId}, requestedEvents)
	}

	startAsLongPoll() {
		return this._start().then(async () => {
			const requestedEvents = {}
			for (let key in this.router.listeners) {
				if (this.router.listeners.hasOwnProperty(key)) {
					requestedEvents[key] = 1
				}
			}

			await this.api.call("groups.setLongPollSettings", this.getParamsForEvents())
			const lp = new LongPoll(this.api, this.groupId)
			lp.onError = this.onError
			lp.onUpdates = this.dispatchUpdates
			lp.start().catch(e => {
				this.onLog("BOT ERROR: Long poll: " + e.message)
				this.onError(e)
			})
		})
	}

	startAsCallbackApi( serverUrl, serverName = "CORGI_BOT_0803" ) {
		return this._start()
			.then(async () => {
				const servers = await this.api.call("groups.getCallbackServers", {group_id: this.groupId})
				const ownServer = servers.items.filter( server => server.url === serverUrl ).pop()
				let needInstallServer = true
				let serverId = null
				if (ownServer) {
					if (ownServer.status === 'ok') {
						this.onLog("Callback server installed")
						this.onLog("Wait events on: " + ownServer.url)
						needInstallServer = false
						serverId = ownServer.id
					} else {
						this.onLog("Callback server found, bus status is not ok -- "+ownServer.status)
						await this.api.call("groups.deleteCallbackServer", {group_id:this.groupId, server_id:ownServer.id})
						this.onLog("Server deleted..")
					}
				}

				if (needInstallServer) {
					this.onLog("Start installing server....")
					const params = {
						group_id: this.groupId,
						url:serverUrl,
						title: serverName
					}
					const server = await this.api.call("groups.addCallbackServer", params)
					const {server_id} = server
					this.onLog("Sever installed id: " + server_id)
					this.onLog("Sever name: " + serverName + " server url: " + serverUrl)
					serverId = server_id
				}

				await this.api.call("groups.setCallbackSettings", {...this.getParamsForEvents(), server_id:serverId})
				this.onLog("Server settings updated successful!")
			})
	}

	processUpdates(updates) {
		if (this.lockQueue > 0) {
			this.queue = this.queue.concat(updates)
			return
		}
		this.queue.forEach(update => this.processSingleUpdate(update))
		this.queue = []
		updates.forEach(update => this.processSingleUpdate(update))
	}

	fillUpdate(update) {
		const self = this

		update["object"].__core = this

		/**
		 * @return {boolean}
		 */
		update["object"].HasText = function (text) {
			if (this.text) {
				let t = this.text.toString()
				if (this.HasMention()) {
					t = t.replace(`[club${self.groupId}|`, '').trim()
					t = t.substr(t.indexOf(']') + 1).trim()
				}
				if (text instanceof RegExp) {
					return t.match(text)
				} else if (Array.isArray(text)) {
					t = t.toLowerCase()
					for (let i = 0; i < text.length; i++) {
						if (t.indexOf(text[i].toString().toLowerCase()) !== -1) {
							return true
						}
					}
					return false
				} else {
					t = t.toLowerCase()
					return t.indexOf(text.toString().toLowerCase()) !== -1
				}
			} else {
				return false
			}
		}
		update["object"].__user = this.userCache[extractUserIdFromUpdate(update.type, update['object'])]


		update["object"].GetUser = function () {
			return this.__user || self.emptyUser
		}

		update["object"].HasAttach = function (type) {
			if (this.attachments) {
				return this.attachments.filter(x => x.type === type).length
			} else {
				return 0
			}
		}

		update["object"].HasPhoto = function () {
			return this.HasAttach('photo')
		}

		update["object"].HasOnePhoto = function () {
			return this.HasAttach('photo') === 1
		}

		update["object"].GetPhotoMaxSizeUrl = function () {
			const photo = (this.attachments || []).filter(x => x.type === 'photo').pop()
			if (photo) {
				const size = photo.photo.sizes.pop()
				return size.url
			}
			return null
		}

		/**
		 * @return {boolean}
		 */
		update["object"].IsChat = function () {
			return this.peer_id >= 2e9
		}

		/**
		 * @return {boolean}
		 */
		update["object"].IsDirect = function () {
			return this.peer_id < 2e9
		}

		/**
		 * @return {boolean}
		 */
		update["object"].HasMention = function () {
			return this.text && this.text.toString().trim().indexOf(`[club${self.groupId}|`) === 0
		}

		update['object'].HasCommand = function (command) {
			let text = (this.text || "").toString().trim().toLowerCase()
			if (this.HasMention()) {
				text = text.replace(`[club${self.groupId}|`, '').trim()
				text = text.substr(text.indexOf(']') + 1).trim()
			}
			if (typeof command === 'string') {
				return isStartWithCommand(text, command)
			} else if (Array.isArray(command)) {
				for (let i = 0; i < command.length; i++) {
					if (isStartWithCommand(text, command[i])) {
						return true
					}
				}
			} else {
				return false
			}
		}

		/**
		 * @return {boolean}
		 */
		update["object"].IsFirstMessage = function () {
			if (this.__user) {
				if (!this.__user.last_message_time) {
					return true
				} else {
					return Date.now() - this.__user.last_message_time > self.sessionTime
				}
			} else {
				return false
			}
		}

		/**
		 * @return {boolean}
		 */
		update["object"].IsFirstTyping = function () {
			if (this.__user) {
				if (!this.IsFirstMessage()) {
					return false
				}
				if (!self.userLastEvent[this.__user.id]) {
					return true
				}
				return this.IsFirstMessage() && Date.now() - self.userLastEvent[this.__user.id] > self.sessionTime
			} else {
				return false
			}
		}

		update["object"].Button = function () {
			if (this.payload) {
				try {
					return JSON.parse(this.payload)
				} catch (e) {
					return null
				}
			} else {
				return null
			}
		}
	}

	processSingleUpdate(update) {
		if (this.logEventsOnConsole) {
			console.debug((new Date()).toLocaleTimeString() + ": " + update.type + "\n" + JSON.stringify(update, null, 2))
		}
		if (this.logMessagesOnConsole && update.type === 'message_new') {
			const inputText = update.object.text
			const peerId = update.object.peer_id
			const message = [
				(new Date()).toLocaleTimeString(),
				"->:",
				"@" + peerId,
				inputText ? inputText : "[NO TEXT]",
			]
			console.debug(message.join(" "))
		}
		if (update.type === 'group_join' && this.userCache[update['object']['user_id']]) {
			this.userCache[update['object']['user_id']].member = 1
		}

		if (update.type === 'group_leave' && this.userCache[update['object']['user_id']]) {
			this.userCache[update['object']['user_id']].member = 0
		}

		this.fillUpdate(update)
		this.onUpdate(update)

		try {
			this.router.dispatch(update.type, update['object'])
		} catch (e) {
			this.onError(e)
		}

		if (this.fetchUser) {
			const peerId = extractUserIdFromUpdate(update.type, update['object'])

			if (peerId && peerId > 0 && peerId < 2e9) {
				this.addToCache(peerId, {last_event_type: update.type})
				this.userLastEvent[peerId] = Date.now()
				if (update.type === "message_new") {
					this.addToCache(peerId, {last_message_time: Date.now()})
				}
			}
		}
	}

	async fillCache(userIds, updates) {
		this.lockQueue++
		const member = `API.groups.isMember({group_id:${this.groupId},user_ids:"${userIds.join(",")}"})`
		const info = `API.users.get({user_ids:"${userIds.join(",")}",fields:"${this.fetchFieldsForUser.join(',')}"})`
		const code = `return [${member},${info}];`
		try {
			const res = await this.api.call('execute', {code: code})

			const isMember = res[0]
			const info = res[1]

			isMember.forEach(user => {
				this.addToCache(user.user_id, user)
			})

			info.forEach(user => {
				this.addToCache(user.id, user)
			})
		} catch (e) {
			this.onError(e)
		}
		this.lockQueue--
		this.processUpdates(updates)

		this.clearCache()
	}

	addToCache(id, data) {
		if (!this.userCache[id]) {
			this.userCache[id] = {}
			this.userInCacheCount++
		}

		this.userCache[id] = Object.assign({}, this.userCache[id], data)
		this.userCache[id].getContext = () => {
			if (!this.userContext[id]) {
				this.userContext[id] = {}
			}
			return this.userContext[id]
		}
		this.userCache[id].clearContext = () => {
			delete this.userContext[id]
		}
	}

	clearCache() {
		if (this.userInCacheCount < this.maxUsersInCache) {
			return
		}

		const times = []
		for (let key in this.userLastEvent) {
			if (this.userLastEvent.hasOwnProperty(key)) {
				times.push({ts: this.userLastEvent[key], id: key})
			}
		}

		times.sort((a, b) => {
			if (a.ts > b.ts) {
				return -1
			} else if (a.ts < b.ts) {
				return 1
			} else {
				return 0
			}
		})

		const lim = Math.floor(this.maxUsersInCache / 2)

		for (let i = 0; i < times.length && i < lim; i++) {
			delete this.userLastEvent[times[i].id]
			delete this.userCache[times[i].id]
		}
	}

	async sendMessage(peerId, message, attachments) {
		if (attachments && attachments.join) {
			attachments = attachments.join(',')
		}
		return await this.api.call("messages.send", {
			peer_id: peerId,
			message: message,
			attachment: attachments
		})
	}

	async sendActivity(peerId, type = 'typing') {
		return this.api.call('messages.setActivity', {peer_id: peerId, type: type})
	}

	async markAsRead(peerId) {
		return this.api.call('messages.markAsRead', {peer_id: peerId})
	}

	async markAsAnsweredConversation(peerId, answered = 1) {
		return this.api.call('messages.markAsAnsweredConversation', {peer_id: peerId, answered: answered})
	}

	async markAsImportantConversation(peerId, important = 1) {
		return this.api.call('messages.markAsImportantConversation', {peer_id: peerId, important: important})
	}

	async uploadPhoto(photo, peerId = undefined) {
		const buffer = await this.getBufferFromString(photo)
		const {upload_url} = await this.api.call("photos.getMessagesUploadServer", {peer_id: peerId})
		const data = await this.uploadBufferToUrl(upload_url, buffer, "photo", "image.png")
		const files = await this.api.call("photos.saveMessagesPhoto", {
			server: data.server,
			photo: data.photo,
			hash: data.hash,
		})
		return files.map(photo => {
			photo.attach_key = getAttachKey("photo", photo)
			return photo
		}).pop()
	}

	async uploadVoiceMessage(voiceMessage, peerId) {
		const baseFileName = (voiceMessage instanceof Buffer) ? "message.mp3" : path.basename(voiceMessage)
		return this.uploadDocument(voiceMessage, peerId, baseFileName, "audio_message")
	}

	async uploadDocument(document, peerId = undefined, title = null, docType = "doc") {
		const {upload_url} = await this.api.call("docs.getMessagesUploadServer", {type: docType, peer_id: peerId})
		const baseFileName = (document instanceof Buffer) ? title : path.basename(document)
		const buffer = await this.getBufferFromString(document)
		const data = await this.uploadBufferToUrl(upload_url, buffer, 'file', baseFileName)
		const file = await this.api.call('docs.save', {file: data.file, title: title || baseFileName})
		const attachKey = getAttachKey(docType, file[file.type])
		return {...file, attach_key: attachKey}
	}


	getBufferFromString(str) {
		if (str instanceof Buffer) {
			return new Promise(resolve => resolve(str))
		}
		if (str.indexOf('http') === 0) {
			return this.getBufferFromUrl(str)
		} else {
			return this.getBufferFromFile(str)
		}
	}

	getBufferFromUrl(url) {
		return new Promise((resolve, reject) => {
			const httpClient = url.indexOf('https') === 0 ? https : http
			httpClient.get(url, res => {
				const {statusCode} = res
				if (statusCode !== 200) {
					res.resume()
					reject(new Error("Cant download file, status: " + statusCode + " from url:" + url))
					return
				}

				let buffers = []
				res.on('data', (data) => {
					buffers.push(data)
				})
				res.on('end', () => {
					try {
						const buffer = Buffer.concat(buffers)
						resolve(buffer)
					} catch (e) {
						reject(e)
					}
				}).on('error', reject)
			})
		})
	}

	getBufferFromFile(fileName) {
		return new Promise((resolve, reject) => {
			fs.readFile(fileName, function (err, data) {
				if (err) {
					reject(err)
				} else {
					resolve(data)
				}
			})
		})
	}

	uploadBufferToUrl(uploadUrl, buffer, postFileName, fileName = undefined) {
		return new Promise((resolve, reject) => {
			request.post({
					url: uploadUrl,
					formData: {
						[postFileName]: {
							value: buffer,
							options: {
								filename: fileName
							}
						}
					}
				},
				(err, http, body) => {
					if (err) {
						reject(err)
					}
					const data = JSON.parse(body)
					if (data) {
						if (data.error) {
							reject(new Error("Fail upload file: " + data.error))
							return
						}
						resolve(data)
					} else {
						reject(new Error("[Upload error]: Server " + uploadUrl + " return " + body))
					}
				})
		})
	}
}

module.exports = Bot