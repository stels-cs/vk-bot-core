const {extractPeerFromUpdate} = require("./tools")

class Router {


	constructor(api) {
		this.listeners = {}
		this.api = api
	}

	on(type, filter, callback) {
		if (this.listeners[type] === undefined) {
			this.listeners[type] = []
		}

		if (callback === undefined) {
			callback = filter
			filter = () => true
		}

		this.listeners[type].push( {filter, callback} )
	}

	dispatch(type, object) {
		let listeners = this.listeners[type]
		if (listeners !== undefined) {
			for (let i = 0; i < listeners.length; i++) {
				const filter = listeners[i].filter
				if (filter(object)) {
					const response = listeners[i].callback(object, this.api)
					this.response( response, type, object )
					return
				}
			}
		}
	}

	response( res, type, update ) {
		if (typeof res === "string") {
			res = {message: res}
		}

		if (typeof res === "object") {
			if (res instanceof Promise) {
				res.then( some => {
					this.response(some, type, update)
				} )
			} else {
				const peerId = extractPeerFromUpdate(type, update)
				if (peerId) {
					res.peer_id = peerId
					this.api.call("messages.send", res)
						.then( () => {} )
						.catch( e => console.error(e) )
				}
			}
		}
	}
}

module.exports = Router