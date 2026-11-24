import React, { useEffect, useRef, useState } from "react";
import type { Account, LoginStatus, Model } from "../providers/connections.js";
import { ActivityBar, ActivityFeedback, Spinner, useActivity } from "./activity.js";
import { ActionScope } from "./action-button.js";
import { DiagnosticNotice } from "./diagnostic-notice.js";
import { OpenCodeModels } from "./opencode-models.js";

type Request = <T>(path: string, body?: unknown) => Promise<T>;
export function AIConnections({ request, accountID, currentAccountID, providerID, modelID, onSelect: select, current, children, disabled = false }: {
  request: Request; accountID: string; currentAccountID?: string; providerID: string; modelID: string; onSelect: (accountID: string, modelID: string, providerID: string) => void; current?: React.ReactNode; children?: React.ReactNode; disabled?: boolean;
}) {
  const onSelect = (account: string, model: string) => select(account, model, "openai");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [available, setAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [modelQuery, setModelQuery] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setBusy] = useState(false);
  const busy = working || disabled;
  const [testing, setTesting] = useState(false);
  const [login, setLogin] = useState<LoginStatus | null>(null);
  const [authURL, setAuthURL] = useState("");
  const [welcome, setWelcome] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const mounted = useRef(true);
  const catalogSequence = useRef(0);
  const selection = useRef(accountID); selection.current = accountID;
  const activeLogin = !!login && ["waiting", "validating"].includes(login.status);
  const activityLabel = testing ? "Testing AI connection…" : activeLogin ? login?.status === "validating" ? "Validating account…" : "Waiting for ChatGPT sign-in…" : loadingModels ? "Loading models…" : !loaded ? "Loading saved connections…" : "Updating AI connection…";
  useActivity(working || testing || activeLogin || loadingModels || !loaded && !error, activityLabel);
  async function reload() {
    const result = await request<{ available: boolean; accounts: Account[] }>("connections");
    if (mounted.current) { setAccounts(result.accounts); setAvailable(result.available); setLoaded(true); }
  }
  async function catalog(id: string) {
    const sequence = ++catalogSequence.current;
    setModels([]); setLoadingModels(true);
    try {
      const result = await request<{ models: Model[] }>("connections/models", { accountID: id });
      if (mounted.current && sequence === catalogSequence.current && selection.current === id) setModels(result.models);
    } catch (error) { if (mounted.current && sequence === catalogSequence.current) setError((error as Error).message); }
    finally { if (mounted.current && sequence === catalogSequence.current) setLoadingModels(false); }
  }
  useEffect(() => {
    mounted.current = true;
    void reload().catch((error: Error) => setError(error.message));
    const pending = sessionStorage.getItem("reqwizit-login");
    if (pending) setLogin({ id: pending, status: "waiting" });
    return () => { mounted.current = false; catalogSequence.current++; };
  }, []);
  useEffect(() => {
    setMessage(""); setError(""); setModelQuery("");
    if (accountID) void catalog(accountID);
    else { catalogSequence.current++; setModels([]); setLoadingModels(false); }
  }, [accountID]);
  useEffect(() => {
    if (!activeLogin || !login) return;
    let stopped = false, polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await request<LoginStatus>(`connections/login?id=${encodeURIComponent(login.id)}`);
        if (stopped) return;
        if (!["waiting", "validating"].includes(result.status)) {
          sessionStorage.removeItem("reqwizit-login"); setAuthURL("");
          if (result.status === "connected") {
            await reload();
            if (stopped) return;
            if (!localStorage.getItem(`reqwizit-plan-confirmed:${result.accountID}`)) setWelcome(result.accountID!);
            setMessage("ChatGPT account connected. Choose a model above, then save the selection for this project or use it when creating a project.");
            onSelect(result.accountID!, "");
            // Reconnecting the same account also refreshes its catalog.
            if (selection.current === result.accountID) void catalog(result.accountID);
          } else setError(result.error ?? "Sign-in cancelled.");
        }
        if (!stopped) setLogin(result);
      } catch (error) {
        if (!stopped) { sessionStorage.removeItem("reqwizit-login"); setLogin(null); setAuthURL(""); setError((error as Error).message); }
      } finally { polling = false; }
    };
    void poll(); const timer = setInterval(() => void poll(), 1500);
    return () => { stopped = true; clearInterval(timer); };
  }, [login?.id, activeLogin]);
  async function act(operation: () => Promise<void>) {
    setError(""); setMessage(""); setBusy(true);
    try { await operation(); } catch (error) { if (mounted.current) setError((error as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  }
  function signIn(existing?: string) {
    // Open synchronously with the click so browser popup blocking has a fallback link.
    const popup = window.reqwizitDesktop ? null : window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    void act(async () => {
      try {
        const result = await request<{ id: string; url: string }>("connections/login", existing ? { accountID: existing } : {});
        const url = new URL(result.url);
        if (url.origin !== "https://auth.openai.com") throw new Error("Unexpected sign-in destination.");
        sessionStorage.setItem("reqwizit-login", result.id);
        if (mounted.current) { setLogin({ id: result.id, status: "waiting" }); setAuthURL(result.url); }
        if (popup) popup.location.href = result.url;
        else if (window.reqwizitDesktop) await window.reqwizitDesktop.openExternal(result.url);
      } catch (error) { popup?.close(); throw error; }
    });
  }
  const account = accounts.find((item) => item.id === accountID);
  return <ActionScope reason={testing ? "Wait for the connection test to finish." : activeLogin ? "Complete or cancel the current ChatGPT sign-in first." : loadingModels ? "Wait for the model catalog to finish loading." : !available ? "Direct ChatGPT sign-in is unavailable. Check the connection service status." : busy ? "Wait for the current connection request to finish." : "Select a connected account and an available model first."}><section className="ai-connections" aria-label="AI connections">
    <h2>Project AI</h2>
    {current}
    <p>Choose the AI for requirements work. Changing these fields does not switch an existing project until you save.</p>
    {error && <DiagnosticNotice detail={error} summary="Your AI connection needs attention." next="Check your account and selected AI, or reconnect. If this continues, see Technical details." alert />}
    {!activeLogin && (working || testing || loadingModels) && <ActivityFeedback label={activityLabel} />}
    {message && <p role="status" className="connection-notice">{message}</p>}
    {welcome && <div className="connection-notice" role="status"><strong>Your ChatGPT plan is connected</strong><p>Connecting an account does not change this project’s active connection. Choose a model and save the selection, or use it when creating a project. Eligible requests use your plan or credits.</p><button className="secondary" onClick={() => { localStorage.setItem(`reqwizit-plan-confirmed:${welcome}`, "true"); setWelcome(null); }}>Got it</button></div>}
    {!loaded && !error && <ActivityFeedback label="Loading saved connections…" />}
    <label>AI connection<select aria-label="AI connection" value={accountID} disabled={busy || testing || activeLogin} onChange={(event) => { onSelect(event.target.value, event.target.value ? "" : "gpt-6.1-sol"); }}>
      <option value="">OpenCode · existing connection</option>
      {accountID && !account && <option value={accountID}>Disconnected account · reconnect or choose another</option>}
      {accounts.map((item) => <option key={item.id} value={item.id}>ChatGPT · {item.label}</option>)}
    </select></label>
    {accountID ? <>
      <label>Search models<input type="search" aria-label="Search models" placeholder="Find a model by name" value={modelQuery} disabled={loadingModels || busy || testing || activeLogin} onChange={(event) => setModelQuery(event.target.value)} /></label>
      <label>ChatGPT model<select aria-label="ChatGPT model" value={modelID} disabled={loadingModels || busy || testing || activeLogin} onChange={(event) => onSelect(accountID, event.target.value)}>
        <option value="">{loadingModels ? "Loading models…" : "Choose a model"}</option>
        {modelID && !models.some((item) => item.id === modelID) && <option value={modelID}>{modelID} · not in current catalog</option>}
        {models.filter((item) => item.id === modelID || `${item.name} ${item.id}`.toLowerCase().includes(modelQuery.trim().toLowerCase())).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
      </select></label>
      {modelQuery && <small>The list shows matching models and your current selection.</small>}
      <p className="plan-label">Selected connection: uses your ChatGPT plan. Web research is not available with this connection yet.</p>
      <div className="button-row">
        <button className="secondary" disabled={busy || testing || activeLogin || loadingModels || !account} onClick={() => void catalog(accountID)}>{loadingModels && <Spinner />}Refresh models</button>
      </div>
    </> : <OpenCodeModels request={request} providerID={providerID} modelID={modelID} disabled={busy || testing || activeLogin} onSelect={(provider, model) => select("", model, provider)} />}
    {children}
    <section className="connected-accounts" aria-label="Connected accounts">
      <div className="connection-heading"><h3>Connected accounts</h3><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage usage ↗</a></div>
      <p>Manage saved direct ChatGPT accounts here. Adding or reconnecting an account does not change the project’s saved AI. OpenCode accounts are managed in OpenCode; the experimental helper uses its own separate store.</p>
      <p>Connections with the same email can be separate registrations. Use the unique label ending to distinguish them. Only connections used by this project or selected in its picker are marked here; unmarked connections may be used by other projects.</p>
      {accounts.length ? <ul className="saved-account-list">{accounts.map(item => <li key={item.id} aria-label={`Saved connection ${item.label}`}>
        <div><strong>{item.label}</strong>{item.id === currentAccountID && <p className="plan-label">Used by this project</p>}{item.id === accountID && <p>Selected in picker{item.id !== currentAccountID ? " — not the saved project connection" : ""}</p>}</div><div className="button-row">
        <button className="quiet" disabled={!available || busy || testing || activeLogin} onClick={() => signIn(item.id)}>Reconnect</button>
        <button className="quiet" disabled={!available || busy || testing || activeLogin || loadingModels} onClick={() => { setRemoving(item.id); setConfirmRemoval(false); }}>Remove connection…</button>
      </div>{removing === item.id && <div className="connection-notice connection-removal" role="group" aria-label={`Remove connection ${item.label}`}>
        <p><strong>Remove {item.label}?</strong></p>
        {item.id === currentAccountID && <p>This is the project’s current saved connection. After removal, requests using it will fail until you explicitly save a replacement.</p>}
        {item.id === accountID && item.id !== currentAccountID && <p>This connection is selected in the picker. Removing it will not select another account for you.</p>}
        <p>This ends this registration’s renewable ChatGPT session, then removes its saved credentials from this app. If revocation fails, the connection is kept. Other saved connections and project history are not removed.</p>
        <p>Other projects may still reference this connection. Their saved selections will remain unchanged; there is no automatic fallback.</p>
        <label><input type="checkbox" checked={confirmRemoval} disabled={busy} onChange={event => setConfirmRemoval(event.target.checked)} /> I understand and want to remove this saved connection.</label>
        <div className="button-row"><button className="secondary" disabled={!confirmRemoval || busy || testing || activeLogin || loadingModels} onClick={() => void act(async () => {
          await request("connections/disconnect", { accountID: item.id });
          setAccounts(previous => previous.filter(saved => saved.id !== item.id));
          if (item.id === accountID) { catalogSequence.current++; setModels([]); setLoadingModels(false); }
          if (welcome === item.id) setWelcome(null);
          setRemoving(null); setConfirmRemoval(false);
          await reload();
          setMessage("Saved connection removed. Other connections and project selections are unchanged.");
        })}>Confirm removal</button><button className="quiet" disabled={busy} onClick={() => { setRemoving(null); setConfirmRemoval(false); }}>Keep connection</button></div>
      </div>}</li>)}</ul> : loaded && <p>No direct ChatGPT accounts saved.</p>}
      <div className="button-row"><button className="secondary" disabled={!available || busy || activeLogin || testing} onClick={() => signIn()}>Add ChatGPT account</button>
        <button className="quiet" disabled={busy || activeLogin || testing} onClick={() => void act(async () => { setRemoving(null); setConfirmRemoval(false); await reload(); })}>Refresh connections</button></div>
      {loaded && !available && <p>Direct sign-in is unavailable in this setup. You can still use a saved OpenCode connection.</p>}
      {activeLogin && <div className="connection-notice" role="status"><strong><Spinner />{login.status === "validating" ? "Validating your account…" : "Waiting for ChatGPT sign-in…"}</strong><ActivityBar label="Account authorization progress" /><p>Complete authorization in the other tab, then return here. This attempt expires after three minutes.</p>{authURL && <a href={authURL} target="_blank" rel="noreferrer">Open sign-in tab ↗</a>}<button className="quiet" disabled={busy} onClick={() => void act(async () => { await request("connections/cancel-login", { id: login.id }); setLogin({ ...login, status: "cancelled" }); sessionStorage.removeItem("reqwizit-login"); setAuthURL(""); })}>Cancel sign-in</button></div>}
      {accountID && <div className="connection-test"><p>Test selection: {account?.label ?? "Unavailable account"} · {modelID || "Choose a model above"}. This tests the dropdown selection, not necessarily the project’s current AI.</p>
        <button className="secondary" disabled={busy || testing || activeLogin || !account || !models.some((model) => model.id === modelID)} onClick={() => { setTesting(true); void act(async () => { await request("connections/test", { accountID, modelID }); setMessage("Connection test passed. The selected model returned a valid response."); }).finally(() => { if (mounted.current) setTesting(false); }); }}>Test connection</button>
        {testing && <button className="secondary" onClick={() => { void request("connections/cancel-test", {}).catch((error: Error) => setError(error.message)); }}>Stop test</button>}
        <p><small>Testing sends a short request and uses your plan’s allowance. Browsing model choices does not run inference.</small></p>
      </div>}
    </section>
  </section></ActionScope>;
}
