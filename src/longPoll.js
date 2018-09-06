const axios = require('axios')

module.exports = class LongPoll {


	constructor(api, groupId, ts = null) {
		this.api = api
		this.ts = ts
		this.grpupId = groupId
		this._stop = false
		this.http = axios.create({
			timeout: 1000 * 60 * 5,
		})
		this.onError = function () {}
		this.onUpdates = function () {}
	}

	async start() {

		this._stop = false

		while (!this._stop) {

			const server = await this.api.call("groups.getLongPollServer", {group_id:this.grpupId})

			if (this.ts === null) {
				this.ts = server.ts
			}

			try {
				await this.loop(server.server, server.key)
			} catch (e) {
				if (e.request && e.config) {
					if (e.response) {
						const networkError = new Error(`VKLongPoll Network error: ${e.message}\n${e.response.status} ${e.response.statusText}\n${e.config.url}`)
						this.onError(networkError)
					} else {
						const networkError = new Error(`VKLongPoll Network error: ${e.code} ${e.message}\n${e.config.url}`)
						this.onError(networkError)
					}
				} else {
					this.onError(e)
				}
			}

		}

	}

	async loop(server, key) {

		while (!this._stop) {
			const url = `${server}?act=a_check&key=${key}&ts=${this.ts}&wait=25`

			const response = await this.http.get(url)

			if (response.status !== 200 || !response.data) {
				const e = new Error(`Bad response status ${response.status} for ${url} on data empty`)
				throw Object.assign(e, response)
			}

			const {ts, updates, failed} = response.data

			if (!failed) {
				this.ts = ts
				this.onUpdates(updates)
			} else {
				switch (parseInt(failed, 10)) {
					case 1:
						this.ts = ts
						break
					case 2:
						return
					case 3:
						return
					default:
						throw new Error(`Unknown failed value ${failed} raw: ${JSON.stringify(response.data)}`)
				}
			}
		}

	}

	stop() {
		this._stop = true
	}
}