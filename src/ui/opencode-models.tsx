import React, { useEffect, useRef, useState } from "react";
import type { ModelCatalog } from "../runtime/catalog.js";
import { ActivityFeedback } from "./activity.js";

export function OpenCodeModels({ request, providerID, modelID, disabled, onSelect }: {
  request: <T>(path: string, body?: unknown) => Promise<T>;
  providerID: string; modelID: string; disabled: boolean;
  onSelect: (providerID: string, modelID: string) => void;
}) {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const sequence = useRef(0);
  async function load(refresh = false) {
    const current = ++sequence.current;
    setLoading(true); setError("");
    try {
      const result = await request<ModelCatalog>(`connections/opencode${refresh ? "?refresh=true" : ""}`);
      if (current === sequence.current) setCatalog(result);
    } catch (error) { if (current === sequence.current) setError((error as Error).message); }
    finally { if (current === sequence.current) setLoading(false); }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 300_000);
    return () => { sequence.current++; clearInterval(timer); };
  }, []);
  const provider = catalog?.providers.find((item) => item.id === providerID);
  const matchingModels = provider?.models.filter((item) => item.id === modelID || `${item.name} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => { setQuery(""); }, [providerID]);
  return <>
    <label>AI provider<select aria-label="AI provider" value={providerID} disabled={disabled || loading} onChange={(event) => onSelect(event.target.value, "")}>
      <option value="">Choose a provider</option>
      {providerID && !provider && <option value={providerID}>{providerID} · not in current connected list</option>}
      {catalog?.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <label>Search models<input type="search" aria-label="Search models" placeholder="Find a model by name" value={query} disabled={disabled || loading} onChange={(event) => setQuery(event.target.value)} /></label>
    <label>OpenCode model<select aria-label="OpenCode model" value={modelID} disabled={disabled || loading} onChange={(event) => onSelect(providerID, event.target.value)}>
      <option value="">{loading ? "Loading models…" : "Choose a model"}</option>
      {modelID && !provider?.models.some((item) => item.id === modelID) && <option value={modelID}>{modelID} · not in current catalog</option>}
      {matchingModels?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    {query && <small>The list shows matching models and your current selection.</small>}
    {loading && <ActivityFeedback label="Loading OpenCode providers and models…" />}
    {error && <p role="alert">{error}</p>}
    {catalog?.stale && <p role="status">{catalog.warning}</p>}
    {catalog && <small>Model list updated {new Date(catalog.fetchedAt).toLocaleString()}.</small>}
    {!loading && catalog?.providers.length === 0 && <p>No connected providers found. Connect a provider in OpenCode, then refresh models.</p>}
    <button className="secondary" disabled={disabled || loading} onClick={() => void load(true)}>Refresh models</button>
    <p>Uses your selected provider through OpenCode. Its account and billing rules apply. A listed model does not guarantee account access or support for every task. Loading this list does not send a model request.</p>
  </>;
}
