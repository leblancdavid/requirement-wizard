import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { runtimeFetch, runtimeRequestTimeout } from "./http.js";

test("SDK Request signals cancel fetch and prompt deadlines differ from metadata", async () => {
  assert.equal(runtimeRequestTimeout(new Request("http://127.0.0.1/session/example/message", { method: "POST" })), 900000);
  assert.equal(runtimeRequestTimeout("http://127.0.0.1/session/example/message?directory=test", { method: "POST" }), 900000);
  assert.equal(runtimeRequestTimeout("http://127.0.0.1/session/example/message"), 90000);
  assert.equal(runtimeRequestTimeout(new Request("http://127.0.0.1/provider")), 90000);
  assert.equal(runtimeRequestTimeout("http://127.0.0.1/api/session/example/prompt", { method: "POST" }), 900000);
  assert.equal(runtimeRequestTimeout("http://127.0.0.1/api/experimental/session/example/wait", { method: "POST" }), 900000);
  const server = createServer((_req, res) => { res.writeHead(200); });
  await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const controller = new AbortController();
  const request = new Request(`http://127.0.0.1:${address.port}/`, { signal: controller.signal });
  try {
    const pending = runtimeFetch(request); controller.abort();
    await assert.rejects(pending, (error: unknown) => error instanceof Error && error.name === "AbortError");
  } finally { server.closeAllConnections(); await new Promise<void>((accept) => server.close(() => accept())); }
});
