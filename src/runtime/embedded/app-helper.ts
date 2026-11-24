import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { startEmbeddedAuthHelper } from "./auth-client.js";
import { resolveHelperBundle } from "./bundle.js";
import { checkedAuthorizationURL } from "./auth-protocol.js";
import { HelperCleanupError } from "./transport.js";
import { helperDataDirectory } from "../../storage/paths.js";

export type HelperView = {
  available: boolean; enabled: boolean;
  process: "stopped" | "starting" | "running" | "stopping" | "cleanup-unconfirmed";
  operation: "idle" | "checking" | "signing-in";
  result: "none" | "checked" | "connected" | "cancel-requested" | "failed";
  connection?: { count: number; needsAuth: number; checkedAt: string };
  counters?: { providerRequests: number; socketConnections: number; callbackListeners: number; prompts: 0 };
  authorization?: { url: string; expiresAt: number };
  message: string;
};
export interface AppHelper {
  status(): Promise<HelperView>;
  start(action: "check" | "login", consent: true): Promise<HelperView>;
  stop(): Promise<HelperView>;
  close(): Promise<void>;
}
type Helper = Awaited<ReturnType<typeof startEmbeddedAuthHelper>>;
type Options = { bundleDirectory: string; dataDirectory: string; workspace: string };
type Dependencies = {
  available(): Promise<boolean>;
  prepare(): Promise<void>;
  launch(signal: AbortSignal): Promise<Helper>;
};

/** App-owned, session-only controls. Viewing Settings never opens a credential store. */
export class AppHelperManager implements AppHelper {
  private view: HelperView = { available: false, enabled: false, process: "stopped", operation: "idle", result: "none",
    message: "Not started. Checking the saved connection starts a private helper and closes it afterward." };
  private active?: { controller: AbortController; done: Promise<void> };
  private closed = false;
  private readonly deps: Dependencies;
  constructor(options: Options, dependencies?: Dependencies) {
    this.deps = dependencies ?? {
      available: async () => {
        try {
          const bundle = await resolveHelperBundle(options.bundleDirectory, "chatgpt-auth-v1");
          await Promise.all([access(bundle.executable), access(bundle.entry)]);
          return true;
        } catch { return false; }
      },
      prepare: () => mkdir(options.workspace, { recursive: true }).then(() => {}),
      launch: signal => startEmbeddedAuthHelper({ ...options, credentialStorageConsent: true, signal }),
    };
  }
  async status(): Promise<HelperView> {
    this.view.available = await this.deps.available();
    // Copy only the safe app contract; no native IDs, paths, labels or raw SDK errors.
    return structuredClone(this.view);
  }
  async start(action: "check" | "login", consent: true) {
    if (consent !== true) throw new Error("Explicit acceptance of SDK plaintext credential storage is required.");
    if (this.closed || this.active || this.view.process === "cleanup-unconfirmed") throw new Error("Stop the current helper operation or resolve its unconfirmed cleanup before starting another.");
    if (!(await this.deps.available())) throw new Error("Helper bundle unavailable. Build the optional Windows x64 helper bundle, then refresh status.");
    // Recheck after the asynchronous availability lookup: competing tabs share this owner.
    if (this.closed || this.active) throw new Error("Another helper operation is already running.");
    const controller = new AbortController();
    this.view = { ...this.view, available: true, enabled: true, process: "starting", operation: action === "check" ? "checking" : "signing-in",
      result: "none", authorization: undefined, counters: undefined, message: "Starting the private helper…" };
    const active = { controller, done: Promise.resolve() };
    this.active = active;
    active.done = this.run(action, controller).finally(() => { if (this.active === active) this.active = undefined; });
    return this.status();
  }
  private async run(action: "check" | "login", controller: AbortController) {
    let helper: Helper | undefined;
    let cleanupUnconfirmed = false;
    try {
      await this.deps.prepare(); controller.signal.throwIfAborted();
      helper = await this.deps.launch(controller.signal); controller.signal.throwIfAborted();
      this.view.process = "running";
      if (action === "login") {
        const authorization = await helper.begin(controller.signal);
        checkedAuthorizationURL(authorization.url);
        this.view.authorization = { url: authorization.url, expiresAt: authorization.expiresAt };
        this.view.message = "Waiting for browser authorization. This sign-in may be labelled OpenCode.";
        let state = await helper.status(authorization.handle, controller.signal);
        while (state.status === "pending" && Date.now() < authorization.expiresAt) {
          await delay(500, undefined, { signal: controller.signal });
          state = await helper.status(authorization.handle, controller.signal);
        }
        this.view.authorization = undefined;
        if (state.status !== "complete") {
          if (state.status === "pending") await helper.cancel(authorization.handle);
          throw new Error("authorization-not-complete");
        }
      }
      const inspection = await helper.inspect(controller.signal);
      if (inspection.kind !== "auth-inspection" || !inspection.available) throw new Error("inspection-unavailable");
      const health = await helper.health(controller.signal);
      if (health.kind !== "health") throw new Error("health-unavailable");
      this.view.connection = { count: inspection.connections.length, needsAuth: inspection.connections.filter(item => item.needsAuth).length, checkedAt: new Date().toISOString() };
      this.view.counters = { providerRequests: health.providerRequests, socketConnections: health.socketConnections, callbackListeners: health.callbackListeners, prompts: health.prompts };
      this.view.result = action === "login" ? "connected" : "checked";
      this.view.message = action === "login" ? "Authorization completed. Saved connection inspected; no model call was made." : "Saved connection inspected. This does not prove token refresh, model access or available allowance.";
    } catch (error) {
      cleanupUnconfirmed = error instanceof HelperCleanupError;
      const locked = error instanceof Error && error.message.startsWith("Embedded helper store is locked.");
      this.view.result = controller.signal.aborted ? "cancel-requested" : "failed";
      this.view.message = controller.signal.aborted
        ? "Stop requested. Saved credentials are retained; cancellation does not assert rollback or remote revocation."
        : locked ? "The helper account store is in use by another app or CLI. Finish that operation first; its process was not stopped and its lease was not taken over."
        : "Helper operation failed. Saved work was retained; no fallback or automatic retry was attempted. Check bundle availability and whether another app or CLI owns this store.";
    } finally {
      this.view.authorization = undefined; this.view.process = "stopping";
      try {
        await helper?.close();
        if (cleanupUnconfirmed) throw new HelperCleanupError();
        this.view.process = "stopped";
      }
      catch {
        this.view.process = "cleanup-unconfirmed"; this.view.result = "failed";
        this.view.message = "Helper cleanup was not confirmed. Do not reset the store or steal its lease; confirm the previous owner has exited before recovery.";
      }
      this.view.operation = "idle";
    }
  }
  async stop() {
    const active = this.active;
    if (active) { this.view.process = "stopping"; this.view.authorization = undefined; active.controller.abort(); await active.done; }
    return this.status();
  }
  async close() {
    this.closed = true;
    await this.stop();
    if (this.view.process === "cleanup-unconfirmed") throw new Error("Embedded helper cleanup was not confirmed.");
  }
}

export function createAppHelper(directory: string, bundleDirectory: string) {
  // Reuse the explicitly authorized CLI qualification store in place; never copy it.
  const root = helperDataDirectory(directory);
  return new AppHelperManager({ bundleDirectory, dataDirectory: join(root, "embedded-auth-live-qualification"),
    workspace: join(root, "embedded-auth-live-control") });
}
