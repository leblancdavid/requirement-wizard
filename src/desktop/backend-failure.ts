/** Deliberately exclude raw messages/stacks: model/provider exceptions can contain
 * credentials, authorization URLs, SQL payloads or original project text. */
export type BackendFailure = {
  kind: "error" | "exit";
  category: "out-of-memory" | "string-size-limit" | "stack-overflow" | "worker-error" | "unexpected-exit";
  name?: string;
  code?: string;
  exitCode?: number;
  locations?: string[];
};

export function backendFailure(error: unknown): BackendFailure {
  const value = error && typeof error === "object" ? error as { name?: unknown; code?: unknown; message?: unknown; stack?: unknown } : {};
  const message = typeof value.message === "string" ? value.message : "";
  const code = typeof value.code === "string" && /^(?:ERR|SQLITE)_[A-Z0-9_]{1,64}$/.test(value.code) ? value.code : undefined;
  const name = typeof value.name === "string" && ["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "AggregateError", "SqliteError"].includes(value.name) ? value.name : "Error";
  const category = code === "ERR_WORKER_OUT_OF_MEMORY" || /heap out of memory|memory limit|out of memory/i.test(message) ? "out-of-memory"
    : /invalid string length/i.test(message) ? "string-size-limit"
    : /maximum call stack size exceeded/i.test(message) ? "stack-overflow" : "worker-error";
  // Keep only source basenames and line/column numbers, never full paths, the
  // message line, function names, query strings or arbitrary stack text.
  const locations = typeof value.stack === "string" ? value.stack.split("\n").slice(1, 25).flatMap((line) => {
    if (!/^\s+at\s/.test(line)) return [];
    const match = /(?:[/\\])([a-zA-Z0-9_-]+\.(?:js|mjs|cjs|ts)):(\d{1,8}):(\d{1,8})(?:\)|\s*)$/.exec(line);
    return match ? [`${match[1]}:${match[2]}:${match[3]}`] : [];
  }).slice(0, 8) : [];
  return { kind: "error", category, name, ...(code ? { code } : {}), ...(locations.length ? { locations } : {}) };
}
