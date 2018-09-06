const VkApi = require('./api')

/**
 * @param token
 * @return {Promise<{api: VkApi, group, unread_messages: Number}>}
 */
module.exports = async function bootstrap(token) {

	if (!token) {
		throw new Error("No token passed")
	}

	const api = new VkApi(token)
	const group = await api.call('groups.getById', {fields: "screen_name"})
	const unread = await api.call('messages.getConversations', {filter: 'unread', count: 1})
	const permissions = await api.call("groups.getTokenPermissions")

	return {api, group:group[0], unread_messages:unread.count, permissions}
}