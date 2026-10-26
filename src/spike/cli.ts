import { parseArgs } from "node:util";
import { interpretation, interpretationSchema, positiveMilliseconds, safeMessage, selectModel } from "./contract.js";
import { startRuntime } from "./runtime.js";

const help = `Reqwizit — OpenCode compatibility spike

npm run spike -- providers
npm run spike -- profile
npm run spike -- probe --provider openai --model <model-id> --idea "Your idea"
npm run spike -- probe --provider openai --model <model-id> --cancel-after-ms 1000
npm run spike -- session --session <session-id>

Options: --timeout-ms <1..600000> (default 120000), --help
         --format text-json (default; V2 native schema mode is not qualified)
Providers/session inspection makes no model call. Probe sends the idea to the
selected provider and may consume subscription allowance. Sessions are retained
in OpenCode for recovery inspection. Credentials remain owned by OpenCode.
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean" }, provider: { type: "string" }, model: { type: "string" },
      idea: { type: "string" }, session: { type: "string" },
      "timeout-ms": { type: "string" }, "cancel-after-ms": { type: "string" },
      format: { type: "string" },
    },
  });
  if (values.help || positionals.length === 0) { console.log(help); return; }
  const command = positionals[0];
  if (positionals.length !== 1 || !["providers", "profile", "probe", "session"].includes(command!)) {
    throw new Error("Choose providers, profile, probe, or session. See --help.");
  }
  if (command === "probe" && (!values.provider || !values.model)) {
    throw new Error("Probe requires explicit --provider and --model. See --help.");
  }
  if (command === "session" && !values.session) throw new Error("Session requires --session.");
  const format = values.format ?? "text-json";
  if (!["json-schema", "text-json"].includes(format)) throw new Error("format must be json-schema or text-json.");
  if (command === "probe" && format === "json-schema") throw new Error("OpenCode V2 native schema mode is not qualified. Select --format text-json explicitly; no runtime or model request was started.");
  const timeout = positiveMilliseconds(values["timeout-ms"] ?? "120000", "timeout-ms");
  const cancelAfter = values["cancel-after-ms"] ? positiveMilliseconds(values["cancel-after-ms"], "cancel-after-ms") : undefined;
  if (cancelAfter !== undefined && cancelAfter >= timeout) throw new Error("cancel-after-ms must be less than timeout-ms.");
  const runtime = await startRuntime(command === "probe" ? `${values.provider}/${values.model}` : undefined);
  try {
    const health = (await runtime.client.global.health()).data;
    console.log(JSON.stringify({ event: "runtime", health, client: "@opencode/client@2.1.4" }));
    if (command === "profile") {
      const config = (await runtime.client.config.get()).data;
      const agents = (await runtime.client.app.agents()).data;
      const agent = agents?.find((item) => item.name === "requirements-spike");
      console.log(JSON.stringify({ event: "profile", permission: config?.permission,
        agent: agent ? { name: agent.name, permission: agent.permission } : null,
        note: "V2 exposes no tool registry endpoint. Configuration is not proof of effective tool permission enforcement.",
      }, null, 2));
      return;
    }
    if (command === "session") {
      const sessionID = values.session!;
      const session = (await runtime.client.session.get({ sessionID })).data;
      console.log(JSON.stringify({ event: "session-found", sessionID: session?.id }));
      const messages = (await runtime.client.session.messages({ sessionID })).data;
      console.log(JSON.stringify({ event: "recovered-session", sessionID: session?.id,
        messageCount: messages?.length,
        messages: messages?.map(({ info }) => ({ id: info.id, role: info.role,
          ...(info.role === "assistant" ? { completed: info.time.completed !== undefined,
            error: info.error ? { name: info.error.name, message: safeMessage(info.error.data.message ?? info.error.name),
              ...(info.error.name === "APIError" ? { statusCode: info.error.data.statusCode, isRetryable: info.error.data.isRetryable } : {}) } : undefined } : {}) })),
      }, null, 2));
      return;
    }
    const catalog = (await runtime.client.provider.list()).data;
    if (!catalog) throw new Error("Runtime returned no provider catalog.");
    if (command === "providers") {
      const methods = (await runtime.client.provider.auth()).data;
      console.log(JSON.stringify({ event: "providers", providers: ["github-copilot", "openai"].map((id) => {
        const provider = catalog.all.find((item) => item.id === id);
        return { id, connected: catalog.connected.includes(id),
          authMethods: methods?.[id]?.map((method) => ({ type: method.type, label: method.label })),
          models: Object.keys(provider?.models ?? {}).sort() };
      }) }, null, 2));
      return;
    }
    const model = selectModel(catalog, values.provider!, values.model!);
    const session = (await runtime.client.session.create({
      title: "Reqwizit compatibility probe", permission: [{ permission: "*", pattern: "*", action: "deny" }],
    })).data;
    if (!session) throw new Error("Runtime returned no session.");
    const sessionID = session.id;
    console.log(JSON.stringify({ event: "session-created", sessionID, model, format }));
    const request = new AbortController();
    const events = new AbortController();
    const counts: Record<string, number> = {};
    let streamError = false;
    let stopReason: "cancelled" | "timeout" | undefined;
    let abortWork: Promise<unknown> | undefined;
    const stop = (reason: "cancelled" | "timeout") => {
      if (stopReason) return;
      stopReason = reason;
      abortWork = runtime.client.session.abort({ sessionID }).catch(() => {
        console.error(JSON.stringify({ event: "abort-unconfirmed", sessionID }));
      });
      request.abort();
    };
    const interrupt = () => stop("cancelled");
    process.once("SIGINT", interrupt);
    const timer = setTimeout(() => stop("timeout"), timeout);
    const cancelTimer = cancelAfter === undefined ? undefined : setTimeout(() => stop("cancelled"), cancelAfter);
    const stream = (async () => {
      try {
        const subscription = await runtime.client.event.subscribe({}, { signal: events.signal });
        for await (const event of subscription.stream) {
          if ("sessionID" in event.properties && event.properties.sessionID === sessionID) {
            counts[event.type] = (counts[event.type] ?? 0) + 1;
            if (counts[event.type] === 1) console.error(JSON.stringify({ event: "progress", type: event.type }));
          }
        }
      } catch { if (!events.signal.aborted) streamError = true; }
    })();
    try {
      const response = (await runtime.client.session.prompt({
        sessionID, model, agent: "requirements-spike",
        ...(format === "json-schema" ? { format: { type: "json_schema" as const, schema: interpretationSchema, retryCount: 1 } } : {}),
        parts: [{ type: "text", text: `${values.idea ?? "I want a simple app for small contractors to track jobs and prepare estimates."}\n\nKeep the response brief: one question with two or three options. ${format === "text-json" ? `Return only JSON (no markdown) matching this schema: ${JSON.stringify(interpretationSchema)}` : "Return the requested structured output using StructuredOutput."}` }],
      }, { signal: request.signal })).data;
      if (stopReason) throw new Error("Request stopped.");
      if (!response) throw new Error("Runtime returned no prompt response.");
      if (response.info.error) throw new Error(`Model response failed: ${response.info.error.name}: ${safeMessage(response.info.error.data.message ?? response.info.error.name)}`);
      let output: unknown = response.info.structured;
      if (format === "text-json") {
        const text = response.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
        try { output = JSON.parse(text); } catch { throw new Error("Text response was not valid JSON. No project changes were applied."); }
      }
      const result = interpretation.safeParse(output);
      if (!result.success) throw new Error("Model response did not match the interpretation schema. No project changes were applied.");
      console.log(JSON.stringify({ event: "probe-completed", sessionID, format,
        actualModel: { providerID: response.info.providerID, modelID: response.info.modelID },
        usage: response.info.tokens ?? null, runtimeReportedCost: response.info.cost ?? null,
        result: result.data }, null, 2));
    } catch (error) {
      if (!stopReason) throw error;
      console.log(JSON.stringify({ event: stopReason, sessionID }));
      if (stopReason === "timeout") process.exitCode = 1;
    } finally {
      clearTimeout(timer);
      clearTimeout(cancelTimer);
      process.removeListener("SIGINT", interrupt);
      await abortWork;
      events.abort();
      await stream;
      console.log(JSON.stringify({ event: "stream-summary", sessionID, counts, streamError }));
    }
  } finally {
    await runtime.close();
  }
}

main().catch((error: unknown) => {
  // SDK HTTP errors may contain provider headers/bodies; never dump arbitrary objects.
  const message = error instanceof Error ? error.message : "Runtime request failed. Check OpenCode connection status and server logs locally.";
  console.error(JSON.stringify({ event: "error", message: safeMessage(message) }));
  process.exitCode = 1;
});
