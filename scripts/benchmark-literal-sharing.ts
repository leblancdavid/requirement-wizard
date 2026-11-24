import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { LiteralSharingCache } from "../src/core/literal-sharing.js";
import { shareRepeatedText } from "../src/core/working-set.js";

// Deterministic synthetic evidence only; no files, providers or model calls.
// Compare the same current encoder with/without memo retention, never authority.
const phrase = "Preserve every original recovery choice, exact supporting source and unanswered foundational decision without guessing precedence. ";
const input = { revision: 17, sources: Array.from({ length: 96 }, (_, i) => ({ id: `source-${i}`, kind: "answer",
  text: `Original ${i % 12}: ${phrase.repeat(7)}\r\nOriginal detail ${i}: ${phrase.repeat(2)}` })) };
const iterations = 16;
const run = (memo: LiteralSharingCache) => {
  const start = performance.now(); let digest = "";
  for (let i = 0; i < iterations; i++) {
    // Metadata changes still render in the output even when the literal plan hits.
    const output = shareRepeatedText({ ...input, revision: input.revision + i }, true, true, [], "joint-v1", memo);
    digest = createHash("sha256").update(JSON.stringify(output)).digest("hex");
  }
  return { elapsedMs: performance.now() - start, digest, ...memo.profile() };
};
const uncached = run(new LiteralSharingCache({ entries: 0, bytes: 0 })), cached = run(new LiteralSharingCache());
assert.equal(cached.digest, uncached.digest); assert.equal(cached.hits, iterations - 1); assert.equal(cached.misses, 1);
console.log(JSON.stringify({ fixtureOnly: true, iterations, sources: input.sources.length, uncached, cached,
  limitation: "Literal compression only; not end-to-end discovery latency, semantic cache reuse or a live model benchmark" }));
