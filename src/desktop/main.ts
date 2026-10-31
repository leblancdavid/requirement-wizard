import { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell } from "electron";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultDataDirectory } from "../storage/paths.js";
import { DesktopBackend } from "./backend-host.js";
import { desktopSplash } from "./splash.js";
import { startupLabels, type StartupPhase } from "../core/startup.js";

app.setName("Reqwizit");
const args = process.argv.slice(1);
function argument(name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}.`);
  return value;
}
const directory = resolve(argument("--data-dir") ?? defaultDataDirectory());
// Keep Chromium profiles separate from portable project files; one instance per data directory.
app.setPath("userData", join(directory, "desktop"));
let window: BrowserWindow | undefined;
let backend: DesktopBackend | undefined;
let shuttingDown = false;
let finished = false;
let startup: Promise<void> = Promise.resolve();

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  // Stop renderer requests immediately, then await cancellation and durable job cleanup.
  window?.destroy();
  try { await startup; await backend?.close(); }
  catch { process.exitCode = 1; }
  finally {
    finished = true; app.quit();
  }
}
async function external(url: string) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Only web links can be opened.");
  return shell.openExternal(parsed.href);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (window?.isMinimized()) window.restore(); window?.show(); window?.focus(); });
  app.on("before-quit", (event) => { if (!finished) { event.preventDefault(); void shutdown(); } });
  app.on("window-all-closed", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
  startup = app.whenReady().then(async () => {
    if (shuttingDown) return;
    const browserSession = session.defaultSession;
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    window = new BrowserWindow({
      title: "Reqwizit", width: 1360, height: 920, minWidth: 800, minHeight: 600,
      show: false, autoHideMenuBar: true,
      icon: join(app.getAppPath(), "assets", process.platform === "win32" ? "reqwizit.ico" : "reqwizit.png"),
      ...(process.platform === "win32" ? { titleBarStyle: "hidden" as const, titleBarOverlay: { color: "#315f45", symbolColor: "#ffffff", height: 36 } } : {}),
      webPreferences: { preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)), nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false },
    });
    window.removeMenu();
    window.on("close", (event) => { event.preventDefault(); void shutdown(); });
    window.webContents.on("render-process-gone", () => { void shutdown(); });
    window.webContents.on("will-attach-webview", (event) => event.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(desktopSplash)}`);
    if (shuttingDown) return;
    window.show();
    const startedAt = Date.now();
    let workspaceReady = false;
    const progress = (phase: StartupPhase) => {
      console.info(`Startup: ${phase} (${Date.now() - startedAt} ms)`);
      if (window && !shuttingDown && window.webContents.getURL().startsWith("data:text/html"))
        void window.webContents.executeJavaScript(`{ const target = document.getElementById('startup-detail'); if (target) target.textContent = ${JSON.stringify(startupLabels[phase])}; }`).catch(() => {});
    };
    // Stable preferred origin retains Chromium UI preferences. A busy browser port
    // must not prevent the desktop from opening its own authenticated backend.
    backend = new DesktopBackend(directory, join(app.getAppPath(), "web"), () => {
      if (!shuttingDown) {
        if (window && workspaceReady) dialog.showErrorBox("Reqwizit stopped unexpectedly", "Reopen the app to continue. Previously saved work is still available; check whether your latest changes were saved before continuing.");
        setImmediate(() => { void shutdown(); });
      }
    }, undefined, progress);
    const origin = await backend.ready;
    if (shuttingDown) return;
    progress("loading-interface");
    const trusted = (event: Electron.IpcMainInvokeEvent) => {
      if (!window || shuttingDown || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error("Invalid desktop request.");
    };
    ipcMain.handle("reqwizit:choose-directory", async (event) => {
      trusted(event);
      const result = await dialog.showOpenDialog(window!, { title: "Choose project folder", properties: ["openDirectory", "createDirectory"] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("reqwizit:open-external", async (event, url: unknown) => {
      trusted(event);
      if (typeof url !== "string" || url.length > 12000) throw new Error("Invalid web link.");
      await external(url);
    });
    ipcMain.handle("reqwizit:quit", (event) => {
      trusted(event);
      void shutdown();
    });
    ipcMain.handle("reqwizit:copy-text", async (event, text: unknown) => {
      trusted(event);
      if (typeof text !== "string" || text.length > 4_000_000) throw new Error("Invalid clipboard text.");
      await clipboard.writeText(text);
    });
    ipcMain.handle("reqwizit:title-bar-colors", (event, color: unknown, symbolColor: unknown) => {
      trusted(event);
      if (typeof color !== "string" || typeof symbolColor !== "string" || !/^#[0-9a-f]{6}$/i.test(color) || !/^#[0-9a-f]{6}$/i.test(symbolColor)) throw new Error("Invalid title bar colors.");
      if (process.platform === "win32") window!.setTitleBarOverlay({ color, symbolColor, height: 36 });
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      void external(url).catch(() => {});
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (new URL(url).origin !== origin) { event.preventDefault(); void external(url).catch(() => {}); }
    });
    await window.loadURL(origin);
    workspaceReady = true;
    if (!shuttingDown) window.show();
  }).catch((error: unknown) => {
    if (!shuttingDown) dialog.showErrorBox("Reqwizit could not start", error instanceof Error ? error.message : "Unknown startup error.");
    // Schedule after startup settles so shutdown never awaits itself.
    setImmediate(() => { void shutdown(); });
  });
}
