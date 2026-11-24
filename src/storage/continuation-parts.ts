import { createHash } from "node:crypto";
import { z } from "zod";
import { getHeapStatistics } from "node:v8";
import { stageJSON, openJSONStage, discardStaged, writePrettyJSON, portableArtifactLimit, portableProjectLimit, type StagedArtifact } from "./staged-json.js";
import type { Continuation } from "./portable.js";

export type StagedContinuation = StagedArtifact & { parts?: Record<string, StagedArtifact> };
const fields = ["jobs", "submissions", "snapshots", "objects"] as const;
const fieldSchema = z.enum(fields);
const partSchema = z.object({ field: fieldSchema, path: z.string().regex(/^continuation\/[a-f0-9]{64}\.json$/),
  hash: z.string().regex(/^[a-f0-9]{64}$/), count: z.number().int().positive() }).strict();
const indexSchema = z.object({ formatVersion: z.literal(2), parts: z.array(partSchema).min(1).max(10000),
  counts: z.object({ jobs: z.number().int().nonnegative().max(10000), submissions: z.number().int().nonnegative(),
    snapshots: z.number().int().nonnegative(), objects: z.number().int().nonnegative() }).strict() }).strict();
const entriesSchema = z.object({ formatVersion: z.literal(1), field: fieldSchema,
  entries: z.array(z.tuple([z.string(), z.unknown()])).min(1) }).strict();
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const hasRecords = (value: Continuation) => value.jobs.length > 0 || value.submissions.length > 0
  || Object.keys(value.snapshots).length > 0 || Object.keys(value.objects).length > 0;

/** Publication owns this graph. Record counts alone do not bound its size: a
 * handful of jobs can retain hundreds of MiB of original paid stage receipts.
 * Under the publisher's 256-MiB cap, reserve headroom before a speculative 64-MiB
 * whole-file pass. This selects an existing lossless representation, not omission,
 * a larger heap, a semantic freshness change or permission to repeat model calls.
 * The explicit numeric argument permits deterministic boundary tests. */
export function transferPublicationContinuation(value: Continuation, heapUsedBytes = getHeapStatistics().used_heap_size): boolean {
  return hasRecords(value) && (value.jobs.length >= 128 || Object.keys(value.objects).length >= 8192 || heapUsedBytes >= 128 * 1024 * 1024);
}

/** Keep small checkpoints byte-identical. Large checkpoints use independently
 * bounded JSON parts, not a giant string concatenated again during import. */
export function stageContinuation(directory: string, value: Continuation, partLimit = 8 * 1024 * 1024,
  singleLimit = portableArtifactLimit, transfer = false, owner?: string): StagedContinuation {
  // Publication-private graphs may be consumed. Stage them directly as existing
  // format-2 parts, avoiding the doomed whole-file pass and releasing each batch
  // before walking the rest. Never use this for caller/store-owned evidence.
  if (!transfer || !hasRecords(value)) {
    try { return stageJSON(directory, value, singleLimit, owner); }
    catch (error) { if (!(error instanceof Error) || !error.message.startsWith("Portable artifact exceeds")) throw error; }
  }
  if (partLimit < 128 || partLimit > portableArtifactLimit) throw new Error("Invalid continuation part bound.");
  const parts: Record<string, StagedArtifact> = {}, descriptors: z.infer<typeof partSchema>[] = [];
  const counts = { jobs: 0, submissions: 0, snapshots: 0, objects: 0 };
  let bytes = 0;
  let sink: ReturnType<typeof openJSONStage> | undefined;
  try {
    for (const field of fields) {
      let count = 0, size = 128;
      const flush = () => {
        if (!count) return;
        sink!.write("\n  ]\n}\n");
        const staged = sink!.finish(); sink = undefined;
        const path = `continuation/${staged.hash}.json`;
        parts[path] = staged; bytes += staged.bytes;
        if (bytes > portableProjectLimit) throw new Error("Portable project exceeds supported import size bounds. SQLite work is retained; no managed files were replaced.");
        descriptors.push({ field, path, hash: staged.hash, count }); count = 0; size = 128;
      };
      // Iterate without duplicating a large object table or serializing all jobs
      // at once. Each individual record must still fit the existing 64 MiB gate.
      for (const key in value[field]) {
        if (!Object.hasOwn(value[field], key)) continue;
        const item = (value[field] as unknown as Record<string, unknown>)[key];
        let recordBytes = 0;
        writePrettyJSON([key, item], chunk => {
          recordBytes += Buffer.byteLength(chunk, "utf8");
        }, 2, false);
        if (count && size + recordBytes + 8 > partLimit) flush();
        if (!sink) {
          sink = openJSONStage(directory, portableArtifactLimit, owner);
          sink.write(`{\n  "formatVersion": 1,\n  "field": ${JSON.stringify(field)},\n  "entries": [`);
        }
        sink.write(count ? ",\n    " : "\n    ");
        writePrettyJSON([key, item], chunk => sink!.write(chunk), 2, false);
        count++; size += recordBytes + 8; counts[field]++;
        if (transfer) delete (value[field] as unknown as Record<string, unknown>)[key];
        if (size >= partLimit) flush();
      }
      flush();
    }
    const index = stageJSON(directory, indexSchema.parse({ formatVersion: 2, parts: descriptors, counts }), portableArtifactLimit, owner);
    return { ...index, parts };
  } catch (error) { sink?.discard(); for (const part of Object.values(parts)) discardStaged(part); throw error; }
}

export function decodeContinuationParts(files: Record<string, string>, value: unknown): unknown {
  if (!value || typeof value !== "object" || !("formatVersion" in value) || value.formatVersion !== 2) return value;
  const index = indexSchema.parse(value), paths = new Set<string>();
  const result: Continuation = { formatVersion: 1, jobs: [], submissions: [], snapshots: {}, objects: {} };
  const counts = { jobs: 0, submissions: 0, snapshots: 0, objects: 0 };
  let bytes = 0;
  for (const part of index.parts) {
    if (paths.has(part.path) || part.path !== `continuation/${part.hash}.json`) throw new Error("Duplicate or mismatched continuation part.");
    paths.add(part.path);
    const text = files[part.path];
    if (text === undefined) throw new Error("Portable continuation part is missing. Saved work was not adopted.");
    const size = Buffer.byteLength(text, "utf8"); bytes += size;
    if (size > portableArtifactLimit || bytes > portableProjectLimit || digest(text) !== part.hash)
      throw new Error("Portable continuation part size or hash mismatch. Saved work was not adopted.");
    const decoded = entriesSchema.parse(JSON.parse(text));
    if (decoded.field !== part.field || decoded.entries.length !== part.count) throw new Error("Portable continuation part inventory mismatch.");
    const target = result[part.field];
    for (const [key, item] of decoded.entries) {
      if (Array.isArray(target)) {
        if (key !== String(target.length)) throw new Error("Portable continuation array order mismatch.");
        (target as unknown[]).push(item);
      } else {
        if (Object.hasOwn(target, key)) throw new Error("Duplicate portable continuation record.");
        Object.defineProperty(target, key, { value: item, enumerable: true, writable: true, configurable: true });
      }
      counts[part.field]++;
    }
  }
  if (fields.some(field => counts[field] !== index.counts[field])) throw new Error("Portable continuation is incomplete.");
  if (Object.keys(files).some(path => path.startsWith("continuation/") && !paths.has(path))) throw new Error("Unreferenced portable continuation part.");
  return result;
}

export function discardContinuation(value: StagedContinuation | undefined) {
  if (!value) return;
  for (const part of Object.values(value.parts ?? {})) discardStaged(part);
  discardStaged(value);
}
