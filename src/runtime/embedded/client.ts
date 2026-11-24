import { acquireHelperState } from "./state.js";
import { resolveHelperBundle } from "./bundle.js";
import { connectHelperTransport, validateHelperDeadlines, type HelperDeadlines, type HelperLaunch } from "./transport.js";
import { helperReplySchema, helperRequestSchema, nativeSessionID, type HelperCommand, type HelperData } from "./protocol.js";
export { helperBundleSchema } from "./bundle.js";

/** Metadata capability is unchanged: no auth/network/prompt methods, even in a new bundle. */
export async function startEmbeddedHelper(options: HelperDeadlines & { bundleDirectory: string; dataDirectory: string; workspace: string }, createChild?: HelperLaunch) {
  validateHelperDeadlines(options);
  const bundle = await resolveHelperBundle(options.bundleDirectory, "metadata-only-v1");
  const store = await acquireHelperState(options.dataDirectory, options.workspace);
  const transport = await connectHelperTransport<HelperData, HelperCommand>(options, { bundle, store, version: 1,
    initialize: { op: "initialize", storeID: store.state.storeID, workspace: store.state.workspace },
    parseRequest: value => helperRequestSchema.parse(value), parseReply: value => helperReplySchema.parse(value),
    validateData: data => {
      if (data.kind === "ready" && data.storeID !== store.state.storeID) throw new Error("different store");
      if (data.kind === "session") nativeSessionID(data.handle, store.state.storeID);
    },
  }, createChild);
  return {
    storeID: transport.storeID,
    health: (signal?: AbortSignal) => transport.request({ op: "health" }, "health", signal),
    createSession: async (title: string, signal?: AbortSignal) => {
      const data = await transport.request({ op: "session.create", title }, "session", signal);
      if (data.kind !== "session") throw new Error("Embedded helper returned no session.");
      return data.handle;
    },
    getSession: async (handle: string, signal?: AbortSignal) => {
      nativeSessionID(handle, store.state.storeID);
      return await transport.request({ op: "session.get", handle }, "session", signal);
    },
    removeSession: async (handle: string, signal?: AbortSignal) => {
      nativeSessionID(handle, store.state.storeID);
      await transport.request({ op: "session.remove", handle }, "removed", signal);
    },
    close: transport.close,
  };
}
