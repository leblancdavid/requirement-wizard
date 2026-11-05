import { Worker } from "node:worker_threads";
import { startupLabels, reportStartup, type StartupProgress, type StartupPhase } from "../core/startup.js";
import { backendFailure, type BackendFailure } from "./backend-failure.js";

/** Own the service worker without running SQLite/export work on Electron's event loop. */
export class DesktopBackend {
  readonly ready: Promise<string>;
  private readonly worker: Worker;
  private readonly exited: Promise<void>;
  private closing = false;

  constructor(directory: string, staticDir: string, onFailure: (failure: BackendFailure) => void, entry = new URL("./backend.js", import.meta.url), onProgress?: StartupProgress) {
    this.worker = new Worker(entry, { workerData: { directory, staticDir } });
    let accept: (origin: string) => void;
    let reject: (error: Error) => void;
    this.ready = new Promise<string>((resolve, fail) => { accept = resolve; reject = fail; });
    // Shutdown can precede startup; retain rejection for the caller without an unhandled rejection.
    void this.ready.catch(() => {});
    let failed = false;
    const failure = (detail: BackendFailure) => {
      if (failed) return;
      failed = true;
      reject(new Error("The desktop backend stopped unexpectedly. Saved work is retained."));
      if (!this.closing) {
        try { onFailure(detail); } catch { /* Diagnostic/display failure cannot prevent owned cleanup. */ }
      }
    };
    this.worker.on("message", (message: unknown) => {
      if (message && typeof message === "object" && "type" in message && message.type === "startup" && "phase" in message
        && typeof message.phase === "string" && Object.hasOwn(startupLabels, message.phase)) reportStartup(onProgress, message.phase as StartupPhase);
      if (message && typeof message === "object" && "type" in message && message.type === "ready" && "origin" in message && typeof message.origin === "string") accept(message.origin);
    });
    this.worker.on("error", (error) => failure(backendFailure(error)));
    this.exited = new Promise<void>((resolve, fail) => {
      this.worker.once("exit", (code) => {
        if (!this.closing || code !== 0) failure({ kind: "exit", category: "unexpected-exit", exitCode: code });
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
