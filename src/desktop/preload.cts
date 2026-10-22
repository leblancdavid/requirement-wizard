import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("reqwizitDesktop", {
  chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke("reqwizit:choose-directory"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("reqwizit:open-external", url),
  quit: (): Promise<void> => ipcRenderer.invoke("reqwizit:quit"),
});
