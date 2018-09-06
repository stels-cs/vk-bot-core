const {trimToken} = require("./tools")

const axios = require('axios')
const qs = require('qs')

module.exports = class VkApi {

	constructor(token, lang = 'ru', version = '5.84') {
		this.lang = lang
		this.version = version
		this.token = token
		this.http = axios.create({
			timeout: 1000 * 60 * 5,
		})
	}

	paramsToString(params) {
		let parts = []
		for (let key in params) {
			if (params.hasOwnProperty(key)) {
				if (key === 'access_token') {
					parts.push( key + ":" + trimToken(params[key]) )
				} else {
					parts.push( key + ":" + params[key] )
				}
			}
		}
		return parts.join(",")
	}

	call(method, params = {}, raw = false) {
		if (!params.v) {
			params.v = this.version
		}

		if (!params.lang) {
			params.lang = this.lang
		}

		if (!params.access_token) {
			params.access_token = this.token
		}

		return this.http.post(`https://api.vk.com/method/${method}`, qs.stringify(params))
			.then( response => {
				const {data, status, headers} = response

				if (status !== 200) {
					const e = new Error("Bad response status " + status)
					e.data = data
					e.headers = headers
					throw e
				}

				if (typeof data.response !== "undefined") {
					if (raw) {
						return data
					} else {
						return data.response
					}
				} else if (typeof data.error !== "undefined") {
					const msg = `VkApiError: ${method} #${data.error.error_code} ${data.error.error_msg} \n`+this.paramsToString(params)
					const e = new Error(msg)
					throw Object.assign(e, response.error)
				} else {
					throw data
				}
			} )
	}
}