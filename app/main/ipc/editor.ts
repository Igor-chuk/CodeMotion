import { ipcMain } from "electron";

type EditorData = {
    editorId: string;
    [key: string]: any;
};

type Listener = (data: any) => void;

// Multiple consumers (onChange, onClick, highlight providers, …) can subscribe.
// Previously a single module-level slot meant each new consumer silently
// overwrote the last one, so only one ever fired.
const changedListeners = new Set<Listener>();
const clickedListeners = new Set<Listener>();

// Registered once for the process — fans a single IPC event out to every listener.
ipcMain.on("editor-changed-event", (_: any, data: EditorData) => {
    for (const cb of [...changedListeners]) {
        try { cb(data); } catch (err) { console.error("editor-changed listener error:", err); }
    }
});

ipcMain.on("editor-clicked-event", (_: any, data: any) => {
    for (const cb of [...clickedListeners]) {
        try { cb(data); } catch (err) { console.error("editor-clicked listener error:", err); }
    }
});

ipcMain.on("file-opened-event", () => {

});

// Each returns an unsubscribe function so callers can drop their listener
// (e.g. when an extension re-registers or unloads) instead of leaking it.
export function addEditorChangedCallback(cb: Listener): () => void {
    changedListeners.add(cb);
    return () => changedListeners.delete(cb);
}

export function addEditorClickedCallback(cb: Listener): () => void {
    clickedListeners.add(cb);
    return () => clickedListeners.delete(cb);
}
