const { Time } = require("./__api")

function callback(data) {
	return () => {
		return Time.now()
	}
}

module.exports = { callback }
