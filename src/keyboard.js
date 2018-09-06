module.exports = {
	Keyboard, DefaultBtn, NegativeBtn, PositiveBtn, PrimaryBtn
}


function Keyboard(text, buttons, oneTime = false) {
	return {
		message: text,
		keyboard: JSON.stringify({
			one_time: oneTime,
			buttons: buttons,
		})
	}
}

function GetBtn(label, payload, color) {
	return {
		action: {
			type: "text",
			payload: JSON.stringify(payload),
			label: label
		},
		color: color
	}
}

function DefaultBtn(label, payload = null) {
	return GetBtn(label, payload || label, "default")
}

function NegativeBtn(label, payload = null) {
	return GetBtn(label, payload || label, "negative")
}

function PositiveBtn(label, payload = null) {
	return GetBtn(label, payload || label, "positive")
}

function PrimaryBtn(label, payload = null) {
	return GetBtn(label, payload || label, "primary")
}