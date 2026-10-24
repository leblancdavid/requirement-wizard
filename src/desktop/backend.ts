import { parentPort, workerData } from "node:worker_threads";
import { join } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { ConnectionManager } from "../providers/connections.js";
import { CredentialStore } from "../providers/credentials.js";
import { ConnectedDiscovery } from "../providers/discovery.js";
import { OpenCodeDiscovery } from "../runtime/discovery.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { startApp } from "../web/server.js";

if (!parentPort) throw new Error("Desktop backend requires an owning worker.");
const port = parentPort;
const { directory, staticDir } = workerData as { directory: string; staticDir: string };
let store: ProjectStore | undefined;
let backend: Awaited<ReturnType<typeof startApp>> | undefined;
let closing: Promise<void> | undefined;

async function start() {
  store = new ProjectStore(join(directory, "projects.sqlite"));
  store.recoverExpiredJobs();
  const connections = new ConnectionManager(new CredentialStore(join(directory, "providers")));
  const options = { store, connections, catalog: new OpenCodeCatalog(join(directory, "runtime")), adapter: new ConnectedDiscovery(connections, new OpenCodeDiscovery(join(directory, "runtime"))), staticDir };
  try { backend = await startApp({ ...options, port: 4318 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    backend = await startApp({ ...options, port: 0 });
  }
  port.postMessage({ type: "ready", origin: backend.origin });
}

// Register ownership before startup; a close during synchronous initialization is
// handled once the worker yields, never by terminating another app's processes.
port.on("message", (message: unknown) => {
  if (message && typeof message === "object" && "type" in message && message.type === "close") void close();
});
const startup = start();
async function close() {
  if (closing) return closing;
  closing = (async () => {
    try { await startup; } catch { process.exitCode = 1; }
    try { await backend?.close(); } catch { process.exitCode = 1; }
    try { store?.close(); } catch { process.exitCode = 1; }
    port.close();
  })();
  return closing;
}
void startup.catch(() => close());
