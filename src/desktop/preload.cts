import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("reqwizitDesktop", {
  titleBarOverlay: process.platform === "win32",
  setTitleBarColors: (color: string, symbolColor: string): Promise<void> => ipcRenderer.invoke("reqwizit:title-bar-colors", color, symbolColor),
  chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke("reqwizit:choose-directory"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("reqwizit:open-external", url),
  quit: (): Promise<void> => ipcRenderer.invoke("reqwizit:quit"),
});
