import net from "node:net";
import { syncBuiltinESMExports } from "node:module";

/** Fixed auth endpoints, not a provider/model transport or an OS sandbox. */
export function authFetchURLAllowed(value: string | URL): boolean {
  const url = new URL(value);
  return url.origin === "https://auth.openai.com" && !url.username && !url.password && !url.hash && !url.search
    && ["/api/accounts/oauth/token", "/.well-known/jwks.json"].includes(url.pathname);
}
export function installAuthNetworkPolicy() {
  const request = globalThis.fetch, connect = net.Socket.prototype.connect, listen = net.Server.prototype.listen;
  let armed = false, server: net.Server | undefined, blocked = false, providerRequests = 0, socketConnections = 0, callbackListeners = 0;
  const deny = (): never => { blocked = true; throw new Error("network-blocked"); };
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input;
    if (!authFetchURLAllowed(url)) deny();
    providerRequests++;
    // A redirect cannot carry credentials to an unreviewed endpoint.
    return await request(input, { ...init, redirect: "error" });
  };
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const options = args[0] as { host?: string; hostname?: string; port?: number | string } | undefined;
    if (!options || typeof options !== "object" || (options.host ?? options.hostname) !== "auth.openai.com" || Number(options.port) !== 443) return deny();
    socketConnections++;
    return Reflect.apply(connect, this, args);
  } as typeof connect;
  net.Server.prototype.listen = function (this: net.Server, ...args: unknown[]) {
    if (!armed || server || args[0] !== 0 || args[1] !== "127.0.0.1") return deny();
    callbackListeners++;
    server = this; armed = false;
    this.once("close", () => { if (server === this) server = undefined; });
    return Reflect.apply(listen, this, args);
  } as typeof listen;
  syncBuiltinESMExports();
  return {
    armCallback: () => { if (server || armed) throw new Error("auth-busy"); armed = true; },
    disarmCallback: () => { armed = false; },
    callbackPort: () => { const address = server?.address(); return address && typeof address !== "string" ? address.port : undefined; },
    assertAllowed: () => { if (blocked) throw new Error("network-blocked"); },
    counters: () => ({ providerRequests, socketConnections, callbackListeners }),
  };
}
