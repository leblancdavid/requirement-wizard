import { createHash } from "node:crypto";

/** Publication-private structural sharing, never a durable format or authority.
 * Exact ordered JSON structure is shared across separately decoded paid jobs so
 * repeated stage prefixes do not retain hundreds of duplicate object graphs.
 * Callers must use copy-on-write when sanitizing these private shared values. */
export class PublicationObjects {
  private readonly nodes = new Map<string, { value: unknown; bytes: number }>();
  private bytes = 0;
  readonly profile = { reusedNodes: 0, createdNodes: 0, peakCacheBytes: 0 };
  constructor(private readonly limit = 8 * 1024 * 1024, private readonly entries = 8192) {}

  share<T>(value: T): T { return this.visit(value).value as T; }

  /** The output graph owns retained nodes; the lookup table is no longer needed
   * during rendering and must not pin discarded historical jobs. */
  clear() { this.nodes.clear(); this.bytes = 0; }

  private visit(input: unknown): { value: unknown; id: string } {
    let value: unknown, signature: string, bytes: number;
    if (Array.isArray(input)) {
      const children = input.map(item => this.visit(item));
      value = children.map(child => child.value);
      signature = JSON.stringify(["array", children.map(child => child.id)]);
      bytes = 192 + input.length * 8;
    } else if (input !== null && typeof input === "object") {
      const children = Object.entries(input).map(([key, item]) => [key, this.visit(item)] as const);
      value = Object.fromEntries(children.map(([key, child]) => [key, child.value]));
      signature = JSON.stringify(["object", children.map(([key, child]) => [key, child.id])]);
      bytes = 192 + children.reduce((n, [key]) => n + 24 + key.length * 2, 0);
    } else {
      value = input;
      signature = JSON.stringify([typeof input, Object.is(input, -0) ? "negative-zero" : input]);
      bytes = 192 + (typeof input === "string" ? input.length * 2 : 8);
    }
    const id = createHash("sha256").update(signature).digest("hex"), cached = this.nodes.get(id);
    if (cached) { this.profile.reusedNodes++; return { id, value: cached.value }; }
    this.profile.createdNodes++;
    if (bytes <= this.limit) {
      this.nodes.set(id, { value, bytes }); this.bytes += bytes;
      while (this.bytes > this.limit || this.nodes.size > this.entries) {
        const first = this.nodes.keys().next().value!;
        this.bytes -= this.nodes.get(first)!.bytes; this.nodes.delete(first);
      }
      this.profile.peakCacheBytes = Math.max(this.profile.peakCacheBytes, this.bytes);
    }
    return { id, value };
  }
}
