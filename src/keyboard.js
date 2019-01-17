module.exports = {
	Keyboard, DefaultBtn, NegativeBtn, PositiveBtn, PrimaryBtn
}


function Keyboard(text, buttons, oneTime = false) {
	if (!Array.isArray(buttons)) {
		throw new Error("Second parameter must be array of buttons")
	}
	buttons = buttons.map( line => {
		if (!Array.isArray(line)) {
			line = [line]
		}
		return line.map( btn => {
			if (btn && btn.action && btn.color) {
				return btn
			} else {
				return GetBtn(btn || "", "", 'default')
			}
		} )
	} )
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
	return GetBtn(label, payload || "", "default")
}

function NegativeBtn(label, payload = null) {
	return GetBtn(label, payload || "", "negative")
}

function PositiveBtn(label, payload = null) {
	return GetBtn(label, payload || "", "positive")
}

function PrimaryBtn(label, payload = null) {
	return GetBtn(label, payload || "", "primary")
}