const { Time } = require("./__api")

function callback(data) {
	const format = data.selfArgs[0]
	const date = data.selfArgs[1]

	return () => {
		return Time.format(format, date)
	}
}

module.exports = { callback }
