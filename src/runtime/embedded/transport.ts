import { spawn, type ChildProcess } from "node:child_process";
import { helperEnvironment } from "./environment.js";
import { boundedIPC } from "./protocol.js";

export class HelperCleanupError extends Error {
  constructor() { super("Embedded helper cleanup was not confirmed; retain its store lease until owner exit is confirmed."); }
}

export type HelperDeadlines = { signal?: AbortSignal;
  startupTimeoutMs?: number; requestTimeoutMs?: number; shutdownTimeoutMs?: number };
export type HelperLaunch = (bundle: { root: string; executable: string; entry: string }, env: NodeJS.ProcessEnv, workspace: string) => ChildProcess;
export function validateHelperDeadlines(options: HelperDeadlines) {
  for (const value of [options.startupTimeoutMs ?? 60_000, options.requestTimeoutMs ?? 10_000, options.shutdownTimeoutMs ?? 3000])
    if (!Number.isInteger(value) || value < 50 || value > 120_000) throw new Error("Embedded helper deadlines must be integers from 50 to 120000 ms.");
  options.signal?.throwIfAborted();
}
type Reply<D> = { id: number; ok: true; data: D } | { id: number; ok: false; code: string };
type Scope<D extends { kind: string }, C extends { op: string }> = {
  bundle: { root: string; executable: string; entry: string };
  store: { root: string; state: { storeID: string; workspace: string }; release(): Promise<void> };
  version: number; initialize: C;
  parseRequest(value: unknown): { id: number; v: number; op: string };
  parseReply(value: unknown): Reply<D>;
  validateData(data: D): void;
};
const launch: HelperLaunch = (bundle, env, workspace) => spawn(bundle.executable, [bundle.entry], {
  cwd: workspace, env, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "ignore", "ignore", "ipc"], serialization: "json",
});
const delayBound = async (promise: Promise<unknown>, milliseconds: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Embedded helper shutdown exceeded its deadline.")), milliseconds); })]); }
  finally { clearTimeout(timer); }
};
async function killOwnedTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    await new Promise<void>((done) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      const timer = setTimeout(() => { killer.kill(); child.kill(); done(); }, 3000);
      const finish = (failed = false) => { clearTimeout(timer); if (failed) child.kill(); done(); };
      killer.once("error", () => finish(true)); killer.once("exit", code => finish(code !== 0));
    });
  } else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill(); } }
}

/** Shared process mechanics only; each caller and worker supplies a closed protocol. */
export async function connectHelperTransport<D extends { kind: string }, C extends { op: string }>(options: HelperDeadlines, scope: Scope<D, C>, createChild: HelperLaunch = launch) {
  const { store } = scope;
  let child: ChildProcess;
  try {
    options.signal?.throwIfAborted();
    validateHelperDeadlines(options);
    child = createChild(scope.bundle, helperEnvironment(store.root), store.state.workspace);
  } catch (error) { await store.release(); throw error; }
  let ended = false, closing = false, nextID = 0;
  let closePromise: Promise<void> | undefined, stopPromise: Promise<void> | undefined, releasePromise: Promise<void> | undefined;
  let resolveExit!: () => void;
  const exited = new Promise<void>(accept => { resolveExit = accept; });
  const pending = new Map<number, { kind: D["kind"]; accept(data: D): void; reject(error: Error): void }>();
  const release = () => releasePromise ??= store.release();
  const rejectPending = (error: Error) => { for (const item of [...pending.values()]) item.reject(error); };
  const stop = (error: Error) => stopPromise ??= (async () => {
    closing = true; rejectPending(error);
    try {
      await killOwnedTree(child);
      await delayBound(exited, 5000); // Never release a lease for an unconfirmed living process.
      await release();
    } catch { throw new HelperCleanupError(); }
  })();
  const disconnected = () => { if (!closing && !ended) void stop(new Error("Embedded helper IPC disconnected; no operation was replayed.")).catch(() => {}); };
  const onExit = () => {
    ended = true; rejectPending(new Error("Embedded helper stopped; no operation was replayed.")); resolveExit();
    void release().catch(() => {});
    options.signal?.removeEventListener("abort", cancel);
  };
  child.once("exit", onExit);
  child.once("error", () => {
    if (!child.pid) { ended = true; resolveExit(); }
    void stop(new Error("Cannot launch the packaged embedded helper; no fallback was attempted.")).catch(() => {});
  });
  child.once("disconnect", disconnected);
  child.on("message", (value: unknown) => {
    if (ended) return;
    let reply: Reply<D>;
    try { if (!boundedIPC(value)) throw new Error(); reply = scope.parseReply(value); }
    catch { void stop(new Error("Embedded helper returned an invalid IPC reply.")).catch(() => {}); return; }
    const waiter = pending.get(reply.id);
    if (!waiter) { void stop(new Error("Embedded helper returned an unknown or duplicate request identity.")).catch(() => {}); return; }
    if (!reply.ok) { waiter.reject(new Error(`Embedded helper rejected the operation (${reply.code}). No model request was made.`)); return; }
    if (reply.data.kind !== waiter.kind) { void stop(new Error("Embedded helper reply belongs to a different operation.")).catch(() => {}); return; }
    try { scope.validateData(reply.data); }
    catch { void stop(new Error("Embedded helper returned data for a different store.")).catch(() => {}); return; }
    waiter.accept(reply.data);
  });
  const cancel = () => { void stop(new Error("Embedded helper cancelled; no operation was replayed.")).catch(() => {}); };
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();

  const request = async (command: C, kind: D["kind"], signal?: AbortSignal, timeout = options.requestTimeoutMs ?? 10_000, duringClose = false) => {
    signal?.throwIfAborted();
    if (ended || (closing && !duringClose) || !child.connected) throw new Error("Embedded helper is not available.");
    if (pending.size >= 4 || nextID >= 10_000) throw new Error("Embedded helper request limit reached.");
    const message = scope.parseRequest({ ...command, v: scope.version, id: ++nextID });
    if (!boundedIPC(message)) throw new Error("Embedded helper IPC request is too large.");
    return await new Promise<D>((accept, reject) => {
      const onAbort = () => { void stop(new Error("Embedded helper request cancelled; no operation was replayed.")).catch(() => {}); };
      const timer = setTimeout(() => { void stop(new Error("Embedded helper request exceeded its deadline; no operation was replayed.")).catch(() => {}); }, timeout);
      const settle = (data?: D, error?: Error) => {
        clearTimeout(timer); signal?.removeEventListener("abort", onAbort); pending.delete(message.id);
        if (error) reject(error); else accept(data!);
      };
      pending.set(message.id, { kind, accept: data => settle(data), reject: error => settle(undefined, error) });
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      try { child.send(message, error => { if (error) void stop(new Error("Embedded helper IPC send failed.")).catch(() => {}); }); }
      catch { void stop(new Error("Embedded helper IPC send failed.")).catch(() => {}); }
    });
  };
  const close = () => closePromise ??= (async () => {
    try {
      if (stopPromise) { await stopPromise; return; }
      if (pending.size) { await stop(new Error("Embedded helper closed during an unfinished operation; it was not replayed.")); return; }
      if (!ended) {
        closing = true;
        rejectPending(new Error("Embedded helper is closing; unfinished operations were not replayed."));
        await request({ op: "close" } as C, "closed", undefined, options.shutdownTimeoutMs ?? 3000, true);
        await delayBound(exited, options.shutdownTimeoutMs ?? 3000);
      }
      await release();
    } catch (error) { await stop(error instanceof Error ? error : new Error("Embedded helper close failed.")); throw error; }
    finally { options.signal?.removeEventListener("abort", cancel); }
  })();
  try {
    const ready = await request(scope.initialize, "ready", options.signal, options.startupTimeoutMs ?? 60_000);
    return { request, close, ready, storeID: store.state.storeID };
  } catch (error) {
    await stop(error instanceof Error ? error : new Error("Embedded helper startup failed."));
    throw error;
  }
}
