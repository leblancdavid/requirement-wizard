import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { defaultDataDirectory } from "../storage/paths.js";
import { join } from "node:path";
import { CredentialStore } from "./credentials.js";
import { AuthorizationDeclined, ProviderError, authorize, callback, exchange, listModels, probe, refresh, revoke, type Registration } from "./chatgpt.js";

export type Account = { id: string; label: string; expiresAt: number };
export type LoginStatus = { id: string; status: "waiting" | "validating" | "connected" | "failed" | "cancelled"; error?: string; accountID?: string };
export type Model = { id: string; name: string };
export interface Connections {
  accounts(): Promise<Account[]>;
  beginLogin(accountID?: string): Promise<{ id: string; url: string }>;
  loginStatus(id: string): LoginStatus;
  cancelLogin(id: string): void;
  models(accountID: string): Promise<Model[]>;
  test(accountID: string, modelID: string): Promise<void>;
  cancelTest(): void;
  disconnect(accountID: string): Promise<void>;
  close(): Promise<void>;
}
export const defaultCredentialDirectory = () => join(defaultDataDirectory(), "providers");
export function connectionError(error: unknown): string {
  return error instanceof ProviderError ? error.message : "ChatGPT connection could not complete. Retry sign-in or check your connection and ChatGPT usage settings.";
}

/** Owns bounded OAuth attempts and provider operations. Public methods never return tokens. */
export class ConnectionManager implements Connections {
  private login?: { public: LoginStatus; controller: AbortController; server: Server; done: Promise<void> };
  private starting = false;
  private closed = false;
  private work = new Set<{ controller: AbortController; accountID?: string; done: Promise<unknown> }>();
  private testController?: AbortController;
  private disconnecting = new Set<string>();
  constructor(private readonly store = new CredentialStore(defaultCredentialDirectory()), private readonly request: typeof fetch = fetch) {}

  private async run<T>(operation: (signal: AbortSignal) => Promise<T>, accountID?: string, external?: AbortSignal): Promise<T> {
    if (this.closed) throw new ProviderError("Connection service is shutting down.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    external?.addEventListener("abort", abort, { once: true });
    if (external?.aborted) abort();
    const timer = setTimeout(abort, 120_000);
    const entry = { controller, accountID, done: Promise.resolve() as Promise<unknown> };
    this.work.add(entry);
    entry.done = (async () => { controller.signal.throwIfAborted(); return operation(controller.signal); })();
    try { return await entry.done as T; }
    finally { clearTimeout(timer); external?.removeEventListener("abort", abort); this.work.delete(entry); }
  }

  accounts() {
    return this.run((signal) => this.store.transaction(async (state) => state.accounts.map((account) => ({
      id: account.id, label: `${account.email ?? "ChatGPT account"} · ${account.id.slice(-8)}`, expiresAt: account.expiresAt,
    })), signal));
  }
  private select(accounts: Registration[], id: string) {
    const account = accounts.find((account) => account.id === id);
    if (!account) throw new ProviderError("ChatGPT account is disconnected. Connect it in Settings or select another account.");
    return account;
  }
  private credential(accountID: string, signal: AbortSignal) {
    return this.store.transaction(async (state) => {
      const account = this.select(state.accounts, accountID);
      const renewed = await refresh(account, signal, this.request);
      state.accounts[state.accounts.indexOf(account)] = renewed;
      return renewed;
    }, signal);
  }
  /** Keeps disconnect/shutdown cancellation attached throughout inference. */
  withAccount<T>(id: string, operation: (account: Registration, signal: AbortSignal) => Promise<T>, external?: AbortSignal) {
    if (this.disconnecting.has(id)) throw new ProviderError("This account is disconnecting. Wait before starting another request.");
    return this.run(async (signal) => operation(await this.credential(id, signal), signal), id, external);
  }
  models(id: string) { return this.withAccount(id, (account, signal) => listModels(account, signal, this.request)); }
  async test(id: string, model: string) {
    if (this.testController) throw new ProviderError("A connection test is already running.");
    const controller = new AbortController(); this.testController = controller;
    try { await this.withAccount(id, async (account, signal) => { await probe(account, model, signal, this.request); }, controller.signal); }
    finally { if (this.testController === controller) this.testController = undefined; }
  }
  cancelTest() { this.testController?.abort(); }
  async disconnect(id: string) {
    if (this.starting || (this.login && ["waiting", "validating"].includes(this.login.public.status))) throw new ProviderError("Finish or cancel sign-in before disconnecting an account.");
    if (this.disconnecting.has(id)) throw new ProviderError("This account is already disconnecting.");
    this.disconnecting.add(id);
    try {
      const active = [...this.work].filter((work) => work.accountID === id);
      for (const work of active) work.controller.abort();
      await Promise.allSettled(active.map((work) => work.done));
      await this.run((signal) => this.store.transaction(async (state) => {
        await revoke(this.select(state.accounts, id), signal, this.request);
        state.accounts = state.accounts.filter((account) => account.id !== id);
      }, signal), id);
    } finally { this.disconnecting.delete(id); }
  }

  async beginLogin(accountID?: string) {
    if (this.closed || this.starting || this.disconnecting.size || (this.login && ["waiting", "validating"].includes(this.login.public.status))) throw new ProviderError("A connection change is already running or the app is stopping.");
    this.starting = true;
    const server = createServer();
    try {
      await this.login?.done;
      const { hostID, saved } = await this.run((signal) => this.store.transaction(async (state) => ({ hostID: state.hostID,
        saved: accountID ? this.select(state.accounts, accountID) : undefined }), signal));
      await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
      if (this.closed) throw new ProviderError("Connection service is shutting down.");
      const address = server.address();
      if (!address || typeof address === "string") throw new ProviderError("Cannot start the ChatGPT sign-in callback.");
      const attempt = authorize(hostID, `http://127.0.0.1:${address.port}/auth/callback`, saved);
      const controller = new AbortController();
      const state: LoginStatus = { id: randomUUID(), status: "waiting" };
      const timer = setTimeout(() => controller.abort(), 180_000);
      const result = new Promise<ReturnType<typeof callback>>((accept, reject) => {
        controller.signal.addEventListener("abort", () => reject(new ProviderError("Sign-in cancelled or expired. Start a new sign-in.")), { once: true });
        server.on("request", (req, res) => {
          res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
          if (req.method !== "GET" || req.headers.host !== `127.0.0.1:${address.port}` || !req.url || req.url.length > 16384) { res.writeHead(400).end("Invalid callback."); return; }
          const url = new URL(req.url, attempt.redirectURI);
          if (url.pathname !== "/auth/callback") { res.writeHead(404).end(); return; }
          if (state.status !== "waiting") { res.writeHead(409).end("This sign-in has already been handled."); return; }
          try {
            const value = callback(attempt, url);
            state.status = "validating";
            res.end("Authorization received. Return to Reqwizit to see the result. You may close this tab.");
            accept(value);
          } catch (error) {
            res.writeHead(400).end("Authorization was rejected. Return to Reqwizit.");
            // Invalid state cannot terminate someone else's pending sign-in.
            if (error instanceof AuthorizationDeclined) reject(error);
          }
        });
      });
      const done = (async () => {
        try {
          const account = await exchange(attempt, await result, controller.signal, this.request);
          await this.store.transaction(async (credentials) => {
            controller.signal.throwIfAborted();
            const previous = credentials.accounts.find((entry) => entry.id === account.id);
            if (previous && previous.subject !== account.subject) throw new ProviderError("Account identity changed; sign-in was not saved.");
            credentials.accounts = credentials.accounts.filter((entry) => entry.id !== account.id).concat(account);
          }, controller.signal);
          state.status = "connected"; state.accountID = account.id;
        } catch (error) {
          state.status = controller.signal.aborted ? "cancelled" : "failed";
          state.error = connectionError(error);
        } finally {
          clearTimeout(timer); server.closeAllConnections();
          await new Promise<void>((accept) => server.close(() => accept()));
        }
      })();
      this.login = { public: state, controller, server, done };
      return { id: state.id, url: attempt.url };
    } catch (error) { server.close(); throw error; }
    finally { this.starting = false; }
  }
  loginStatus(id: string) {
    if (this.login?.public.id !== id) throw new ProviderError("Sign-in no longer exists. Start a new sign-in.");
    return { ...this.login.public };
  }
  cancelLogin(id: string) {
    this.loginStatus(id);
    if (this.login && ["waiting", "validating"].includes(this.login.public.status)) this.login.controller.abort();
  }
  async close() {
    this.closed = true; this.login?.controller.abort();
    for (const work of this.work) work.controller.abort();
    await Promise.allSettled([...[...this.work].map((work) => work.done), this.login?.done]);
  }
}
