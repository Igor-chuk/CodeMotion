const { setEditorClickedCallback } = require("../../../main/ipc/editor.ts")
const { getAceTriggeredData } = require("./__api.js")

function callback(data) {
    const cb = data.selfArgs[0];
    const mainSender = data.mainSender;

    if (typeof cb !== "function") return;

    setEditorClickedCallback((rawData) => {
        cb(getAceTriggeredData({
            data: rawData,
            mainSender
        }));
    });
}

module.exports = { callback };
