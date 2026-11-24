import type { OpenCodeClient } from "@opencode/client";
import { authHandle, chatGPTIntegration, chatGPTMethod, checkedAuthorizationURL, nativeAuthID, type AuthData } from "./auth-protocol.js";

type AuthHost = Pick<OpenCodeClient, "integration" | "credential">;
type Policy = { armCallback(): void; disarmCallback(): void; callbackPort(): number | undefined; assertAllowed(): void };
type Attempt = { id: string; handle: string; expiresAt: number; status: "pending" | "complete" | "failed" | "expired" | "cancel-requested" };

/** No credential values are read by this bridge. SDK owns OAuth, refresh and persistence. */
export class HelperAuthController {
  private attempt?: Attempt;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private host: AuthHost, private storeID: string, private workspace: string, private policy: Policy,
    private unsafeFailure: () => void, private now = Date.now) {}
  private location() { return { directory: this.workspace }; }
  async inspect(): Promise<Extract<AuthData, { kind: "auth-inspection" }>> {
    const { data } = await this.host.integration.get({ integrationID: chatGPTIntegration, location: this.location() });
    this.policy.assertAllowed();
    const available = data.id === chatGPTIntegration && data.methods.some(method => method.type === "oauth" && method.id === chatGPTMethod && !method.form?.length);
    const connections = data.connections.filter(connection => connection.type === "credential" && connection.method === "oauth");
    if (data.id !== chatGPTIntegration || connections.length > 20) throw new Error("auth-failure");
    return { kind: "auth-inspection", available, connections: connections.map(connection => ({
      handle: authHandle(this.storeID, "connection", connection.type === "credential" ? connection.id : ""), needsAuth: connection.status?.status === "needs_auth",
    })) };
  }
  async begin(): Promise<Extract<AuthData, { kind: "auth-authorization" }>> {
    if (this.attempt?.status === "pending") throw new Error("auth-busy");
    if (!(await this.inspect()).available) throw new Error("auth-unavailable");
    this.policy.armCallback();
    let id: string | undefined;
    try {
      const { data } = await this.host.integration.oauth.connect({ integrationID: chatGPTIntegration, methodID: chatGPTMethod, location: this.location() });
      id = data.attemptID;
      const port = this.policy.callbackPort();
      if (data.mode !== "auto" || port === undefined || !Number.isFinite(data.time.expires) || data.time.expires <= this.now()) throw new Error("auth-failure");
      const url = checkedAuthorizationURL(data.url, port).href;
      this.policy.assertAllowed();
      const expiresAt = Math.min(data.time.expires, this.now() + 180_000), handle = authHandle(this.storeID, "attempt", id);
      this.attempt = { id, handle, expiresAt, status: "pending" };
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { void this.cancel(handle).catch(this.unsafeFailure); }, Math.max(1, expiresAt - this.now()));
      return { kind: "auth-authorization", handle, url, expiresAt };
    } catch {
      if (id) await this.host.integration.oauth.cancel({ integrationID: chatGPTIntegration, attemptID: id, location: this.location() }).catch(() => this.unsafeFailure());
      throw new Error("auth-failure");
    } finally { this.policy.disarmCallback(); }
  }
  private ownAttempt(handle: string) {
    const id = nativeAuthID(handle, this.storeID, "attempt");
    if (!this.attempt || this.attempt.id !== id || this.attempt.handle !== handle) throw new Error("auth-scope");
    return this.attempt;
  }
  async status(handle: string): Promise<Extract<AuthData, { kind: "auth-status" }>> {
    const attempt = this.ownAttempt(handle);
    if (attempt.status === "pending") {
      if (attempt.expiresAt <= this.now()) return await this.cancel(handle);
      const { data } = await this.host.integration.oauth.status({ integrationID: chatGPTIntegration, attemptID: attempt.id, location: this.location() });
      this.policy.assertAllowed();
      attempt.status = data.status; // Failed SDK message is intentionally not projected.
      if (attempt.status !== "pending") clearTimeout(this.timer);
    }
    return { kind: "auth-status", handle, status: attempt.status };
  }
  async cancel(handle: string): Promise<Extract<AuthData, { kind: "auth-status" }>> {
    const attempt = this.ownAttempt(handle);
    if (attempt.status === "pending") {
      await this.host.integration.oauth.cancel({ integrationID: chatGPTIntegration, attemptID: attempt.id, location: this.location() });
      // SDK cancellation can race a committed credential. Never assert rollback/revocation.
      attempt.status = "cancel-requested"; clearTimeout(this.timer);
    }
    return { kind: "auth-status", handle, status: attempt.status };
  }
  async forgetLocal(handle: string): Promise<Extract<AuthData, { kind: "auth-forgotten" }>> {
    const id = nativeAuthID(handle, this.storeID, "connection");
    if (this.attempt?.status === "pending") throw new Error("auth-busy");
    const available = await this.inspect();
    if (!available.connections.some(connection => connection.handle === handle)) throw new Error("auth-scope");
    await this.host.credential.remove({ credentialID: id });
    this.policy.assertAllowed();
    return { kind: "auth-forgotten", remoteRevocation: "not-asserted" };
  }
  async close() {
    clearTimeout(this.timer);
    if (this.attempt?.status === "pending") await this.cancel(this.attempt.handle);
  }
}
