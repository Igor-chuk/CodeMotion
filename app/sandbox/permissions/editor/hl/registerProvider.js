const { addEditorChangedCallback } = require("../../../../dist/ipc/editor.js");
const { getEditorTriggeredData } = require("../__api.js")

const providers = new Map();
let listenerAttached = false;
let currentMainSender = null;

function ensureListener() {
    if (listenerAttached) return;
    listenerAttached = true;

    // Registered exactly once — iterates every provider on each editor change.
    // Previously this ran on every registerProvider() call, adding a listener
    // (and an O(providers^2) fan-out) each time.
    addEditorChangedCallback((editorData) => {
        const fileId = editorData.editorId;
        const allRules = [];

        for (const [providerID, cb] of providers) {
            const providerData = getEditorTriggeredData({
                data: editorData,
                mainSender: currentMainSender
            });

            delete providerData["api"]

            const result = cb(providerData);
            if (!Array.isArray(result)) continue;

            for (const item of result) {
                if (!item || typeof item !== "object") continue;

                if (
                    typeof item.id !== "string" ||
                    typeof item.regex !== "string" ||
                    typeof item.token !== "string"
                ) continue;

                allRules.push({
                    id: `${providerID}_${item.id}`,
                    regex: item.regex,
                    token: item.token
                });
            }
        }

        applyRules({ fileId, rules: allRules, mainSender: currentMainSender });
    });
}

function callback(data) {
    const providerID = data.selfArgs[0];
    const cb = data.selfArgs[1];

    if (typeof cb !== "function") return;

    currentMainSender = data.mainSender;
    providers.set(providerID, cb);
    ensureListener();
}

function applyRules({ fileId, rules, mainSender }) {
    if (!mainSender) return;
    mainSender.send("on-editor-change-new-hl-rules", {
        fileId: fileId,
        rules: rules
    });
}

module.exports = { callback };
