import { z } from "zod";
import { startRuntime } from "./server.js";

// Explicit projection: never return provider options, environment fields or credentials.
const catalogSchema = z.object({
  connected: z.array(z.string()),
  all: z.array(z.object({ id: z.string().min(1), name: z.string(), models: z.record(z.object({ name: z.string() })) })),
});
export type ModelCatalog = {
  providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>;
  fetchedAt: string; stale: boolean; warning?: string;
};
export interface CatalogSource {
  get(refresh?: boolean): Promise<ModelCatalog>;
  close(): Promise<void>;
}
export function connectedCatalog(raw: unknown): ModelCatalog["providers"] {
  const catalog = catalogSchema.parse(raw);
  return catalog.all.filter((provider) => catalog.connected.includes(provider.id)).map((provider) => ({
    id: provider.id, name: provider.name,
    models: Object.entries(provider.models).map(([id, model]) => ({ id, name: model.name })),
  }));
}

/** Metadata only. Own a short-lived server, never a session or inference request. */
export class OpenCodeCatalog implements CatalogSource {
  private cached?: ModelCatalog;
  private pending?: Promise<ModelCatalog>;
  private readonly controller = new AbortController();
  constructor(private readonly workspace: string, private readonly load = async (signal: AbortSignal): Promise<unknown> => {
    const runtime = await startRuntime(undefined, workspace, signal);
    try { return (await runtime.client.provider.list({}, { signal })).data; }
    finally { await runtime.close(); }
  }) {}

  get(refresh = false): Promise<ModelCatalog> {
    this.controller.signal.throwIfAborted();
    if (this.pending) return this.pending;
    if (!refresh && this.cached && !this.cached.stale && Date.now() - Date.parse(this.cached.fetchedAt) < 300_000) return Promise.resolve(this.cached);
    this.pending = (async () => {
      try {
        const providers = connectedCatalog(await this.load(AbortSignal.any([this.controller.signal, AbortSignal.timeout(90_000)])));
        return this.cached = { providers, fetchedAt: new Date().toISOString(), stale: false };
      } catch {
        if (this.controller.signal.aborted) throw new Error("Model discovery stopped.");
        if (this.cached) return this.cached = { ...this.cached, stale: true, warning: "Could not refresh OpenCode models. Showing the last successful list; account access may have changed." };
        throw new Error("Could not load OpenCode providers and models. Check that OpenCode is installed and your provider is connected, then refresh models.");
      } finally { this.pending = undefined; }
    })();
    return this.pending;
  }
  async close() { this.controller.abort(); await this.pending?.catch(() => {}); }
}
