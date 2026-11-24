import { acquireHelperState } from "./state.js";
import { resolveHelperBundle } from "./bundle.js";
import { connectHelperTransport, validateHelperDeadlines, type HelperDeadlines, type HelperLaunch } from "./transport.js";
import { authReplySchema, authRequestSchema, checkedAuthorizationURL, nativeAuthID, type AuthCommand, type AuthData } from "./auth-protocol.js";

export async function startEmbeddedAuthHelper(options: HelperDeadlines & { bundleDirectory: string; dataDirectory: string; workspace: string;
  credentialStorageConsent: true }, createChild?: HelperLaunch, protect?: (directory: string, initialize: boolean) => Promise<void>) {
  validateHelperDeadlines(options);
  if (options.credentialStorageConsent !== true) throw new Error("Explicit consent to SDK-owned, owner-only plaintext credential storage is required. Direct-provider DPAPI storage is unchanged.");
  const bundle = await resolveHelperBundle(options.bundleDirectory, "chatgpt-auth-v1");
  const store = await acquireHelperState(options.dataDirectory, options.workspace, "chatgpt-auth-v1", protect);
  const transport = await connectHelperTransport<AuthData, AuthCommand>(options, { bundle, store, version: 2,
    initialize: { op: "initialize", storeID: store.state.storeID, workspace: store.state.workspace, credentialStorageConsent: true },
    parseRequest: value => authRequestSchema.parse(value), parseReply: value => authReplySchema.parse(value),
    validateData: data => {
      if (data.kind === "ready" && data.storeID !== store.state.storeID) throw new Error("auth-scope");
      if (data.kind === "auth-authorization") { nativeAuthID(data.handle, store.state.storeID, "attempt"); checkedAuthorizationURL(data.url); }
      if (data.kind === "auth-status") nativeAuthID(data.handle, store.state.storeID, "attempt");
      if (data.kind === "auth-inspection") for (const connection of data.connections) nativeAuthID(connection.handle, store.state.storeID, "connection");
    },
  }, createChild);
  return {
    storeID: store.state.storeID,
    health: (signal?: AbortSignal) => transport.request({ op: "health" }, "health", signal),
    inspect: (signal?: AbortSignal) => transport.request({ op: "auth.inspect" }, "auth-inspection", signal),
    begin: async (signal?: AbortSignal) => {
      const data = await transport.request({ op: "auth.begin" }, "auth-authorization", signal);
      if (data.kind !== "auth-authorization") throw new Error("Helper returned no authorization.");
      return data;
    },
    status: async (handle: string, signal?: AbortSignal) => {
      nativeAuthID(handle, store.state.storeID, "attempt");
      const data = await transport.request({ op: "auth.status", handle }, "auth-status", signal);
      if (data.kind !== "auth-status" || data.handle !== handle) throw new Error("Helper returned another authentication attempt.");
      return data;
    },
    cancel: async (handle: string, signal?: AbortSignal) => {
      nativeAuthID(handle, store.state.storeID, "attempt");
      const data = await transport.request({ op: "auth.cancel", handle }, "auth-status", signal);
      if (data.kind !== "auth-status" || data.handle !== handle) throw new Error("Helper returned another authentication attempt.");
      return data;
    },
    forgetLocalConnection: async (handle: string, confirmLocalOnly: true, signal?: AbortSignal) => {
      if (confirmLocalOnly !== true) throw new Error("Local removal requires explicit confirmation; remote revocation is not asserted.");
      nativeAuthID(handle, store.state.storeID, "connection");
      return await transport.request({ op: "auth.forget-local", handle, confirmLocalOnly }, "auth-forgotten", signal);
    },
    close: transport.close,
  };
}
