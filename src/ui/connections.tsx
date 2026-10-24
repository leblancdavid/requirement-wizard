import React, { useEffect, useRef, useState } from "react";
import type { Account, LoginStatus, Model } from "../providers/connections.js";
import { ActivityBar, ActivityFeedback, Spinner, useActivity } from "./activity.js";
import { ActionScope } from "./action-button.js";
import { DiagnosticNotice } from "./diagnostic-notice.js";

type Request = <T>(path: string, body?: unknown) => Promise<T>;
export function AIConnections({ request, accountID, modelID, onSelect, children, disabled = false }: {
  request: Request; accountID: string; modelID: string; onSelect: (accountID: string, modelID: string) => void; children?: React.ReactNode; disabled?: boolean;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [available, setAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setBusy] = useState(false);
  const busy = working || disabled;
  const [testing, setTesting] = useState(false);
  const [login, setLogin] = useState<LoginStatus | null>(null);
  const [authURL, setAuthURL] = useState("");
  const [welcome, setWelcome] = useState<string | null>(null);
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
    setMessage(""); setError("");
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
            setMessage("ChatGPT account connected. Choose a model below, then save the selection for this project or use it when creating a project.");
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
    <div className="connection-heading"><div><h2>AI connections</h2><p>Connect your ChatGPT plan and choose which account and model this project uses.</p></div><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage usage ↗</a></div>
    {error && <DiagnosticNotice detail={error} summary="Your AI connection needs attention." next="Check your account and selected AI, or reconnect. If this continues, see Technical details." alert />}
    {!activeLogin && (working || testing || loadingModels) && <ActivityFeedback label={activityLabel} />}
    {message && <p role="status" className="connection-notice">{message}</p>}
    {welcome && <div className="connection-notice" role="status"><strong>Your ChatGPT plan is connected</strong><p>Connecting an account does not change this project’s active connection. Choose a model and save the selection, or use it when creating a project. Eligible requests use your plan or credits.</p><button className="secondary" onClick={() => { localStorage.setItem(`reqwizit-plan-confirmed:${welcome}`, "true"); setWelcome(null); }}>Got it</button></div>}
    <div className="connection-card"><div><strong>ChatGPT</strong><p>Sign in in a separate browser tab. Your sign-in details are kept on this computer, separate from your project.</p></div><button className="primary" disabled={!available || busy || activeLogin || testing} onClick={() => signIn()}>Continue with ChatGPT</button></div>
    {loaded && !available && <p>ChatGPT sign-in is not available in this setup. You can use an existing OpenCode connection instead.</p>}
    {!loaded && !error && <ActivityFeedback label="Loading saved connections…" />}
    {activeLogin && <div className="connection-notice" role="status"><strong><Spinner />{login.status === "validating" ? "Validating your account…" : "Waiting for ChatGPT sign-in…"}</strong><ActivityBar label="Account authorization progress" /><p>Complete authorization in the other tab, then return here. This attempt expires after three minutes.</p>{authURL && <a href={authURL} target="_blank" rel="noreferrer">Open sign-in tab ↗</a>}<button className="quiet" disabled={busy} onClick={() => void act(async () => { await request("connections/cancel-login", { id: login.id }); setLogin({ ...login, status: "cancelled" }); sessionStorage.removeItem("reqwizit-login"); setAuthURL(""); })}>Cancel sign-in</button></div>}
    <label>AI connection<select aria-label="AI connection" value={accountID} disabled={busy || testing || activeLogin} onChange={(event) => { onSelect(event.target.value, event.target.value ? "" : "gpt-6.1-sol"); }}>
      <option value="">OpenCode · existing connection</option>
      {accountID && !account && <option value={accountID}>Disconnected account · reconnect or choose another</option>}
      {accounts.map((item) => <option key={item.id} value={item.id}>ChatGPT · {item.label}</option>)}
    </select></label>
    {accountID ? <>
      <label>ChatGPT model<select aria-label="ChatGPT model" value={modelID} disabled={loadingModels || busy || testing || activeLogin} onChange={(event) => onSelect(accountID, event.target.value)}>
        <option value="">{loadingModels ? "Loading models…" : "Choose a model"}</option>
        {modelID && !models.some((item) => item.id === modelID) && <option value={modelID}>{modelID} · not in current catalog</option>}
        {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
      </select></label>
      <p className="plan-label">Uses your ChatGPT plan. Web research is not available with this connection yet.</p>
      <div className="button-row">
        <button className="secondary" disabled={busy || testing || activeLogin || loadingModels || !account} onClick={() => void catalog(accountID)}>{loadingModels && <Spinner />}Refresh models</button>
        <button className="secondary" disabled={busy || testing || activeLogin || !account || !models.some((model) => model.id === modelID)} onClick={() => { setTesting(true); void act(async () => { await request("connections/test", { accountID, modelID }); setMessage("Connection test passed. The selected model returned a valid response."); }).finally(() => { if (mounted.current) setTesting(false); }); }}>Test connection</button>
        {testing && <button className="secondary" onClick={() => { void request("connections/cancel-test", {}).catch((error: Error) => setError(error.message)); }}>Stop test</button>}
        {account && <><button className="quiet" disabled={busy || testing || activeLogin} onClick={() => signIn(accountID)}>Reconnect</button><button className="quiet" disabled={busy || testing || activeLogin} onClick={() => void act(async () => { await request("connections/disconnect", { accountID }); await reload(); setModels([]); setMessage("Account disconnected. Projects retain their selection until you change it."); })}>Disconnect</button></>}
      </div><small>Testing asks your selected AI for a short response and uses some of your plan’s usage. Looking through the AI choices does not use that allowance.</small>
    </> : <><label>OpenCode model ID<input disabled={busy} value={modelID} onChange={(event) => onSelect("", event.target.value)} /></label><p>Uses the existing OpenCode connection. Direct ChatGPT sign-in above does not change OpenCode credentials.</p></>}
    {children}
  </section></ActionScope>;
}
