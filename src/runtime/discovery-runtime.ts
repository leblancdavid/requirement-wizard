import { startRuntime } from "./server.js";
import { ClientError } from "@opencode/client";

export type DiscoveryTransportPhase = "server startup" | "model catalog" | "input-capacity check" | "session creation" | "progress connection" | "model request" | "research evidence";
export function discoveryTransportFailure(error: unknown, phase: DiscoveryTransportPhase, promptStarted: boolean) {
  if (!(error instanceof ClientError) || error.reason !== "Transport") return undefined;
  return new Error(`OpenCode connection failed during ${phase}. ${promptStarted
    ? "The prompt may have been accepted; no automatic model retry was made."
    : "No model prompt was sent by this request."} The attempt remains recorded. Continue discovery explicitly to retry the unfinished step within its remaining allowance; completed work is retained.`, { cause: error });
}

type Runtime = Awaited<ReturnType<typeof startRuntime>>;
/** Exclusive leases: reuse the process, never sessions, prompts or permissions.
 * Failed/cancelled requests retire their process and are never retried here. */
export class DiscoveryRuntimes {
  private idle = new Map<string, { runtime: Runtime; timer: ReturnType<typeof setTimeout> }>();
  private owned = new Set<Runtime>();
  private starting = new Set<Promise<Runtime>>();
  private retired = new WeakMap<Runtime, Promise<void>>();
  private closing = false;
  private shutdown?: Promise<void>;
  constructor(private readonly start: typeof startRuntime, private readonly idleMs: number) {}

  async acquire(model: string, workspace: string, signal: AbortSignal, research = false) {
    signal.throwIfAborted();
    if (this.closing) throw new Error("Discovery runtime is closing.");
    const key = JSON.stringify([model, workspace, research]);
    const saved = this.idle.get(key);
    if (saved) { clearTimeout(saved.timer); this.idle.delete(key); }
    let runtime = saved?.runtime;
    if (runtime) {
      try {
        if (runtime.isAlive?.() === false) throw new Error("Owned discovery server stopped while idle.");
        // Metadata only. Never send a session/prompt to an unchecked idle server.
        // Replacing it here cannot replay inference or renew a paid attempt.
        const probe = AbortSignal.any([signal, AbortSignal.timeout(2000)]);
        let abort = () => {};
        try {
          await Promise.race([runtime.client.native.server.info({ signal: probe }), new Promise<never>((_resolve, reject) => {
            abort = () => reject(probe.reason);
            probe.addEventListener("abort", abort, { once: true });
            if (probe.aborted) abort();
          })]);
        } finally { probe.removeEventListener("abort", abort); }
      } catch (error) {
        await this.retire(runtime); runtime = undefined;
        signal.throwIfAborted();
        if (this.closing) throw new Error("Discovery runtime is closing.", { cause: error });
      }
    }
    if (!runtime) {
      const pending = this.start(model, workspace, signal, research);
      this.starting.add(pending);
      try { runtime = await pending; } finally { this.starting.delete(pending); }
    }
    if (this.closing || signal.aborted) { await this.retire(runtime); signal.throwIfAborted(); throw new Error("Discovery runtime is closing."); }
    this.owned.add(runtime);
    let released = false;
    return { runtime, release: async (healthy: boolean) => {
      if (released) return;
      released = true;
      if (!healthy || signal.aborted || this.closing || !this.idleMs || this.idle.has(key) || this.idle.size >= 2) {
        await this.retire(runtime); return;
      }
      const timer = setTimeout(() => {
        this.idle.delete(key);
        void this.retire(runtime).catch(() => {});
      }, this.idleMs);
      timer.unref(); this.idle.set(key, { runtime, timer });
    } };
  }

  private retire(runtime: Runtime) {
    this.owned.delete(runtime);
    let done = this.retired.get(runtime);
    if (!done) { done = runtime.close(); this.retired.set(runtime, done); }
    return done;
  }

  close() {
    return this.shutdown ??= (async () => {
      this.closing = true;
      for (const { timer } of this.idle.values()) clearTimeout(timer);
      this.idle.clear();
      const pending = await Promise.allSettled([...this.starting]);
      const results = await Promise.allSettled([...this.owned, ...pending.flatMap(r => r.status === "fulfilled" ? [r.value] : [])].map(runtime => this.retire(runtime)));
      this.owned.clear();
      for (const result of results) if (result.status === "rejected") throw result.reason;
    })();
  }
}
