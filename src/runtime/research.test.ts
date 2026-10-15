import assert from "node:assert/strict";
import test from "node:test";
import type { ToolPart } from "@opencode-ai/sdk/v2/client";
import { retrievedEvidence } from "./research.js";

function tool(name: string, output: string, url = "https://example.com/spec"): ToolPart {
  return { id: name, sessionID: "fixture", messageID: "fixture", callID: "fixture", type: "tool", tool: name,
    state: { status: "completed", input: { url }, output, title: "Fixture", metadata: {}, time: { start: 0, end: 1 } } };
}
test("retrieval evidence distinguishes fetched pages from search snippets and ignores merely linked pages", () => {
  const page = tool("webfetch", "A specification linking to https://unread.example/other");
  const search = tool("websearch", "Result: https://search.example/result — a snippet");
  const evidence = retrievedEvidence([page, search]);
  assert.equal(evidence.length, 2);
  assert.equal(evidence.find((item) => item.url === "https://example.com/spec")!.kind, "fetched-page");
  assert.equal(evidence.find((item) => item.url === "https://search.example/result")!.kind, "search-result");
  assert.equal(evidence.some((item) => item.url.includes("unread.example")), false);
});
test("failed tools, disallowed tools, and credential-bearing URLs cannot become research evidence", () => {
  const failed = tool("webfetch", ""); failed.state = { status: "error", input: { url: "https://example.com/failed" }, error: "failed", time: { start: 0, end: 1 } };
  assert.deepEqual(retrievedEvidence([failed, tool("bash", "https://example.com/"), tool("webfetch", "body", "https://user:secret@example.com/private")]), []);
});
