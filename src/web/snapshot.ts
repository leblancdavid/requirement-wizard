import { createHash } from "node:crypto";
import { z } from "zod";

export type SnapshotTokens = Record<string, string>;
export const snapshotHeader = "X-Reqwizit-Snapshot";
const tokensSchema = z.record(z.string().regex(/^[a-f0-9]{64}$/)).refine((value) => Object.keys(value).length <= 20);

export function parseSnapshotTokens(value: string): SnapshotTokens {
  if (value.length > 4096) throw new Error("Snapshot tokens are too large.");
  return tokensSchema.parse(JSON.parse(value));
}

/** Content tokens include volatile sections: revisions alone do not identify a snapshot.
 * Only explicitly immutable inputs may reuse serialization; progress arrays can mutate.
 */
export class SnapshotEncoder {
  private immutable = new WeakMap<object, { text: string; token: string }>();
  encode(snapshot: object, known: SnapshotTokens, immutableKeys: readonly string[] = []) {
    const tokens: SnapshotTokens = {}, sections: string[] = [];
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) continue;
      const cacheable = immutableKeys.includes(key) && value !== null && typeof value === "object";
      let encoded = cacheable ? this.immutable.get(value as object) : undefined;
      if (!encoded) {
        const text = JSON.stringify(value);
        encoded = { text, token: createHash("sha256").update(text).digest("hex") };
        if (cacheable) this.immutable.set(value as object, encoded);
      }
      tokens[key] = encoded.token;
      if (known[key] !== encoded.token) sections.push(`${JSON.stringify(key)}:${encoded.text}`);
    }
    return { tokens, body: `{${sections.join(",")}}` };
  }
}
