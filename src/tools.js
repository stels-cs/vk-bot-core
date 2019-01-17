module.exports = {
	trimToken : function (token) {
		if (!token) {
			return token
		}
		token = token.toString()
		return token.substr(0, 5) + '...' + token.substr(-5)
	},
	LongPollSettings: {
		api_version:"5.92",
		enabled: 1,
		message_new: 0,
		message_reply: 0,
		message_allow: 0,
		message_deny: 0,
		message_edit: 0,
		message_typing_state: 0,
		photo_new: 0,
		audio_new: 0,
		video_new: 0,
		wall_reply_new: 0,
		wall_reply_edit: 0,
		wall_reply_delete: 0,
		wall_reply_restore: 0,
		wall_post_new: 0,
		wall_repost: 0,
		board_post_new: 0,
		board_post_edit: 0,
		board_post_restore: 0,
		board_post_delete: 0,
		photo_comment_new: 0,
		photo_comment_edit: 0,
		photo_comment_delete: 0,
		photo_comment_restore: 0,
		video_comment_new: 0,
		video_comment_edit: 0,
		video_comment_delete: 0,
		video_comment_restore: 0,
		market_comment_new: 0,
		market_comment_edit: 0,
		market_comment_delete: 0,
		market_comment_restore: 0,
		poll_vote_new: 0,
		group_join: 1,
		group_leave: 1,
		group_change_settings: 0,
		group_change_photo: 0,
		group_officers_edit: 0,
		user_block: 0,
		user_unblock: 0,
	},
	extractPeerFromUpdate(type, object) {
		if (!object) return null
		switch (type) {
			case "message_typing_state":
				return object.from_id
			case "message_new":
			case "message_reply":
			case "message_edit":
				return object.peer_id
			case "message_allow":
				return object.user_id
			case "user_id":
				return object.user_id
			case "photo_comment_new":
			case "photo_comment_edit":
			case "photo_comment_restore":
				return object.from_id > 0 ? object.from_id : null
			case "photo_comment_delete":
				return object.deleter_id
			case "audio_new":
				return object.owner_id
			case "group_change_photo":
				return object.user_id
			case "group_change_settings":
				return object.user_id
			case "group_officers_edit":
				return object.admin_id
			case "poll_vote_new":
				return object.user_id
			case "user_block":
				return object.user_id
			case "group_join":
				return object.user_id
			case "group_leave":
				return object.user_id
			case "wall_reply_new":
			case "video_comment_new":
				return object.from_id > 0 ? object.from_id : null
		}
		return null
	},
	extractUserIdFromUpdate(type, object) {
		if (!object) return null
		switch (type) {
			case "message_typing_state":
				return object.from_id
			case "message_new":
			case "message_reply":
			case "message_edit":
				return object.from_id
			case "message_allow":
				return object.user_id
			case "user_id":
				return object.user_id
			case "photo_comment_new":
			case "photo_comment_edit":
			case "photo_comment_restore":
				return object.from_id > 0 ? object.from_id : null
			case "photo_comment_delete":
				return object.deleter_id
			case "audio_new":
				return object.owner_id
			case "group_change_photo":
				return object.user_id
			case "group_change_settings":
				return object.user_id
			case "group_officers_edit":
				return object.admin_id
			case "poll_vote_new":
				return object.user_id
			case "user_block":
				return object.user_id
			case "group_join":
				return object.user_id
			case "group_leave":
				return object.user_id
			case "wall_reply_new":
			case "video_comment_new":
				return object.from_id > 0 ? object.from_id : null
		}
		return null
	},
	isStartWithCommand(text, command) {
		if (!command || !command.length || command.length > text.length) {
			return false
		}
		if (text.indexOf(command.toLowerCase()) === 0) {
			if (text.length === command.length) {
				return true
			}
			return text[command.length] === ' ';
		} else {
			return false
		}
	},
	getAttachKey(type, object) {
		return type + object['owner_id'] + "_" + object['id'] + "_" + ( object['access_key'] ? ("_" + object['access_key']) : "" )
	}
}