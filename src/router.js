const {extractPeerFromUpdate} = require("./tools")

class Router {


	constructor(api) {
		this.listeners = {}
		this.api = api
		this.onResponse = () => {
		}
	}

	on(type, filter, callback) {
		if (this.listeners[type] === undefined) {
			this.listeners[type] = []
		}

		if (callback === undefined) {
			callback = filter
			filter = () => true
		}

		if (typeof filter === 'string') {
			const str = filter
			filter = msg => msg.HasText(str)
		}

		if (typeof filter === 'object' || filter instanceof RegExp) {
			const str = filter
			filter = msg => msg.HasText(str)
		}

		if (typeof callback === 'string') {
			const str = callback
			if (str.indexOf('{first_name}') !== -1 || str.indexOf('{last_name}') !== -1) {
				callback = msg => str
					.replace('{first_name}', msg.GetUser().first_name)
					.replace('{last_name}', msg.GetUser().last_name)
			} else {
				callback = () => str
			}
		} else if (typeof callback === 'object' && callback.keyboard) {
			const keyboardMessage = callback
			const str = keyboardMessage.message
			if (str.indexOf('{first_name}') !== -1 || str.indexOf('{last_name}') !== -1) {
				callback = msg => {
					keyboardMessage.message = str
						.replace('{first_name}', msg.GetUser().first_name)
						.replace('{last_name}', msg.GetUser().last_name)
					return keyboardMessage
				}
			} else {
				callback = () => keyboardMessage
			}

		}

		this.listeners[type].push({filter, callback})
	}

	onNextMessage(peerId, filter, callback, persistence = false) {
		const type = "message_new"
		if (this.listeners[type] === undefined) {
			this.listeners[type] = []
		}

		if (callback === undefined) {
			callback = filter
			filter = () => true
		}

		this.listeners[type].unshift({filter, callback, peerId, persistence})
	}

	removeEventListener(type, _filter, _callback) {
		if (this.listeners[type] === undefined) {
			this.listeners[type] = []
		}

		if (_callback === undefined) {
			_callback = filter
			_filter = null
		}

		this.listeners[type] = this.listeners[type].filter(({filter, callback}) => {
			if (callback === _callback) {
				if (!_filter || filter === _filter) {
					return false
				}
			}
			return true
		})
	}

	removePeerIdListener(_peerId) {
		const type = "message_new"
		if (this.listeners[type] === undefined) {
			this.listeners[type] = []
		}

		this.listeners[type] = this.listeners[type].filter(({peerId}) => {
			return _peerId !== peerId
		})
	}

	dispatch(type, object) {
		let listeners = this.listeners[type]
		if (listeners !== undefined) {
			for (let i = 0; i < listeners.length; i++) {
				const filter = listeners[i].filter
				if (listeners[i].peerId) {
					if (object.peer_id === listeners[i].peerId) {
						if (listeners[i].persistence === false) {
							this.removePeerIdListener(listeners[i].peerId)
						}
					} else {
						continue
					}
				}
				if (filter(object)) {
					const response = listeners[i].callback(object, this.api)
					this.response(response, type, object)
					return
				}
			}
		}
	}

	response(res, type, object) {
		if (typeof res === "string") {
			res = {message: res}
		}

		if (typeof res === "object" && res !== null) {
			if (res instanceof Promise) {
				res.then(some => {
					this.response(some, type, object)
				})
			} else {
				const peerId = extractPeerFromUpdate(type, object)
				if (peerId) {
					res.peer_id = peerId
					res.random_id = 0
					this.api.call("messages.send", res)
						.then(() => {
						})
						.catch(e => this.onSendMessageError(res, e))
					if (this.onResponse) {
						this.onResponse(res)
					}
				}
			}
		} else if (typeof res === "function") {
			this.response( res(object, this.api), type, object )
		}
	}

	onSendMessageError(params, error) {
		console.error("Cant send message with params "+JSON.stringify(params), error)
	}
}

module.exports = Router