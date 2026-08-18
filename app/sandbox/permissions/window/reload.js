const { app, dialog } = require("electron");

async function callback(data) {
	const extName = data.extensionName

	const result = await dialog.showMessageBox(null, {
		title: "Reload application?",
		type: "question",
		message: `${extName} want to reload application`,
		detail: `The "${extName}"" extension is causing the app to reload`,
		buttons: [
			"Cancel",
			"Reload"
		]
	})

	const response = result.response

	if (response == 1) {
		app.relaunch();
  		app.exit(0);
	}
}

module.exports = { callback }
