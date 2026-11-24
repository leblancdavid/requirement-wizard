import React, { useEffect, useRef, useState } from "react";
import type { HelperView } from "../runtime/embedded/app-helper.js";
import { checkedAuthorizationURL } from "../runtime/embedded/auth-protocol.js";

type Request = <T>(path: string, body?: unknown) => Promise<T>;
const processLabels = { stopped: "Stopped", starting: "Starting…", running: "Running", stopping: "Stopping…", "cleanup-unconfirmed": "Cleanup unconfirmed" };
const operationLabels = { idle: "None", checking: "Checking saved connection", "signing-in": "Signing in" };
export function EmbeddedHelperSettings({ request }: { request: Request }) {
  const [expanded, setExpanded] = useState(false);
  return <details className="helper-diagnostics" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>Experimental helper diagnostics</summary>
    {expanded && <EmbeddedHelperPanel request={request} />}
  </details>;
}
function EmbeddedHelperPanel({ request }: { request: Request }) {
  const [view, setView] = useState<HelperView>();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false), sequence = useRef(0), acting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let stopped = false, polling = false;
    const poll = async () => {
      if (polling || acting.current) return;
      polling = true;
      const current = ++sequence.current;
      try {
        const result = await request<HelperView>("helper");
        if (result.authorization) checkedAuthorizationURL(result.authorization.url);
        if (!stopped && current === sequence.current) { setView(result); setError(""); }
      }
      catch { if (!stopped && current === sequence.current) setError("Helper status is unavailable. Refresh Settings or restart the app after updating it."); }
      finally { polling = false; }
    };
    void poll(); const timer = setInterval(() => void poll(), 1000);
    return () => { stopped = true; mounted.current = false; sequence.current++; clearInterval(timer); };
  }, [request]);
  const active = !!view && view.operation !== "idle";
  async function act(action: "check" | "login" | "stop") {
    if (acting.current) return;
    acting.current = true;
    const current = ++sequence.current;
    setBusy(true); setError("");
    try {
      const result = await request<HelperView>(`helper/${action}`, action === "stop" ? {} : { acceptSDKStorage: consent });
      if (result.authorization) checkedAuthorizationURL(result.authorization.url);
      if (mounted.current && current === sequence.current) setView(result);
    }
    catch (error) { if (mounted.current && current === sequence.current) setError(error instanceof Error ? error.message : "Helper request failed."); }
    finally { acting.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="ai-connections" aria-label="Embedded coding helper">
    <h2>Embedded coding helper <small>Experimental</small></h2>
    <p>A separate ChatGPT connection for the embedded engine pilot. It does not change this project’s AI selection. Coding and model calls are disabled.</p>
    <p>Each check starts a private helper, inspects the saved connection and stops it. Sign-in keeps it running only until authorization finishes or you stop it.</p>
    {error && <p role="alert">{error}</p>}
    {!view ? <p>Loading helper status…</p> : <>
      <dl>
        <dt>Bundle</dt><dd>{view.available ? "Available" : "Unavailable — build the optional helper bundle with npm run build:embedded-helper, then refresh this page."}</dd>
        <dt>Helper process</dt><dd>{processLabels[view.process]}</dd>
        <dt>Operation</dt><dd>{operationLabels[view.operation]}</dd>
        <dt>Saved connection (last observation)</dt><dd>{view.connection ? `${view.connection.count} saved; ${view.connection.needsAuth} need sign-in` : "Not checked"}</dd>
        {view.connection && <><dt>Last checked</dt><dd>{new Date(view.connection.checkedAt).toLocaleString()}</dd></>}
      </dl>
      <p role="status">{view.message}</p>
      {view.counters && <p>Last operation: {view.counters.providerRequests} auth requests · {view.counters.socketConnections} socket connections · {view.counters.callbackListeners} callback listeners · {view.counters.prompts} model calls. Auth requests alone do not prove token refresh.</p>}
      <label><input type="checkbox" checked={consent} disabled={active || busy} onChange={event => setConsent(event.target.checked)} /> I accept SDK credentials stored as plaintext SQLite, restricted to my Windows user and LocalSystem—not encrypted. No existing OpenCode or direct-provider credentials are imported.</label>
      <div className="button-row">
        <button className="secondary" disabled={!view.available || !consent || active || busy || view.process === "cleanup-unconfirmed"} onClick={() => void act("check")}>Check saved helper connection</button>
        <button className="secondary" disabled={!view.available || !consent || active || busy || view.process === "cleanup-unconfirmed"} onClick={() => void act("login")}>Sign in to helper</button>
        <button className="quiet" disabled={!active || busy} onClick={() => void act("stop")}>Stop helper</button>
      </div>
      {view.authorization && active && <p><a href={view.authorization.url} target="_blank" rel="noreferrer" onClick={event => {
        if (window.reqwizitDesktop) { event.preventDefault(); void window.reqwizitDesktop.openExternal(view.authorization!.url).catch(() => setError("Could not open the sign-in browser.")); }
      }}>Open helper sign-in ↗</a> · Expires {new Date(view.authorization.expiresAt).toLocaleTimeString()}. Do not copy this one-time URL into logs. The browser may call this connection OpenCode.</p>}
      <small>Closing Settings does not cancel an active sign-in; return here to see its result or stop it. Closing the app stops its owned helper, but does not remove saved credentials or revoke the provider grant. Another CLI/app holding the same store will block this helper rather than be terminated.</small>
    </>}
  </section>;
}
