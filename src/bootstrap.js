const VkApi = require('./api')

/**
 * @param token
 * @return {Promise<{api: VkApi, group}>}
 */
module.exports = async function bootstrap(token) {
	if (!token) {
		throw new Error("No token passed")
	}

	const api = new VkApi(token)
	const group = await api.call('groups.getById', {fields: "screen_name"})

	return {api, group:group[0]}
}