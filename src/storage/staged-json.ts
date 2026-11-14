import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";

export type StagedArtifact = { path: string; hash: string; bytes: number };
export const portableArtifactLimit = 64 * 1024 * 1024;
export const portableProjectLimit = 256 * 1024 * 1024;

/** Exact JSON.stringify(value, null, 2) bytes for app-owned JSON graphs, without
 * constructing the whole document string. Shared nodes are emitted each time;
 * only ancestor cycles are rejected. No mutation, replacers or arbitrary toJSON. */
export function writePrettyJSON(value: unknown, write: (chunk: string) => void) {
  const ancestors = new Set<object>();
  let buffer = "";
  const emit = (text: string) => {
    // Do not split a UTF-16 pair before conversion to UTF-8 by the consumer.
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(text.length, offset + 16384);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
      buffer += text.slice(offset, end); offset = end;
      if (buffer.length >= 16384) { write(buffer); buffer = ""; }
    }
  };
  const string = (text: string) => {
    if (text.length <= 16384) { emit(JSON.stringify(text)); return; }
    // Encode bounded slices, not another full copy of a retained human/model
    // body. Never split a surrogate pair: JSON.stringify escapes lone surrogates.
    emit('"');
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(text.length, offset + 16384);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!) && /[\uDC00-\uDFFF]/.test(text[end]!)) end--;
      emit(JSON.stringify(text.slice(offset, end)).slice(1, -1)); offset = end;
    }
    emit('"');
  };
  const visit = (item: unknown, depth: number) => {
    if (typeof item === "string") { string(item); return; }
    if (item === null || typeof item !== "object") { emit(JSON.stringify(item) ?? "null"); return; }
    if (ancestors.has(item)) throw new Error("Cannot publish cyclic JSON evidence.");
    if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null && !Array.isArray(item))
      throw new Error("Portable publication requires plain JSON records.");
    ancestors.add(item);
    const array = Array.isArray(item);
    emit(array ? "[" : "{");
    let count = 0;
    const entry = (key: string | undefined, child: unknown) => {
      emit(`${count++ ? "," : ""}\n${"  ".repeat(depth + 1)}`);
      if (key !== undefined) { string(key); emit(": "); }
      visit(child, depth + 1);
    };
    if (array) {
      // No tuple/key array proportional to a large evidence container. Sparse
      // slots, undefined and functions still emit null exactly like JSON.stringify.
      for (let index = 0; index < item.length; index++) entry(undefined, item[index]);
    } else {
      for (const key in item) {
        if (!Object.hasOwn(item, key)) continue;
        const child = (item as Record<string, unknown>)[key];
        if (child !== undefined && typeof child !== "function" && typeof child !== "symbol") entry(key, child);
      }
    }
    if (count) emit(`\n${"  ".repeat(depth)}`);
    emit(array ? "]" : "}"); ancestors.delete(item);
  };
  visit(value, 0); emit("\n"); if (buffer) write(buffer);
}

export function stageJSON(directory: string, value: unknown, limit = portableArtifactLimit): StagedArtifact {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `.reqwizit-${randomUUID()}.tmp`), digest = createHash("sha256");
  let bytes = 0;
  const fd = openSync(path, "wx");
  try {
    writePrettyJSON(value, chunk => {
      const data = Buffer.from(chunk, "utf8"); bytes += data.length;
      if (bytes > limit) throw new Error("Portable artifact exceeds the supported 64 MiB import size. SQLite work is retained; no managed files were replaced.");
      digest.update(data);
      for (let offset = 0; offset < data.length;) {
        const written = writeSync(fd, data, offset, data.length - offset);
        if (!written) throw new Error("Portable staging write made no progress; SQLite work is retained.");
        offset += written;
      }
    });
    fsyncSync(fd);
  } catch (error) { closeSync(fd); unlinkSync(path); throw error; }
  closeSync(fd); return { path, bytes, hash: digest.digest("hex") };
}
export function discardStaged(artifact: StagedArtifact | undefined) {
  if (artifact && existsSync(artifact.path)) unlinkSync(artifact.path);
}
