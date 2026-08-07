const bus = require("../../../../../helpers/eventBus.js");
const { callbacks } = require("./shared.js");

let listenerAttached = false;

function ensureListener() {
    if (listenerAttached) return;
    listenerAttached = true;

    bus.on("code-suggest-request", (requestData) => {
        for (const [extensionName, cb] of callbacks) {
            try {
                cb(requestData);
            } catch (e) {
                console.error(`[code.suggest] ${extensionName} error:`, e.message);
            }
        }
    });
}

function callback(data) {
    const extensionName = data.extensionName;
    ensureListener();

    return (userCallback) => {
        if (typeof userCallback !== "function") return;
        callbacks.set(extensionName, userCallback);
    };
}

module.exports = { callback };
