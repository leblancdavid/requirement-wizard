import { Worker } from "node:worker_threads";

/** Own the service worker without running SQLite/export work on Electron's event loop. */
export class DesktopBackend {
  readonly ready: Promise<string>;
  private readonly worker: Worker;
  private readonly exited: Promise<void>;
  private closing = false;

  constructor(directory: string, staticDir: string, onFailure: () => void, entry = new URL("./backend.js", import.meta.url)) {
    this.worker = new Worker(entry, { workerData: { directory, staticDir } });
    let accept: (origin: string) => void;
    let reject: (error: Error) => void;
    this.ready = new Promise<string>((resolve, fail) => { accept = resolve; reject = fail; });
    // Shutdown can precede startup; retain rejection for the caller without an unhandled rejection.
    void this.ready.catch(() => {});
    let failed = false;
    const failure = () => {
      if (failed) return;
      failed = true;
      reject(new Error("The desktop backend stopped unexpectedly. Saved work is retained."));
      if (!this.closing) onFailure();
    };
    this.worker.on("message", (message: unknown) => {
      if (message && typeof message === "object" && "type" in message && message.type === "ready" && "origin" in message && typeof message.origin === "string") accept(message.origin);
    });
    this.worker.on("error", failure);
    this.exited = new Promise<void>((resolve, fail) => {
      this.worker.once("exit", (code) => {
        if (!this.closing || code !== 0) failure();
        // Also settle a startup interrupted by a graceful stop.
        reject(new Error("The desktop backend closed before startup completed."));
        if (failed) fail(new Error("Desktop backend cleanup did not complete normally.")); else resolve();
      });
    });
    void this.exited.catch(() => {});
  }

  close(): Promise<void> {
    if (!this.closing) { this.closing = true; this.worker.postMessage({ type: "close" }); }
    return this.exited;
  }
}
