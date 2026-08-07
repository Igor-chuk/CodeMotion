const { addEditorChangedCallback } = require("../../../dist/ipc/editor.js");
const { getEditorTriggeredData } = require("./__api.js");

// Track each extension's active subscription so re-registering replaces it
// instead of stacking another listener.
const unsubscribers = new Map();

function callback(data) {
    const cb = data.selfArgs[0];
    const mainSender = data.mainSender;
    const extensionName = data.extensionName;

    if (typeof cb !== "function") return;

    const previous = unsubscribers.get(extensionName);
    if (previous) previous();

    const unsubscribe = addEditorChangedCallback((rawData) => {
        cb(
            getEditorTriggeredData({
                data: rawData,
                mainSender
            })
        );
    });

    unsubscribers.set(extensionName, unsubscribe);
}

module.exports = { callback };
