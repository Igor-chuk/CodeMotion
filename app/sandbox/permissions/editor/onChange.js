const { setEditorChangedCallback } = require("../../../main/ipc/editor.ts");
const { getEditorTriggeredData } = require("./__api.js");

function callback(data) {
    const cb = data.selfArgs[0];
    const mainSender = data.mainSender;

    if (typeof cb !== "function") return;

    setEditorChangedCallback((rawData) => {
        cb(
            getEditorTriggeredData({
                data: rawData,
                mainSender
            })
        );
    });
}

module.exports = { callback };
