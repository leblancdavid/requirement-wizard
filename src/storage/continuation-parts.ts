import { createHash } from "node:crypto";
import { z } from "zod";
import { stageJSON, discardStaged, writePrettyJSON, portableArtifactLimit, portableProjectLimit, type StagedArtifact } from "./staged-json.js";
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

/** Keep small checkpoints byte-identical. Large checkpoints use independently
 * bounded JSON parts, not a giant string concatenated again during import. */
export function stageContinuation(directory: string, value: Continuation, partLimit = 8 * 1024 * 1024,
  singleLimit = portableArtifactLimit): StagedContinuation {
  try { return stageJSON(directory, value, singleLimit); }
  catch (error) { if (!(error instanceof Error) || !error.message.startsWith("Portable artifact exceeds")) throw error; }
  if (partLimit < 128 || partLimit > portableArtifactLimit) throw new Error("Invalid continuation part bound.");
  const parts: Record<string, StagedArtifact> = {}, descriptors: z.infer<typeof partSchema>[] = [];
  const counts = { jobs: 0, submissions: 0, snapshots: 0, objects: 0 };
  let bytes = 0;
  try {
    for (const field of fields) {
      let entries: [string, unknown][] = [], size = 128;
      const flush = () => {
        if (!entries.length) return;
        const staged = stageJSON(directory, { formatVersion: 1, field, entries });
        const path = `continuation/${staged.hash}.json`;
        parts[path] = staged; bytes += staged.bytes;
        if (bytes > portableProjectLimit) throw new Error("Portable project exceeds supported import size bounds. SQLite work is retained; no managed files were replaced.");
        descriptors.push({ field, path, hash: staged.hash, count: entries.length }); entries = []; size = 128;
      };
      // Iterate without duplicating a large object table or serializing all jobs
      // at once. Each individual record must still fit the existing 64 MiB gate.
      for (const key in value[field]) {
        if (!Object.hasOwn(value[field], key)) continue;
        const item = (value[field] as unknown as Record<string, unknown>)[key];
        let recordBytes = 0, indentation = 0;
        // Extra indentation in the part envelope is bounded by its line count.
        writePrettyJSON([key, item], chunk => { recordBytes += Buffer.byteLength(chunk, "utf8"); indentation += (chunk.match(/\n/g)?.length ?? 0) * 4; });
        if (entries.length && size + recordBytes + indentation > partLimit) flush();
        entries.push([key, item]); size += recordBytes + indentation + 8; counts[field]++;
        if (size >= partLimit) flush();
      }
      flush();
    }
    const index = stageJSON(directory, indexSchema.parse({ formatVersion: 2, parts: descriptors, counts }));
    return { ...index, parts };
  } catch (error) { for (const part of Object.values(parts)) discardStaged(part); throw error; }
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
