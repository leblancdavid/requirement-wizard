import { createHash } from "node:crypto";

/** Exact JSON-array bytes without allocating a string containing the entire job
 * archive. Inputs are ordinary persisted JSON values; each object is encoded once
 * at a time, and array boundaries preserve undefined/null and Unicode semantics. */
export function digestJSONArray(parts: readonly unknown[]): string {
  const hash = createHash("sha256");
  const write = (value: unknown): void => {
    if (!Array.isArray(value)) { hash.update(JSON.stringify(value) ?? "null"); return; }
    hash.update("[");
    for (let index = 0; index < value.length; index++) { if (index) hash.update(","); write(value[index]); }
    hash.update("]");
  };
  write(parts); return hash.digest("hex");
}
