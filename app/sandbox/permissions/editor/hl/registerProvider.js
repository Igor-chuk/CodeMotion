const { addEditorChangedCallback } = require("../../../../dist/ipc/editor.js");
const { getEditorTriggeredData } = require("../__api.js")

const providers = new Map();
let listenerAttached = false;
let currentMainSender = null;

// Debounce editor changes so rapid typing doesn't re-run every provider (and
// re-send rules over IPC) on every keystroke; recompute once typing settles.
const DEBOUNCE_MS = 150;
let debounceTimer = null;
let lastEditorData = null;

// Cache the last rule set sent per file so we skip the IPC round-trip (and the
// renderer re-highlighting the whole document) when nothing actually changed.
const lastRulesSignatureByFile = new Map();

function computeRules(editorData) {
    const allRules = [];

    for (const [providerID, cb] of providers) {
        const providerData = getEditorTriggeredData({
            data: editorData,
            mainSender: currentMainSender
        });
        delete providerData["api"];

        let result;
        try {
            result = cb(providerData);
        } catch (e) {
            continue;
        }
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

    return allRules;
}

function flush() {
    debounceTimer = null;
    const editorData = lastEditorData;
    if (!editorData) return;

    const fileId = editorData.editorId;
    const rules = computeRules(editorData);
    const signature = JSON.stringify(rules);

    if (lastRulesSignatureByFile.get(fileId) === signature) return; // unchanged -> skip
    lastRulesSignatureByFile.set(fileId, signature);

    if (currentMainSender && !currentMainSender.isDestroyed()) {
        currentMainSender.send("on-editor-change-new-hl-rules", { fileId, rules });
    }
}

function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, DEBOUNCE_MS);
}

function ensureListener() {
    if (listenerAttached) return;
    listenerAttached = true;

    // Registered once — coalesced fan-out to every provider.
    addEditorChangedCallback((editorData) => {
        lastEditorData = editorData;
        schedule();
    });
}

function callback(data) {
    const providerID = data.selfArgs[0];
    const cb = data.selfArgs[1];

    if (typeof cb !== "function") return;

    currentMainSender = data.mainSender;
    providers.set(providerID, cb);
    ensureListener();

    // A new provider changes the rule set: drop the cache and recompute against
    // the latest known editor state so it applies without waiting for a keystroke.
    lastRulesSignatureByFile.clear();
    if (lastEditorData) schedule();
}

module.exports = { callback };
