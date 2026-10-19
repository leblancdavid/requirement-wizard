import React, { useEffect, useRef, useState } from "react";
import type { Project } from "../core/model.js";
import { eligibleRequirements, implementationPlan, type ExecutionConfig, type ExecutionState, type WorkspaceRepository } from "../core/execution.js";
import { requirementFingerprint } from "../core/implementation.js";
import "./implementation.css";

export function ImplementationTab({ project, state, active, disabled, connected, workspaceID, epicID, action, inspectRepository }: {
  project: Project; state: ExecutionState; active: boolean; disabled: boolean; connected: boolean; workspaceID?: string; epicID: string;
  action: (name: string, body: Record<string, unknown>) => Promise<void>;
  inspectRepository: () => Promise<WorkspaceRepository>;
}) {
  const [filter, setFilter] = useState("remaining");
  const [search, setSearch] = useState("");
  const [repository, setRepository] = useState<WorkspaceRepository | null>(null), [detecting, setDetecting] = useState(false);
  const inspection = useRef(0);
  async function detectRepository() {
    const request = ++inspection.current; setDetecting(true);
    try { const result = await inspectRepository(); if (request === inspection.current) setRepository(result); }
    catch { if (request === inspection.current) setRepository({ status: "unavailable", message: "Repository detection failed. Detect again after checking workspace access." }); }
    finally { if (request === inspection.current) setDetecting(false); }
  }
  useEffect(() => { setRepository(null); void detectRepository(); return () => { inspection.current++; }; }, [project.id, workspaceID, connected]);
  let plan: ReturnType<typeof implementationPlan> = [], error = "";
  try { plan = implementationPlan(project, state); } catch (e) { error = (e as Error).message; }
  const repositoryChanged = repository?.status === "detected" && !!state.config && repository.repository!.toLowerCase() !== state.config.repository.toLowerCase();
  const run = state.run, ready = !!state.config && connected && !active && !disabled && !error && !repositoryChanged;
  const resumable = !!run && run.status !== "completed";
  const start = (operation: string, scope: Record<string, string> = {}) => action("execution-start", { operation, ...scope });
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const scoped = plan.filter((p) => epicID === "all" || p.requirement.epicID === epicID);
  const groups = [...new Set(scoped.map((p) => p.requirement.epicID))].map((id, order) => {
    const epic = project.epics.find((e) => e.id === id)!;
    const members = scoped.filter((p) => p.requirement.epicID === id);
    const visible = members.filter((p) => {
      const assessment = state.assessments[p.requirement.id];
      const stale = !!assessment && assessment.fingerprint !== requirementFingerprint(p.requirement);
      const statusMatches = filter === "all" || filter === "remaining" && !p.delivered || filter === "delivered" && p.delivered
        || filter === "ready" && !p.delivered && !p.blockers.length || filter === "partial" && !stale && assessment?.status === "partial"
        || filter === "missing" && !stale && assessment?.status === "missing" || filter === "unassessed" && !assessment
        || filter === "stale" && stale || filter === "blocked" && (!!p.blockers.length || run?.units.some((u) => u.items.some((i) => i.requirementID === p.requirement.id && ["blocked", "failed", "interrupted"].includes(i.status))));
      const text = [epic.id, epic.title, epic.purpose, p.requirement.id, p.requirement.statement, p.requirement.rationale, ...p.requirement.acceptance].join(" ").toLowerCase();
      return statusMatches && terms.every((term) => text.includes(term));
    });
    return { epic, members, visible, order };
  }).filter((group) => group.visible.length);
  return <div className="implementation-tab">
    <div className="review-toolbar"><p className="view-intro">Implement approved requirements one at a time, in dependency order. Verified code and Git delivery are tracked separately. A requirement counts as implemented when its verified work reaches main.</p><button className="primary" disabled={!ready} onClick={() => void start("continue")}>Continue implementation →</button></div>
    {!connected && <p role="status">Connect the repository’s local root folder in Settings to begin.</p>}{error && <p role="alert">{error}</p>}
    {repositoryChanged && <p role="status">The workspace origin differs from the saved repository. Save implementation settings to use {repository.repository}.</p>}
    <div className="button-row"><button className="secondary" disabled={!ready} onClick={() => void start("assess", epicID === "all" ? {} : { epicID })}>Assess project</button><button className="secondary" disabled={!ready} onClick={() => void start("verify-main", epicID === "all" ? {} : { epicID })}>Verify main &amp; refresh delivery</button>{active && <button className="secondary" disabled={disabled} onClick={() => void action("execution-stop", {})}>Stop implementation</button>}</div>
    {state.assessmentStatus && <p role="status">{state.assessmentStatus}</p>}
    {run && <section className="save-notice implementation-status" aria-label="Implementation run"><div><strong>{active ? "Implementation working…" : run.status.replaceAll("-", " ")}</strong><p>{run.diagnostic ?? (run.status === "awaiting-merge" ? "Merge the delivery branch or PR into main, then Continue implementation to verify delivery." : run.progress.at(-1))}</p><small>Specification r{run.revision} · {run.config.repository} · {run.config.strategy}</small></div>
      {!active && <button className="quiet" disabled={disabled} onClick={() => void action("execution-archive", { version: state.version })}>Archive run &amp; replan</button>}
      <details><summary>Execution &amp; delivery details</summary>{run.units.map((unit) => <div key={unit.id}><p><strong>{unit.branch}</strong> · {unit.delivery.replaceAll("-", " ")}</p><p className="source-excerpt">Worktree: {unit.directory || "Preparing…"}</p>{unit.pr && <a href={unit.pr} target="_blank" rel="noreferrer">Open GitHub PR ↗</a>}
        {unit.items.map((item) => <div key={item.requirementID}><p>{item.requirementID} · {item.status}{item.commit ? ` · ${item.commit.slice(0, 8)}` : ""}</p>{item.sessionID && <small>OpenCode session: {item.sessionID}</small>}{item.response && <p>{item.response}</p>}{item.diagnostic && <p>{item.diagnostic}</p>}{item.checks.map((check, index) => <details key={index}><summary>{check.command} · exit {check.exitCode}</summary><pre>{check.output}</pre></details>)}</div>)}</div>)}<details><summary>Recent progress</summary><ol>{run.progress.map((entry, index) => <li key={index}>{entry}</li>)}</ol></details></details></section>}
    <ExecutionSettings key={`${project.id}:${workspaceID}:${JSON.stringify(state.config)}`} project={project} config={state.config} detected={repository} detecting={detecting} detect={() => void detectRepository()} disabled={active || disabled || resumable} save={(config) => action("execution-config", { config, version: state.version })} />
    <label className="implementation-search">Search epics and requirements<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Epic, requirement, ID, or acceptance scenario…" maxLength={500} /></label>
    <div className="filter-row" aria-label="Implementation filters">{[["remaining", "Not delivered"], ["ready", "Ready"], ["partial", "Partial"], ["missing", "Missing"], ["unassessed", "Not assessed"], ["stale", "Needs reassessment"], ["blocked", "Blocked"], ["delivered", "Implemented"], ["all", "All approved"]].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={filter === key ? "active" : ""} onClick={() => setFilter(key!)}>{label}</button>)}</div>
    {!!eligibleRequirements(project).length && !error && <p className="view-intro" role="status" aria-label="Implementation results">Showing {groups.reduce((total, group) => total + group.visible.length, 0)} of {scoped.length} requirements in {groups.length} {groups.length === 1 ? "epic" : "epics"}.</p>}
    {!eligibleRequirements(project).length && <div className="empty-card"><h3>No approved requirements to implement yet.</h3><p>Approve requirements in Review, then return here to assess and implement them.</p></div>}
    {!!eligibleRequirements(project).length && !groups.length && !error && <div className="empty-card"><h3>No requirements match these filters.</h3><p>Try another search, status, or feature.</p><button className="secondary" onClick={() => { setSearch(""); setFilter("all"); }}>Clear search and status filter</button></div>}
    {groups.map(({ epic, members, visible, order }) => {
      return <details className="feature-group" key={epic.id}><summary><strong>{order + 1}. {epic.title}</strong><span>{visible.length} shown · {members.filter((p) => p.delivered).length} / {members.length} implemented · {members.filter((p) => !p.delivered && !p.blockers.length).length} ready</span></summary><p>{epic.purpose}</p>{epic.dependencies.length > 0 && <p>After: {epic.dependencies.map((dependency) => project.epics.find((e) => e.id === dependency)?.title ?? dependency).join(", ")}</p>}<div className="button-row"><button className="secondary" title="Implement all remaining approved requirements in this epic" disabled={!ready || resumable || members.every((p) => p.delivered)} onClick={() => void start("continue", { epicID: epic.id })}>Implement epic</button></div>
        {visible.map(({ requirement: r, blockers, delivered }) => {
          const assessment = state.assessments[r.id], stale = !!assessment && assessment.fingerprint !== requirementFingerprint(r);
          const unit = [...(run?.units ?? []), ...state.history.flatMap((h) => h.units)].find((u) => u.items.some((i) => i.requirementID === r.id));
          const item = unit?.items.find((i) => i.requirementID === r.id);
          return <details className="requirement-detail" key={r.id}><summary><span className={`badge ${delivered ? "accepted" : blockers.length ? "needs-review" : "proposed"}`}>{delivered ? "Implemented on main" : stale ? "Needs reassessment" : assessment?.status === "complete" ? "Complete in code" : assessment?.status ?? "Not assessed"}</span><strong>{r.statement}</strong><small className="implementation-row-status">{item ? item.status : "Not started"} · Git: {delivered ? "delivered to main" : unit?.delivery.replaceAll("-", " ") ?? "no delivery"}</small></summary>
            <article className="requirement-card"><small>{r.id}</small><h4>Acceptance scenarios</h4><ul>{r.acceptance.map((s, index) => <li key={index}>{s}</li>)}</ul>{!!blockers.length && <p role="status">Waiting for prerequisites on main: {blockers.map((id) => project.requirements.find((r) => r.id === id)?.statement ?? id).join("; ")}</p>}<button className="secondary" disabled={!ready || resumable || delivered || !!blockers.length} onClick={() => void start("continue", { requirementID: r.id })}>Implement</button>
              {assessment && <details><summary>Assessment evidence · {assessment.scope} · {assessment.head.slice(0, 8)}</summary><p>{assessment.explanation}</p><small>Captured {new Date(assessment.capturedAt).toLocaleString()} · {assessment.omissions} omitted paths/excerpts. Static assessment does not prove executed verification.</small><ul>{assessment.scenarios.map((scenario) => <li key={scenario.index}><strong>Scenario {scenario.index + 1}: {scenario.status}</strong> — {scenario.explanation}</li>)}</ul><ul>{assessment.files.map((file, index) => <li key={index}>{file.path}:{file.startLine}–{file.endLine} <small>SHA-256 {file.hash}</small></li>)}</ul></details>}
              {state.delivered[r.id] && <p>Delivery evidence: main {state.delivered[r.id]!.main.slice(0, 8)} · {new Date(state.delivered[r.id]!.at).toLocaleString()}{!delivered && " · Needs review against the current requirement/repository"}</p>}</article></details>;
        })}</details>;
    })}
    {!!state.history.length && <details className="project-overview"><summary>Previous implementation runs · {state.history.length}</summary>{state.history.map((history) => <details key={history.id}><summary>r{history.revision} · {history.status} · {history.units.length} delivery units · {history.createdAt}</summary>{history.units.map((unit) => <div key={unit.id}><p>{unit.branch} · {unit.delivery}</p><p className="source-excerpt">{unit.directory}</p>{unit.pr && <a href={unit.pr} target="_blank" rel="noreferrer">Open GitHub PR ↗</a>}{unit.items.map((item) => <p key={item.requirementID}>{item.requirementID} · {item.status} · {item.commit ?? "No commit"}<br />Session: {item.sessionID ?? "Not started"}</p>)}</div>)}</details>)}</details>}
    {!!state.deliveryHistory?.length && <details className="project-overview"><summary>Previous main-delivery evidence · {state.deliveryHistory.length}</summary>{state.deliveryHistory.map((delivery, index) => <p key={index}>{delivery.requirementID} · {delivery.repository} · main {delivery.main.slice(0, 8)} · {new Date(delivery.at).toLocaleString()}</p>)}</details>}
  </div>;
}

function ExecutionSettings({ project, config, detected, detecting, detect, disabled, save }: { project: Project; config?: ExecutionConfig; detected: WorkspaceRepository | null; detecting: boolean; detect: () => void; disabled: boolean; save: (config: ExecutionConfig) => Promise<void> }) {
  const [repository, setRepository] = useState(config?.repository ?? ""), [strategy, setStrategy] = useState<ExecutionConfig["strategy"]>(config?.strategy ?? "requirement-pr"), [branch, setBranch] = useState(config?.branch ?? "implementation");
  const [providerID, setProviderID] = useState(config?.providerID ?? "openai"), [modelID, setModelID] = useState(config?.modelID ?? project.model.modelID), [checks, setChecks] = useState(config?.checks.join("\n") ?? ""), [dependencies, setDependencies] = useState(config?.dependencies ?? {});
  const requirements = eligibleRequirements(project);
  const editedRepository = useRef(false);
  useEffect(() => { if (detected?.status === "detected" && !disabled && !editedRepository.current) setRepository(detected.repository!); }, [detected, disabled]);
  return <details className="project-overview implementation-settings" open={!config}><summary>Implementation settings{config ? ` · ${config.repository}` : " · Configure before starting"}</summary><form className="note-card" onSubmit={(event) => { event.preventDefault(); void save({ repository, strategy, branch, providerID, modelID, checks: checks.split("\n").map((s) => s.trim()).filter(Boolean), dependencies }); }}><fieldset disabled={disabled}>
    <label>GitHub repository<input placeholder="Detected from workspace origin" value={repository} onChange={(e) => { editedRepository.current = true; setRepository(e.target.value); }} required maxLength={300} /></label>
    <div><small role="status">{detecting ? "Checking workspace Git repository…" : detected?.message}</small> <button type="button" className="quiet" disabled={detecting} onClick={detect}>Detect again</button></div>
    <label>Delivery strategy<select aria-label="Delivery strategy" value={strategy} onChange={(e) => setStrategy(e.target.value as ExecutionConfig["strategy"])}><option value="requirement-pr">PR per requirement</option><option value="epic-pr">PR per epic</option><option value="branch">Commit to named branch</option><option value="main">Commit to main</option></select></label>{strategy === "branch" && <label>Destination branch<input value={branch} onChange={(e) => setBranch(e.target.value)} required maxLength={200} /></label>}
    <label>OpenCode provider<select value={providerID} onChange={() => setProviderID("openai")}><option value="openai">ChatGPT / OpenAI</option></select></label><label>OpenCode model<input value={modelID} onChange={(e) => setModelID(e.target.value)} required maxLength={200} /></label><label>Verification commands · one per line<textarea rows={3} placeholder={"npm run check\nnpm test"} value={checks} onChange={(e) => setChecks(e.target.value)} required maxLength={24000} /></label>
    <p>OpenCode runs locally using its own sign-in. Commands run in an isolated worktree; include dependency setup if needed. Successful verified work is committed automatically. PRs wait for your merge into main.</p><details><summary>Requirement prerequisites</summary>{requirements.map((r) => <label key={r.id}>{r.statement}<select multiple aria-label={`Prerequisites for ${r.statement}`} value={dependencies[r.id] ?? []} onChange={(event) => setDependencies({ ...dependencies, [r.id]: Array.from(event.target.selectedOptions, (option) => option.value) })}>{requirements.filter((other) => other.id !== r.id).map((other) => <option key={other.id} value={other.id}>{other.statement}</option>)}</select></label>)}</details><button className="secondary">Save implementation settings</button></fieldset>{disabled && <small>Stop and archive the current run to change its frozen settings. Branches, commits and sessions are retained.</small>}</form></details>;
}
