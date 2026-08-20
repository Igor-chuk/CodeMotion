import { ipcMain, IpcMainInvokeEvent, shell } from "electron";
import { isUrlSafe } from "../helpers/urlValidator";

ipcMain.handle("open-in-browser", (_: IpcMainInvokeEvent, url: string) => {
    if (isUrlSafe(url)) {
        shell.openExternal(url);
    }
});