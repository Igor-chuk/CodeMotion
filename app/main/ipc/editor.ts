import { ipcMain } from "electron";

type EditorData = {
    editorId: string;
    [key: string]: any;
};

type Listener = (data: any) => void;

const changedListeners = new Set<Listener>();
const clickedListeners = new Set<Listener>();

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

export function addEditorChangedCallback(cb: Listener): () => void {
    changedListeners.add(cb);
    return () => changedListeners.delete(cb);
}

export function addEditorClickedCallback(cb: Listener): () => void {
    clickedListeners.add(cb);
    return () => clickedListeners.delete(cb);
}
