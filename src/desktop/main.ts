import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectStore } from "../storage/store.js";
import { defaultDataDirectory } from "../storage/paths.js";
import { ConnectionManager } from "../providers/connections.js";
import { CredentialStore } from "../providers/credentials.js";
import { ConnectedDiscovery } from "../providers/discovery.js";
import { OpenCodeDiscovery } from "../runtime/discovery.js";
import { startApp } from "../web/server.js";

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
let store: ProjectStore | undefined;
let backend: Awaited<ReturnType<typeof startApp>> | undefined;
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
    try { store?.close(); } catch { process.exitCode = 1; }
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
    store = new ProjectStore(join(directory, "projects.sqlite"));
    store.recoverExpiredJobs();
    const connections = new ConnectionManager(new CredentialStore(join(directory, "providers")));
    const options = { store, connections, adapter: new ConnectedDiscovery(connections, new OpenCodeDiscovery(join(directory, "runtime"))), staticDir: join(app.getAppPath(), "web") };
    // Stable preferred origin retains Chromium UI preferences. A busy browser port
    // must not prevent the desktop from opening its own authenticated backend.
    try { backend = await startApp({ ...options, port: 4318 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
      backend = await startApp({ ...options, port: 0 });
    }
    if (shuttingDown) return;
    const origin = backend.origin;
    const browserSession = session.defaultSession;
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    window = new BrowserWindow({
      title: "Reqwizit", width: 1360, height: 920, minWidth: 800, minHeight: 600,
      show: false, autoHideMenuBar: true,
      webPreferences: {
        preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
        nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false,
      },
    });
    window.removeMenu();
    const trusted = (event: Electron.IpcMainInvokeEvent) => {
      if (!window || shuttingDown || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error("Invalid desktop request.");
    };
    ipcMain.handle("reqwizit:choose-directory", async (event) => {
      trusted(event);
      const result = await dialog.showOpenDialog(window!, { title: "Choose project workspace", properties: ["openDirectory", "createDirectory"] });
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
    window.webContents.setWindowOpenHandler(({ url }) => {
      void external(url).catch(() => {});
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (new URL(url).origin !== origin) { event.preventDefault(); void external(url).catch(() => {}); }
    });
    window.webContents.on("will-attach-webview", (event) => event.preventDefault());
    window.on("close", (event) => { event.preventDefault(); void shutdown(); });
    window.webContents.on("render-process-gone", () => { void shutdown(); });
    await window.loadURL(origin);
    if (!shuttingDown) window.show();
  }).catch((error: unknown) => {
    if (!shuttingDown) dialog.showErrorBox("Reqwizit could not start", error instanceof Error ? error.message : "Unknown startup error.");
    // Schedule after startup settles so shutdown never awaits itself.
    setImmediate(() => { void shutdown(); });
  });
}
