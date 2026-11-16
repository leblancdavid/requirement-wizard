import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { mkdirSync, mkdtempSync } from "node:fs";
import { startRuntime } from "../src/runtime/server.js";
import { DiscoveryRuntimes } from "../src/runtime/discovery-runtime.js";

// Explicit metadata-only integration check. No sessions, prompts or shared-service
// operations. Keep runtime-owned on-disk state in ignored development storage.
const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, "owned-health-"));
let starts = 0;
const bootstrap: typeof startRuntime = async (...args) => { starts++; return startRuntime(...args); };
const pool = new DiscoveryRuntimes(bootstrap, 10000), signal = AbortSignal.timeout(120000);
try {
  const first = await pool.acquire("openai/gpt-6.1-sol", directory, signal);
  await first.runtime.client.native.server.info({ signal });
  await first.release(true);
  const warm = await pool.acquire("openai/gpt-6.1-sol", directory, signal);
  assert.equal(warm.runtime, first.runtime); assert.equal(starts, 1);
  await warm.release(true);
  // Stop precisely this owned process to exercise unexpected idle endpoint loss.
  await warm.runtime.close();
  const fresh = await pool.acquire("openai/gpt-6.1-sol", directory, signal);
  assert.notEqual(fresh.runtime, first.runtime); assert.equal(starts, 2);
  await fresh.runtime.client.native.server.info({ signal });
  await fresh.release(true);
  console.log(JSON.stringify({ metadataOnly: true, sessionsCreated: 0, promptsSent: 0, warmReuse: true, deadOwnedServerReplaced: true, startups: starts }));
} finally { await pool.close(); }
