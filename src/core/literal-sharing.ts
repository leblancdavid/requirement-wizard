import { createHash } from "node:crypto";

/** Pure literal-compression work only, never context, permission or model verdict
 * reuse. The key includes every participating string in its exact traversal order.
 * JSON escaping distinguishes lone surrogates that UTF-8 hashing would collapse. */
export class LiteralSharingCache {
  private readonly entries = new Map<string, { repeated: readonly string[]; bytes: number }>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  constructor(private readonly limits = { entries: 64, bytes: 2 * 1024 * 1024 }) {}
  profile() { return { hits: this.hits, misses: this.misses, entries: this.entries.size, bytes: this.bytes }; }
  plan(strings: readonly string[], sharePhrases: boolean, phrasePolicy?: "joint-v1"): readonly string[] {
    const digest = createHash("sha256").update(JSON.stringify([sharePhrases, phrasePolicy]));
    for (const text of strings) digest.update(JSON.stringify(text)).update("\0");
    const key = digest.digest("hex"), cached = this.entries.get(key);
    if (cached) {
      this.hits++; this.entries.delete(key); this.entries.set(key, cached); return cached.repeated;
    }
    this.misses++;
    const repeated = Object.freeze(prepareLiteralSharing(strings, sharePhrases, phrasePolicy));
    const bytes = 256 + repeated.reduce((sum, text) => sum + text.length * 2 + 64, 0);
    if (this.limits.entries > 0 && bytes <= this.limits.bytes) {
      // Own bounded flat UTF-16 copies: a short SlicedString must not pin a huge
      // original source/JSON buffer after a project or context is released.
      // UTF-8 copying would corrupt unpaired surrogate evidence.
      const retained = Object.freeze(repeated.map(text => Buffer.from(text, "utf16le").toString("utf16le")));
      this.entries.set(key, { repeated: retained, bytes }); this.bytes += bytes;
      while (this.entries.size > this.limits.entries || this.bytes > this.limits.bytes) {
        const first = this.entries.entries().next().value!;
        this.entries.delete(first[0]); this.bytes -= first[1].bytes;
      }
      return retained;
    }
    return repeated;
  }
}
export const literalSharingCache = new LiteralSharingCache();

function prepareLiteralSharing(strings: readonly string[], sharePhrases: boolean, phrasePolicy?: "joint-v1") {
  const frequencies = new Map<string, number>();
  for (const text of strings) frequencies.set(text, (frequencies.get(text) ?? 0) + 1);
  // First-occurrence order is identical to the legacy Set built from every field;
  // duplicate full fields cannot contribute new lines or change their order.
  const candidates = new Set([...frequencies.keys()].flatMap(text => [text, ...text.split(/\r?\n/).filter(line => line.length >= 80)]));
  if (sharePhrases) {
    const phrases = new Map<string, number>();
    let scanned = 0;
    // Keep repetitions and the exact 250k prefix: this is the historical phrase
    // inventory/ranking rule, not a new linguistic or semantic approximation.
    for (const text of strings) {
      if (scanned >= 250000) break;
      const available = text.slice(0, 250000 - scanned); scanned += available.length;
      const words = [...available.matchAll(/\S+/g)];
      for (let at = 0; at < words.length; at++) for (const width of phrasePolicy ? [8, 16, 32] : [8, 16]) {
        const last = words[at + width - 1]; if (!last) continue;
        const start = words[at]!.index!, end = last.index! + last[0].length, length = end - start;
        if (length < 80 || length > (phrasePolicy ? 1024 : 512)) continue;
        const phrase = available.slice(start, end), count = phrases.get(phrase);
        if (count !== undefined || phrases.size < (phrasePolicy ? 16384 : 4096)) phrases.set(phrase, (count ?? 0) + 1);
      }
    }
    const saving = ([text, count]: [string, number]) => count * (text.length - 32) - text.length - 40;
    for (const [text] of [...phrases].filter(entry => entry[1] >= (phrasePolicy ? 2 : 3) && saving(entry) > 0)
      .sort((a, b) => saving(b) - saving(a) || (phrasePolicy ? a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0 : a[0].localeCompare(b[0]))).slice(0, phrasePolicy ? 256 : 64)) candidates.add(text);
  }
  return [...candidates].filter(text => {
    let occurrences = 0;
    for (const [value, frequency] of frequencies) {
      let from = 0, at: number;
      while ((at = value.indexOf(text, from)) !== -1) {
        occurrences += frequency;
        if (occurrences >= 2) return true;
        from = at + text.length;
      }
    }
    return false;
  }).sort((a, b) => b.length - a.length);
}
