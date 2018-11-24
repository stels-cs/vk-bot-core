const bootstrap = require('./bootstrap')
const LongPoll = require('./longPoll')
const Router = require('./router')
const VkApi = require('./api')
const request = require('request')
const http = require('http')
const https = require('https')
const path = require('path')
const fs = require("fs")

const {LongPollSettings, trimToken, extractPeerFromUpdate} = require('./tools')

class Bot {

	constructor(token) {
		this.token = token
		this.api = new VkApi(token)
		this.router = new Router(this.api)
		this.onError = console.error
		this.onUpdate = () => {
		}
		this.on = this.router.on.bind(this.router)
		this.command = (command, callback) => {
			this.on("message_new", msg => msg.HasCommand(command), callback)
		}

		this.userCache = {}
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
		}

		this.logAllEvents = false
		this.dispatchUpdates = updates => {
			if (this.fetchUser) {
				const ids = updates
					.reduce((arr, update) => {
						const peerId = extractPeerFromUpdate(update.type, update['object'])
						if (peerId && peerId > 0 && peerId < 2e9) {
							if (this.userCache[peerId] === undefined) {
								return arr.concat([peerId])
							}
						}
						return arr
					}, [])

				if (ids.length) {
					this.fillCache(ids, updates).then(() => {})
					return
				}
			}
			this.processUpdates(updates)
		}

		this.dispatch = update => this.dispatchUpdates([update])
	}

	start() {

		this.fetchFieldsForUser.forEach(key => {
			this.emptyUser[key] = ""
		})


		return bootstrap(this.token)
			.then(async ({api, group, unread_messages, permissions}) => {

				const welcome = `Бот запущен в группе ${group.name} https://vk.com/${group.screen_name}\n`
					+ `Непрочитанных сообщений: ${unread_messages}`
				console.info(welcome)

				this.groupId = group.id
				this.groupName = group.name
				this.groupScreen = group.screen_name

				const rights = `Права доступа: ${permissions.mask} ${permissions.permissions.map(x => x.name).join(", ")}`
				console.info(rights)

				//https://vk.com/dev/permissions
				const MANAGE_PERMISSION = 262144

				if ((permissions.mask & MANAGE_PERMISSION) !== MANAGE_PERMISSION) {
					throw new Error("У этого ключа " + trimToken(api.token) + " нет прав на упраление группой, запуск бота невозможен! No manage permission!")
				}

				const requestedEvents = {}
				for (let key in this.router.listeners) {
					if (this.router.listeners.hasOwnProperty(key)) {
						requestedEvents[key] = 1
					}
				}

				const params = Object.assign({}, {...LongPollSettings, group_id: group.id}, requestedEvents)

				await api.call("groups.setLongPollSettings", params)

				const lp = new LongPoll(api, group.id)

				lp.onError = this.onError
				lp.onUpdates = this.dispatchUpdates

				lp.start().catch(e => {
					console.log("BOT ERROR: Long poll: " + e.message)
					console.error(e)
				})
			})
			.catch(e => {
				console.log("BOT START FAILED: " + e.message)
				console.error(e)
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

		/**
		 * @return {boolean}
		 */
		update["object"].HasText = function (text) {
			if (this.text) {
				if (Array.isArray(text)) {
					const t = this.text.toString().toLowerCase()
					for (let i = 0; i < text.length; i++) {
						if (t.indexOf(text[i].toString().toLowerCase()) !== -1) {
							return true
						}
					}
					return false
				} else {
					return this.text.toString().toLowerCase().indexOf(text.toString().toLowerCase()) !== -1
				}
			} else {
				return false
			}
		}
		update["object"].__user = this.userCache[extractPeerFromUpdate(update.type, update['object'])]


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
			let text = (this.text || "").trim()
			if (this.HasMention()) {
				text = text.replace(`[club${self.groupId}|`, '').trim()
			}
			if (typeof command === 'string') {
				return text.toLowerCase().indexOf(command.toLowerCase()) === 0
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
		if (this.logAllEvents) {
			console.debug((new Date()).toDateString() + ": " + JSON.stringify(update))
		}
		if (update.type === 'group_join' && this.userCache[update['object'].user_id]) {
			this.userCache[update['object'].user_id].member = 1
		}

		if (update.type === 'group_leave' && this.userCache[update['object'].user_id]) {
			this.userCache[update['object'].user_id].member = 0
		}

		this.fillUpdate(update)
		this.onUpdate(update)

		try {
			this.router.dispatch(update.type, update['object'])
		} catch (e) {
			this.onError(e)
		}

		if (this.fetchUser) {
			const peerId = extractPeerFromUpdate(update.type, update['object'])

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

	messageTo(peerId, message, attachments) {
		if (attachments && attachments.join) {
			attachments = attachments.join(',')
		}
		this.api.call("messages.send", {
			peer_id: peerId,
			message: message,
			attachment: attachments
		})
	}

	uploadPhotoBufferToPeer(peerId, buffer) {
		return new Promise((resolve, reject) => {
			this.api.call("photos.getMessagesUploadServer", {peer_id: peerId})
				.then(({upload_url}) => {
					this.uploadBufferToUrl(upload_url, buffer, "photo", "image.png")
						.then( data => this.api.call("photos.saveMessagesPhoto", {
								server: data.server,
								photo: data.photo,
								hash: data.hash,
							}))
						.then(photos => {
							resolve(photos.map(photo => {
								photo.attach_key = "photo" + photo.owner_id + "_" + photo.id + "_" + photo.access_key
								return photo
							}).pop())
						}).catch(reject)
				})
				.catch(reject)
		})
	}

	uploadPhotoToPeer(peerId, url) {
		return new Promise((resolve, reject) => {
			this.getBufferFromString(url)
				.then(buffer => this.uploadPhotoBufferToPeer(peerId, buffer))
				.then(resolve)
				.catch(reject)
		})
	}

	async uploadToVoiceMessage(peerId, fileName) {
		const {upload_url} = await this.api.call("docs.getMessagesUploadServer", {type:"audio_message", peer_id: peerId})
		const baseFileName = (fileName instanceof Buffer) ? "message.mp3" : path.basename(fileName)
		const buffer = await this.getBufferFromString(fileName)
		const data = await this.uploadBufferToUrl(upload_url, buffer, 'file', baseFileName)
		const [file] = await this.api.call('docs.save', {file:data.file,title:baseFileName})
		const attachKey = "audio_message"+file.owner_id + '_' + file.id + ( file.access_key ? ("_" + file.access_key) : "" )
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

				let buffers = [];
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
		return new Promise( (resolve,reject) => {
			fs.readFile(fileName, function (err, data) {
				if (err) {
					reject(err)
				} else {
					resolve(data)
				}
			})
		} )
	}

	uploadBufferToUrl( uploadUrl, buffer, postFileName, fileName = undefined) {
		return new Promise( (resolve, reject) => {
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
		} )
	}
}

module.exports = Bot