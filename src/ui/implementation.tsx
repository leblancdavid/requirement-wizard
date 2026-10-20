import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../core/model.js";
import { assessmentCurrent, assessmentFreshness, createExecutionIndex, eligibleRequirements, implementationPlan, type Assessment, type AssessmentRun, type ExecutionConfig, type ExecutionState, type WorkspaceRepository } from "../core/execution.js";
import "./implementation.css";
import { ActivityFeedback, Spinner, useActivity } from "./activity.js";
import { localAssessmentCounts, localAssessmentDetail } from "../core/progress.js";
import { LazyDetails } from "./lazy-details.js";
import { ActionButton, ActionScope } from "./action-button.js";
import { discoveryBlockReason, executionBlockReason } from "../core/operations.js";
import { planningCurrent, planningEdgeID, reviewedPlanningConfig } from "../core/implementation-planning.js";

export function ImplementationTab({ project, state, active, disabled, discoveryActive = false, connected, workspaceID, epicID, action, inspectRepository }: {
  project: Project; state: ExecutionState; active: boolean; disabled: boolean; discoveryActive?: boolean; connected: boolean; workspaceID?: string; epicID: string;
  action: (name: string, body: Record<string, unknown>) => Promise<void>;
  inspectRepository: () => Promise<WorkspaceRepository>;
}) {
  const [filter, setFilter] = useState("remaining");
  const [search, setSearch] = useState("");
  const [repository, setRepository] = useState<WorkspaceRepository | null>(null), [detecting, setDetecting] = useState(false);
  const inspection = useRef(0);
  useActivity(detecting, "Inspecting workspace repository…");
  const [starting, setStarting] = useState(false);
  async function detectRepository() {
    const request = ++inspection.current; setDetecting(true);
    try { const result = await inspectRepository(); if (request === inspection.current) setRepository(result); }
    catch { if (request === inspection.current) setRepository({ status: "unavailable", message: "Repository detection failed. Detect again after checking workspace access." }); }
    finally { if (request === inspection.current) setDetecting(false); }
  }
  useEffect(() => { setRepository(null); void detectRepository(); return () => { inspection.current++; }; }, [project.id, workspaceID, connected]);
  const executionIndex = useMemo(() => createExecutionIndex(project, state), [project, state]);
  const { plan, error } = useMemo(() => {
    try { return { plan: implementationPlan(project, state, executionIndex), error: "" }; }
    catch (e) { return { plan: [], error: (e as Error).message }; }
  }, [project, state, executionIndex]);
  const repositoryChanged = repository?.status === "detected" && !!state.config && repository.repository!.toLowerCase() !== state.config.repository.toLowerCase();
  const approvedInScope = eligibleRequirements(project).filter((r) => epicID === "all" || r.epicID === epicID);
  const assessmentReason = !connected ? "Connect the repository’s local root folder in Settings before assessing it."
    : active ? executionBlockReason
    : discoveryActive ? discoveryBlockReason
    : disabled ? "Another workspace action is being saved. Wait for it to finish."
    : !state.config ? "Save implementation settings below before assessing: choose the OpenCode model and delivery strategy, and review the suggested verification commands or enter a project-specific check. Workspace detection fills the form but does not save these settings."
    : !approvedInScope.length ? "No approved requirements in this feature. Approve requirements in Review or choose another feature before assessing."
    : "";
  const deliveryReason = assessmentReason || (repositoryChanged ? `The workspace origin differs from the saved repository. Save implementation settings to use ${repository.repository}.` : "");
  const planningReason = state.planning && state.planning.status !== "dismissed" && (!state.run || state.run.status === "completed")
    && (state.planning.status !== "approved" || !planningCurrent(project, state, workspaceID)) ? "Review and approve a current implementation plan before coding, or dismiss the proposal to retain manual planning." : "";
  const run = state.run, canAssess = !assessmentReason, ready = !deliveryReason && !error && !planningReason;
  const assessmentRun = state.assessmentRuns?.at(-1);
  const assessedIDs = useMemo(() => new Set(eligibleRequirements(project).filter((r) => assessmentCurrent(project, state, r.id, state.assessments[r.id], executionIndex)).map((r) => r.id)), [project, state, executionIndex]);
  const currentAssessments = [...assessedIDs].map((id) => state.assessments[id]!);
  const localCounts = useMemo(() => new Map(project.epics.map((epic) => [epic.id,
    localAssessmentCounts(project, state, eligibleRequirements(project).filter((r) => r.epicID === epic.id).map((r) => r.id), executionIndex)])), [project, state, executionIndex]);
  const resumable = !!run && run.status !== "completed";
  const start = async (operation: string, scope: Record<string, string | boolean> = {}) => {
    setStarting(true);
    try { await action("execution-start", { operation, ...scope }); } finally { setStarting(false); }
  };
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const scoped = plan.filter((p) => epicID === "all" || p.requirement.epicID === epicID);
  const groups = [...new Set(scoped.map((p) => p.requirement.epicID))].map((id, order) => {
    const epic = project.epics.find((e) => e.id === id)!;
    const members = scoped.filter((p) => p.requirement.epicID === id);
    const visible = members.filter((p) => {
      const assessment = state.assessments[p.requirement.id];
      const stale = !!assessment && !assessedIDs.has(p.requirement.id);
      const statusMatches = filter === "all" || filter === "remaining" && !p.delivered || filter === "delivered" && p.delivered
        || filter === "ready" && !p.delivered && !p.blockers.length || filter === "partial" && !stale && assessment?.status === "partial"
        || filter === "missing" && !stale && assessment?.status === "missing" || filter === "unassessed" && !assessment
        || filter === "complete" && !stale && assessment?.status === "complete"
        || filter === "assessed" && assessedIDs.has(p.requirement.id) || filter === "unknown" && !stale && assessment?.status === "unknown"
        || filter === "stale" && stale || filter === "blocked" && (!!p.blockers.length || run?.units.some((u) => u.items.some((i) => i.requirementID === p.requirement.id && ["blocked", "failed", "interrupted"].includes(i.status))));
      const text = [epic.id, epic.title, epic.purpose, p.requirement.id, p.requirement.statement, p.requirement.rationale, ...p.requirement.acceptance].join(" ").toLowerCase();
      return statusMatches && terms.every((term) => text.includes(term));
    });
    return { epic, members, visible, order };
  }).filter((group) => group.visible.length);
  return <ActionScope reason={assessmentReason || (resumable ? "Archive the current run to change its frozen settings. Saved sessions and delivery evidence are retained." : "Wait for the current implementation request to finish.")}><div className="implementation-tab">
    {starting && <ActivityFeedback label="Starting implementation task…" />}
    {active && assessmentRun?.status !== "running" && run?.status !== "running" && <ActivityFeedback label="Preparing implementation…" />}
    <div className="review-toolbar"><p className="view-intro">Implement approved requirements one at a time, in dependency order. Verified code and Git delivery are tracked separately. A requirement counts as implemented when its verified work reaches main.</p><ActionButton className="primary" disabled={!ready || starting} reason={deliveryReason || error || planningReason || "Starting implementation…"} onClick={() => void start("continue")}>Continue implementation →</ActionButton></div>
    <section className="requirement-card" aria-label="Implementation planning"><h3>Implementation plan</h3><p>Propose work packages and dependency-first order for all approved requirements. Review hard prerequisites, preferred ordering, technical steps and verification before coding. Uses the saved OpenCode model with one bounded request per requirement. Check implementation first for code evidence. Interrupted retries retain completed packages when decisions and settings match.</p><ActionButton className="secondary" disabled={!canAssess || starting || resumable} reason={assessmentReason || (resumable ? "Archive the current run before preparing a new plan." : "Starting planning…")} onClick={() => void start("plan")}>Prepare implementation plan</ActionButton>
      {active && state.planning?.status === "generating" && <ActivityFeedback label="Preparing dependency proposals and work packages…" />}
      {planningReason && <p role="status">{planningReason}</p>}
      {state.planning && <PlanningReview key={`${state.planning.id}:${state.planning.status}`} project={project} state={state} current={planningCurrent(project, state, workspaceID)} disabled={active || disabled || resumable} action={action} />}
      {!!state.planningHistory?.length && <LazyDetails summary={<>Previous implementation plans · {state.planningHistory.length}</>}>{() => state.planningHistory!.map((p) => <div key={p.id}><p>Specification r{p.revision} · {p.status} · {p.createdAt}</p><p>{p.output?.summary ?? p.diagnostic}</p>{p.output && <ol>{p.output.packages.map((item) => <li key={item.requirementID}>{item.title} — {item.reason}</li>)}</ol>}</div>)}</LazyDetails>}
    </section>
    {error && <p role="alert">{error}</p>}
    <div className="button-row"><ActionButton className="secondary" disabled={!canAssess || starting} reason={assessmentReason || "Starting assessment…"} title="Reuse current assessments; assess new or outdated requirements against local code and verified main" onClick={() => void start("check", epicID === "all" ? {} : { epicID })}>Check implementation</ActionButton><ActionButton className="secondary" disabled={!canAssess || starting} reason={assessmentReason || "Starting assessment…"} title="Bypass saved assessment reuse for every approved requirement in the selected scope" onClick={() => void start("check", { ...(epicID === "all" ? {} : { epicID }), force: true })}>{epicID === "all" ? "Reassess all" : "Reassess feature"}</ActionButton>{active && <ActionButton className="secondary" disabled={disabled} reason="Another workspace request is being saved. Wait for it to finish." onClick={() => void action("execution-stop", {})}>Stop implementation</ActionButton>}</div>
    <div className="button-row"><ActionButton className="secondary" disabled={!canAssess || starting} reason={assessmentReason || "Starting assessment…"} onClick={() => void start("assess", { ...(epicID === "all" ? {} : { epicID }), preview: true })}>Preview assessment queue</ActionButton><small>Refresh local change impact without model calls, fetching main or running verification commands.</small></div>
    <p className="view-intro">Checks local code first, then remote main with your verification commands. Requirements are marked Implemented only when complete on verified main. Local results remain available if main verification fails.</p>
    <p className="view-intro">You can save answers and reviews during assessment. Responses wait in the queue until assessment finishes, keeping its specification snapshot stable.</p>
    <p className="view-intro">Check implementation assesses pending work and reuses unchanged results, including missing, partial and unknown. Reviewed code scopes in Implementation settings narrow change impact. Commit-only changes reuse compatible content evidence. Reassess bypasses reuse. Main verification commands always run. Code freshness reflects the latest check or queue preview, not live filesystem monitoring.</p>
    {assessmentReason && <p id="implementation-action-reason" role="status" aria-label="Implementation availability">{assessmentReason}</p>}
    {deliveryReason && deliveryReason !== assessmentReason && <p role="status">{deliveryReason}</p>}
    {state.assessmentStatus && <p role={assessmentRun && ["failed", "blocked"].includes(assessmentRun.status) ? "alert" : "status"} aria-label="Assessment outcome">{state.assessmentStatus}</p>}
    {(assessmentRun || currentAssessments.length > 0) && <p className="view-intro">Code assessment: {currentAssessments.filter((a) => a.status === "complete").length} complete · {currentAssessments.filter((a) => a.status === "partial").length} partial · {currentAssessments.filter((a) => a.status === "missing").length} missing · {currentAssessments.filter((a) => a.status === "unknown").length} unknown · {eligibleRequirements(project).length - currentAssessments.length} not assessed. Delivery to main is tracked separately.</p>}
    {assessmentRun && <section className="requirement-card implementation-assessment" aria-label="Assessment run"><h3>{assessmentRun.preview ? "Assessment queue preview" : assessmentRun.operation === "assess" ? "Workspace assessment" : "Main verification"} · {active && assessmentRun.status === "running" ? "working" : assessmentRun.status}</h3>
      {active && assessmentRun.status === "running" && <ActivityFeedback label="Requirements assessed" completed={assessmentRun.completedIDs.length} total={assessmentRun.requirementIDs.length} />}
      {!assessmentRun.preview && <p>{assessmentRun.completedIDs.length} / {assessmentRun.requirementIDs.length} requirements assessed · {assessmentRun.reused} unchanged results reused · {assessmentRun.freshIDs?.length ?? assessmentRun.completedIDs.length - assessmentRun.reused} freshly assessed{assessmentRun.force && " · Forced reassessment"}</p>}<p role="status">{assessmentRun.stage}</p>
      {assessmentRun.impacts && <LazyDetails summary={<>Assessment queue · {assessmentRun.requirementIDs.filter((id) => !assessmentRun.impacts![id]?.reusable).length} pending · {assessmentRun.requirementIDs.filter((id) => assessmentRun.impacts![id]?.reusable).length} reusable at capture</>}>{() => <ul>{assessmentRun.requirementIDs.map((id) => <li key={id}><strong>{project.requirements.find((r) => r.id === id)?.statement ?? id}</strong> — {assessmentRun.impacts![id]?.reusable ? "Reuse" : "Assess"}: {assessmentRun.impacts![id]?.reason ?? "Impact pass has not completed."}</li>)}</ul>}</LazyDetails>}
      {["failed", "blocked"].includes(assessmentRun.status) && assessmentRun.completedIDs.length === 0 && <p>No requirements were assessed in this run. This is not a finding that the project’s features are missing.{assessmentRun.operation === "verify-main" && " Saved local assessments remain available. Check implementation retries local assessment and main verification."}</p>}
      <AssessmentDetails run={assessmentRun} project={project} /></section>}
    {!assessmentRun && state.assessmentStatus && !currentAssessments.length && <p role="alert">No requirement has a saved implementation assessment. The operation diagnostic above does not establish that features are missing.</p>}
    {!!state.assessmentRuns?.slice(0, -1).length && <LazyDetails className="project-overview" summary={<>Previous assessment runs · {state.assessmentRuns.length - 1}</>}>{() => state.assessmentRuns!.slice(0, -1).reverse().map((previous) => <LazyDetails key={previous.id} summary={<>{previous.operation} · {previous.status} · {previous.completedIDs.length}/{previous.requirementIDs.length} · {new Date(previous.startedAt).toLocaleString()}</>}>{() => <AssessmentDetails run={previous} project={project} />}</LazyDetails>)}</LazyDetails>}
    {run && <section className="save-notice implementation-status" aria-label="Implementation run"><div><strong>{active ? "Implementation working…" : run.status.replaceAll("-", " ")}</strong><p>{run.diagnostic ?? (run.status === "awaiting-merge" ? "Merge the delivery branch or PR into main, then Continue implementation to verify delivery." : run.progress.at(-1))}</p><small>Specification r{run.revision} · {run.config.repository} · {run.config.strategy}</small></div>
      {active && run.status === "running" && assessmentRun?.status !== "running" && <ActivityFeedback label="Requirements verified in this coding run" completed={run.units.flatMap((unit) => unit.items).filter((item) => item.status === "verified").length} total={run.requirementIDs.length} />}
      {!active && <ActionButton className="quiet" disabled={disabled} reason={discoveryActive ? discoveryBlockReason : "Wait for the current workspace request to finish."} onClick={() => void action("execution-archive", { version: state.version })}>Archive run &amp; replan</ActionButton>}
       <LazyDetails summary="Execution & delivery details">{() => <>{run.units.map((unit) => <div key={unit.id}><p><strong>{unit.branch}</strong> · {unit.delivery.replaceAll("-", " ")}</p><p className="source-excerpt">Worktree: {unit.directory || "Preparing…"}</p>{unit.pr && <a href={unit.pr} target="_blank" rel="noreferrer">Open GitHub PR ↗</a>}
         {unit.items.map((item) => <div key={item.requirementID}><p>{item.requirementID} · {item.status}{item.commit ? ` · ${item.commit.slice(0, 8)}` : ""}</p>{item.sessionID && <small>OpenCode session: {item.sessionID}</small>}{(item.contextBlock ?? item.context) && <p>Requirement context: {(item.contextBlock ?? item.context)!.characters.toLocaleString()} / {(item.contextBlock ?? item.context)!.budget.toLocaleString()} characters · {(item.contextBlock ?? item.context)!.historyCharacters.toLocaleString()} saved-session characters{item.contextBlock ? " · Blocked before inference" : ""}</p>}{item.response && <p>{item.response}</p>}{item.diagnostic && <p>{item.diagnostic}</p>}{item.checks.map((check, index) => <LazyDetails key={index} summary={<>{check.command} · exit {check.exitCode}</>}>{() => <pre>{check.output}</pre>}</LazyDetails>)}</div>)}</div>)}<LazyDetails summary="Recent progress">{() => <ol>{run.progress.map((entry, index) => <li key={index}>{entry}</li>)}</ol>}</LazyDetails></>}</LazyDetails></section>}
    <ExecutionSettings key={`${project.id}:${workspaceID}:${JSON.stringify(state.config)}`} project={project} config={state.config} detected={repository} detecting={detecting} detect={() => void detectRepository()} disabled={active || disabled || resumable} save={(config) => action("execution-config", { config, version: state.version })} />
    <label className="implementation-search">Search epics and requirements<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Epic, requirement, ID, or acceptance scenario…" maxLength={500} /></label>
    <div className="filter-row" aria-label="Implementation filters">{[["remaining", "Not delivered"], ["ready", "Ready"], ["assessed", "Assessed"], ["complete", "Complete in code"], ["partial", "Partial"], ["missing", "Missing"], ["unknown", "Unknown"], ["unassessed", "Not assessed"], ["stale", "Needs reassessment"], ["blocked", "Blocked"], ["delivered", "Implemented"], ["all", "All approved"]].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={filter === key ? "active" : ""} onClick={() => setFilter(key!)}>{label}</button>)}</div>
    {!!eligibleRequirements(project).length && !error && <p className="view-intro" role="status" aria-label="Implementation results">Showing {groups.reduce((total, group) => total + group.visible.length, 0)} of {scoped.length} requirements in {groups.length} {groups.length === 1 ? "epic" : "epics"}.</p>}
    {!eligibleRequirements(project).length && <div className="empty-card"><h3>No approved requirements to implement yet.</h3><p>Approve requirements in Review, then return here to assess and implement them.</p></div>}
    {!!eligibleRequirements(project).length && !groups.length && !error && <div className="empty-card"><h3>No requirements match these filters.</h3><p>Try another search, status, or feature.</p><button className="secondary" onClick={() => { setSearch(""); setFilter("all"); }}>Clear search and status filter</button></div>}
    {groups.map(({ epic, members, visible, order }) => {
      const local = localCounts.get(epic.id)!;
      return <LazyDetails className="feature-group" key={epic.id} summary={<><strong>{order + 1}. {epic.title}</strong><span>{visible.length} shown · {localAssessmentDetail(local)}<br />{members.filter((p) => p.delivered).length} / {members.length} verified on main · {members.filter((p) => !p.delivered && !p.blockers.length).length} ready</span></>}>{() => <><p>{epic.purpose}</p>{epic.dependencies.length > 0 && <p>After: {epic.dependencies.map((dependency) => project.epics.find((e) => e.id === dependency)?.title ?? dependency).join(", ")}</p>}<div className="button-row"><ActionButton className="secondary" title="Implement all remaining approved requirements in this epic" disabled={!ready || starting || resumable || members.every((p) => p.delivered)} reason={deliveryReason || error || (resumable ? "Continue or archive the current run before selecting another scope." : members.every((p) => p.delivered) ? "All approved requirements in this feature are already delivered to main." : "Starting implementation…")} onClick={() => void start("continue", { epicID: epic.id })}>Implement epic</ActionButton></div>
        {visible.map(({ requirement: r, blockers, delivered }) => {
          const assessment = state.assessments[r.id], stale = !!assessment && !assessedIDs.has(r.id);
          const unit = [...(run?.units ?? []), ...state.history.flatMap((h) => h.units)].find((u) => u.items.some((i) => i.requirementID === r.id));
          const item = unit?.items.find((i) => i.requirementID === r.id);
          const assessing = active && assessmentRun?.status === "running" && assessmentRun.currentRequirementID === r.id;
           return <LazyDetails className="requirement-detail" key={r.id} summary={<><span className={`badge ${delivered ? "accepted" : blockers.length ? "needs-review" : "proposed"}`}>{delivered ? "Implemented on main" : stale ? "Needs reassessment" : assessment?.status === "complete" ? "Complete in code" : assessment ? `Assessed · ${assessment.status}` : "Not assessed"}</span><strong>{r.statement}</strong><small className="implementation-row-status">{assessing ? assessmentRun.operation === "assess" ? "Assessing workspace" : "Verifying main" : `Coding: ${item ? item.status : "not started"}`} · Git: {delivered ? "delivered to main" : unit?.delivery.replaceAll("-", " ") ?? "no delivery"}</small></>}>{() =>
            <article className="requirement-card"><small>{r.id}</small>{stale && <p role="status">Needs reassessment: {assessmentFreshness(project, state, r.id).message}</p>}<h4>Acceptance scenarios</h4><ul>{r.acceptance.map((s, index) => <li key={index}>{s}</li>)}</ul>{!!blockers.length && <p role="status">Waiting for prerequisites on main: {blockers.map((id) => project.requirements.find((r) => r.id === id)?.statement ?? id).join("; ")}</p>}<div className="button-row"><ActionButton className="secondary" disabled={!ready || starting || resumable || delivered || !!blockers.length} reason={deliveryReason || error || (resumable ? "Continue or archive the current run before selecting another scope." : delivered ? "This requirement is already verified on main." : blockers.length ? "Deliver the listed prerequisites to main first." : "Starting implementation…")} onClick={() => void start("continue", { requirementID: r.id })}>Implement</ActionButton><ActionButton className="secondary" disabled={!canAssess || starting} reason={assessmentReason || "Starting assessment…"} onClick={() => void start("check", { requirementID: r.id, force: true })}>Reassess</ActionButton></div>
              <AssessmentEvidence assessment={state.workspaceAssessments?.[r.id] ?? (assessment?.scope === "workspace" ? assessment : undefined)} project={project} state={state} requirementID={r.id} />
              <AssessmentEvidence assessment={state.mainAssessments?.[r.id] ?? (assessment?.scope === "main" ? assessment : undefined)} project={project} state={state} requirementID={r.id} />
              <MarkForAssessment disabled={!canAssess} disabledReason={assessmentReason} mark={(reason) => action("execution-mark-assessment", { revision: project.revision, requirementID: r.id, reason, version: state.version })} />
              {state.assessmentRequests?.[r.id] && (!assessment || assessment.requestToken !== state.assessmentRequests[r.id]!.token) && <p role="status">Manual reassessment requested: {state.assessmentRequests[r.id]!.reason}</p>}
               {state.delivered[r.id] && <p>Delivery evidence: main {state.delivered[r.id]!.main.slice(0, 8)} · {new Date(state.delivered[r.id]!.at).toLocaleString()}{!delivered && " · Needs review against the current requirement/repository"}</p>}</article>}</LazyDetails>;
         })}</>}</LazyDetails>;
    })}
    {!!state.history.length && <LazyDetails className="project-overview" summary={<>Previous implementation runs · {state.history.length}</>}>{() => state.history.map((history) => <LazyDetails key={history.id} summary={<>r{history.revision} · {history.status} · {history.units.length} delivery units · {history.createdAt}</>}>{() => history.units.map((unit) => <div key={unit.id}><p>{unit.branch} · {unit.delivery}</p><p className="source-excerpt">{unit.directory}</p>{unit.pr && <a href={unit.pr} target="_blank" rel="noreferrer">Open GitHub PR ↗</a>}{unit.items.map((item) => <p key={item.requirementID}>{item.requirementID} · {item.status} · {item.commit ?? "No commit"}<br />Session: {item.sessionID ?? "Not started"}</p>)}</div>)}</LazyDetails>)}</LazyDetails>}
    {!!state.deliveryHistory?.length && <LazyDetails className="project-overview" summary={<>Previous main-delivery evidence · {state.deliveryHistory.length}</>}>{() => state.deliveryHistory!.map((delivery, index) => <p key={index}>{delivery.requirementID} · {delivery.repository} · main {delivery.main.slice(0, 8)} · {new Date(delivery.at).toLocaleString()}</p>)}</LazyDetails>}
  </div></ActionScope>;
}

function PlanningReview({ project, state, current, disabled, action }: { project: Project; state: ExecutionState; current: boolean; disabled: boolean; action: (name: string, body: Record<string, unknown>) => Promise<void> }) {
  const proposal = state.planning!, output = proposal.output;
  const [acceptedEdges, setAcceptedEdges] = useState(proposal.acceptedEdges ?? output?.packages.flatMap((p) => p.prerequisites.filter((d) => d.kind === "hard").map((d) => planningEdgeID(p.requirementID, d.requirementID))) ?? []);
  const [order, setOrder] = useState(output?.packages.map((p) => p.requirementID) ?? []);
  const [resolution, setResolution] = useState(proposal.resolution ?? "");
  const reviewable = proposal.status === "proposed" && current;
  let sequence: ReturnType<typeof implementationPlan> = [], error = "";
  if (output) try {
    const sorted = { ...output, packages: order.map((id) => output.packages.find((p) => p.requirementID === id)!) };
    sequence = implementationPlan(project, { ...state, config: proposal.status === "approved" ? state.config : reviewedPlanningConfig(project, state, sorted, acceptedEdges) });
  } catch (e) { error = (e as Error).message; }
  const label = (id: string) => project.requirements.find((r) => r.id === id)?.statement ?? id;
  const review = (decision: "approve" | "dismiss") => action("execution-plan-review", { revision: project.revision, version: state.version, planID: proposal.id, decision, acceptedEdges, resolution, order });
  const questions = output?.packages.some((p) => p.questions.length);
  return <div><p><strong>{proposal.status}</strong> · Specification r{proposal.revision} · {proposal.model.providerID}/{proposal.model.modelID}</p>
    {!current && <p role="status">Decisions, workspace or settings changed. Prepare a new plan before approval or starting a new coding run. Previous planning evidence is retained.</p>}
    {proposal.diagnostic && <p role="alert">{proposal.diagnostic}</p>}{output && <><p>{output.summary}</p><p>Each work package delivers one approved requirement. Supporting foundation work stays linked to that outcome. Existing configured and epic prerequisites are retained; settings can revise those guardrails.</p>
      <ol aria-label="Proposed work packages">{order.map((id, index) => { const p = output.packages.find((p) => p.requirementID === id)!; return <li key={id}><details><summary>{p.title} · {label(id)}</summary><p>{p.reason}</p><h4>Implementation steps</h4><ol>{p.steps.map((s, i) => <li key={i}>{s}</li>)}</ol><h4>Verification</h4><ul>{p.verification.map((s, i) => <li key={i}>{s}</li>)}</ul>
        <h4>Dependencies</h4>{!p.prerequisites.length && <p>No new prerequisites proposed.</p>}{p.prerequisites.map((d) => { const key = planningEdgeID(id, d.requirementID); return <div key={key}>{d.kind === "hard" ? <label><input type="checkbox" checked={acceptedEdges.includes(key)} disabled={disabled || !reviewable} onChange={(e) => setAcceptedEdges(e.target.checked ? [...acceptedEdges, key] : acceptedEdges.filter((edge) => edge !== key))} />Hard prerequisite: {label(d.requirementID)}</label> : <p>Preferred ordering: after {label(d.requirementID)} (advisory)</p>}<p>{d.reason} · {d.confidence} confidence</p><small>Evidence: {d.evidenceIDs.join(", ")}</small></div>; })}
        {!!p.questions.length && <><h4>Resolve before approval</h4><ul>{p.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></>}
      </details>{reviewable && <div className="button-row">{[-1, 1].map((direction) => <button className="quiet" key={direction} disabled={disabled || index + direction < 0 || index + direction >= order.length} onClick={() => { const next = [...order]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!]; setOrder(next); }} aria-label={`Move ${p.title} ${direction === -1 ? "earlier" : "later"}`}>{direction === -1 ? "Move earlier" : "Move later"}</button>)}</div>}</li>; })}</ol>
      {error ? <p role="alert">{error} Review proposed hard edges or existing settings before approval.</p> : <><h4>Dependency-safe execution order</h4><p>Your ordering preference applies where prerequisites permit it. Hard prerequisites always come first.</p><ol aria-label="Dependency-safe execution order">{sequence.map((p) => <li key={p.requirement.id}>{p.requirement.statement}{p.dependencies.length > 0 && <small> — after {p.dependencies.map(label).join("; ")}</small>}</li>)}</ol></>}
      <label>Planning review notes{questions ? " · explain how questions were resolved" : " (optional)"}<textarea value={resolution} disabled={disabled || !reviewable} maxLength={6000} onChange={(e) => setResolution(e.target.value)} /></label>
      {reviewable && <ActionButton className="primary" disabled={disabled || !!error || !!questions && !resolution.trim()} reason={error || (questions && !resolution.trim() ? "Record how the planning questions were resolved." : "Wait for the current workspace action to finish.")} onClick={() => void review("approve")}>Approve implementation plan</ActionButton>}
    </>}{proposal.status !== "approved" && proposal.status !== "generating" && proposal.status !== "dismissed" && <ActionButton className="secondary" disabled={disabled} onClick={() => void review("dismiss")}>Dismiss plan proposal</ActionButton>}</div>;
}

function MarkForAssessment({ disabled, disabledReason, mark }: { disabled: boolean; disabledReason: string; mark: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  return <details><summary>Mark for reassessment</summary><p>Queue this requirement for the next check without starting a model call.</p><label>Reason (optional)<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} /></label><ActionButton className="secondary" disabled={disabled} reason={disabledReason} onClick={() => void mark(reason)}>Mark for reassessment</ActionButton></details>;
}

function AssessmentEvidence({ assessment, project, state, requirementID }: { assessment?: Assessment; project: Project; state: ExecutionState; requirementID: string }) {
  if (!assessment) return null;
  const freshness = assessmentFreshness(project, state, requirementID, assessment);
  return <details><summary>Assessment evidence · {assessment.scope} · {assessment.head.slice(0, 8)}</summary><p>{assessment.status} — {assessment.explanation}</p><p>{freshness.status === "current" ? "Assessed" : "Needs reassessment"}: {freshness.message}</p><small>Captured {new Date(assessment.capturedAt).toLocaleString()} · Specification r{assessment.specificationRevision ?? "unknown"} · {assessment.omissions} omitted paths/excerpts{assessment.skill && ` · Skill ${assessment.skill.name} v${assessment.skill.version}`}. Static assessment does not prove executed verification.</small>
    {assessment.semanticOrigin && <p>Semantic assessment reused from {assessment.semanticOrigin.scope} at {assessment.semanticOrigin.head.slice(0, 8)} · {new Date(assessment.semanticOrigin.capturedAt).toLocaleString()}. Content equivalence was checked for this scope; main verification is separate.</p>}
    {assessment.footprint && <details><summary>Reuse footprint · {assessment.footprint.files.length} monitored files · {assessment.footprint.broad ? "repository-wide conservative boundary" : "reviewed code boundary"}</summary><p>New and removed files within the boundary also affect reuse. An unscoped prerequisite, unmatched path or incomplete capture widens the boundary. Omitted scope remains unverified.</p><ul>{assessment.footprint.files.map((file) => <li key={file.path}>{file.path}</li>)}</ul></details>}
    <ul>{assessment.scenarios.map((scenario) => <li key={scenario.index}><strong>Scenario {scenario.index + 1}: {scenario.status}</strong> — {scenario.explanation}</li>)}</ul><ul>{assessment.files.map((file, index) => <li key={index}>{file.path}:{file.startLine}–{file.endLine} <small>SHA-256 {file.hash}</small></li>)}</ul></details>;
}

function AssessmentDetails({ run, project }: { run: AssessmentRun; project: Project }) {
  return <LazyDetails summary="Assessment details">{() => <><p>{run.diagnostic}</p><small>Started {new Date(run.startedAt).toLocaleString()} · Specification r{run.revision}{run.head ? ` · HEAD ${run.head.slice(0, 8)}` : ""}</small>
    {run.currentRequirementID && <p>Current requirement: {project.requirements.find((r) => r.id === run.currentRequirementID)?.statement ?? run.currentRequirementID}</p>}
    {run.directory && <p className="source-excerpt">Workspace: {run.directory}</p>}{run.sessionID && <small>OpenCode session: {run.sessionID}</small>}
    {run.contextBlock && <p>Context blocked before inference: {run.contextBlock.characters.toLocaleString()} / {run.contextBlock.budget.toLocaleString()} characters. Mandatory decisions remain intact.</p>}
    {!!Object.keys(run.contexts ?? {}).length && <details><summary>Per-requirement contexts and sessions</summary>{Object.entries(run.contexts ?? {}).map(([id, context]) => <p key={id}>{project.requirements.find((r) => r.id === id)?.statement ?? id}<br />{context.characters.toLocaleString()} / {context.budget.toLocaleString()} characters · {run.sessions?.[id]?.length ?? 0} independent evidence-window sessions</p>)}</details>}
    {run.capture && <p>Captured scope: {run.capture.files} source files · {run.capture.excerpts} excerpts · {run.capture.omissions} excluded/omitted paths or portions{run.capture.traversalLimited ? " · traversal limit reached" : ""}. Each request uses only its detailed evidence window; indexed-only and omitted scope remain unknown.</p>}
    {run.checks.map((check, index) => <details key={index}><summary>{check.command} · exit {check.exitCode}</summary><pre>{check.output || "No command output."}</pre></details>)}
    {!!run.capture?.omitted.length && <details><summary>Omitted scope · {run.capture.omissions}</summary><p>First {Math.min(50, run.capture.omitted.length)} paths shown; the full omission list is retained in the saved run.</p><ul>{run.capture.omitted.slice(0, 50).map((item, index) => <li key={index}>{item.path} — {item.reason}</li>)}</ul></details>}
    <LazyDetails summary="Recent assessment progress">{() => <ol>{run.progress.map((entry, index) => <li key={index}>{entry}</li>)}</ol>}</LazyDetails></>}</LazyDetails>;
}

function ExecutionSettings({ project, config, detected, detecting, detect, disabled, save }: { project: Project; config?: ExecutionConfig; detected: WorkspaceRepository | null; detecting: boolean; detect: () => void; disabled: boolean; save: (config: ExecutionConfig) => Promise<void> }) {
  const [repository, setRepository] = useState(config?.repository ?? ""), [strategy, setStrategy] = useState<ExecutionConfig["strategy"]>(config?.strategy ?? "requirement-pr"), [branch, setBranch] = useState(config?.branch ?? "implementation");
  const [providerID, setProviderID] = useState(config?.providerID ?? "openai"), [modelID, setModelID] = useState(config?.modelID ?? project.model.modelID), [checks, setChecks] = useState(config?.checks.join("\n") ?? ""), [dependencies, setDependencies] = useState(config?.dependencies ?? {});
  const requirements = eligibleRequirements(project);
  const editedRepository = useRef(false);
  const editedChecks = useRef(false);
  const [prerequisiteTarget, setPrerequisiteTarget] = useState("");
  const [assessmentScopes, setAssessmentScopes] = useState(config?.assessmentScopes ?? {});
  const [sharedPaths, setSharedPaths] = useState(config?.sharedAssessmentPaths?.join("\n") ?? "");
  const [reuseEquivalentScopes, setReuseEquivalentScopes] = useState(config ? config.reuseEquivalentScopes ?? false : true);
  const [scopeTarget, setScopeTarget] = useState(""), [scopeDraft, setScopeDraft] = useState("");
  const scopeMembers = (target: string) => requirements.filter((r) => target === `requirement:${r.id}` || target === `epic:${r.epicID}`);
  const selectScope = (target: string) => {
    setScopeTarget(target);
    const members = scopeMembers(target);
    setScopeDraft((assessmentScopes[members[0]?.id ?? ""] ?? []).join("\n"));
  };
  const paths = (text: string) => text.split("\n").map((s) => s.trim()).filter(Boolean);
  useEffect(() => { if (detected?.status === "detected" && !disabled && !editedRepository.current) setRepository(detected.repository!); }, [detected, disabled]);
  useEffect(() => { if (!config && !disabled && !editedChecks.current && detected?.verification?.commands.length) setChecks(detected.verification.commands.join("\n")); }, [config, detected, disabled]);
  return <ActionScope><details className="project-overview implementation-settings" open={!config}><summary>Implementation settings{config ? ` · ${config.repository}` : " · Configure before starting"}</summary><form className="note-card" onSubmit={(event) => { event.preventDefault(); if (disabled) return; void save({ ...config, repository, strategy, branch, providerID, modelID, checks: checks.split("\n").map((s) => s.trim()).filter(Boolean), dependencies, assessmentScopes, sharedAssessmentPaths: paths(sharedPaths), reuseEquivalentScopes }); }}><fieldset disabled={disabled}>
    <label>GitHub repository<input placeholder="Detected from workspace origin" value={repository} onChange={(e) => { editedRepository.current = true; setRepository(e.target.value); }} required maxLength={300} /></label>
    <div><small role="status">{detecting ? "Checking workspace Git repository…" : detected?.message}</small> <button type="button" className="quiet" title={!disabled && detecting ? "Repository detection is already running. Wait for it to finish." : undefined} disabled={detecting} onClick={detect}>{detecting && <Spinner />}Detect again</button>{detecting && <ActivityFeedback label="Inspecting repository and verification commands…" />}</div>
    <label>Delivery strategy<select aria-label="Delivery strategy" value={strategy} onChange={(e) => setStrategy(e.target.value as ExecutionConfig["strategy"])}><option value="requirement-pr">PR per requirement</option><option value="epic-pr">PR per epic</option><option value="branch">Commit to named branch</option><option value="main">Commit to main</option></select></label>{strategy === "branch" && <label>Destination branch<input value={branch} onChange={(e) => setBranch(e.target.value)} required maxLength={200} /></label>}
    <label>OpenCode provider<select value={providerID} onChange={() => setProviderID("openai")}><option value="openai">ChatGPT / OpenAI</option></select></label><label>OpenCode model<input value={modelID} onChange={(e) => setModelID(e.target.value)} required maxLength={200} /></label><label>Verification commands · one per line<textarea aria-label="Verification commands · one per line" rows={3} placeholder="Detect project checks, or enter a verification command" value={checks} onChange={(e) => { editedChecks.current = true; setChecks(e.target.value); }} required maxLength={24000} /></label>
    <div><small role="status" aria-label="Verification command suggestions">{detecting ? "Looking for project verification commands…" : detected?.verification?.message ?? "No verification suggestions available yet."}</small>{!!detected?.verification?.commands.length && <button type="button" className="quiet" title={!disabled && detecting ? "Wait for repository and verification-command detection to finish." : undefined} disabled={detecting} onClick={() => { editedChecks.current = true; setChecks(detected.verification!.commands.join("\n")); }}>Use suggested commands</button>}</div>
    <p>OpenCode runs locally using its own sign-in. Commands run in an isolated worktree; include dependency setup if needed. Successful verified work is committed automatically. PRs wait for your merge into main.</p>
    <LazyDetails summary="Requirement prerequisites">{() => <>
      <label>Requirement to configure<select aria-label="Requirement to configure" value={prerequisiteTarget} onChange={(event) => setPrerequisiteTarget(event.target.value)}><option value="">Choose a requirement…</option>{requirements.map((r) => <option key={r.id} value={r.id}>{r.statement}</option>)}</select></label>
      {requirements.filter((r) => r.id === prerequisiteTarget).map((r) => <label key={r.id}>{r.statement}<select multiple aria-label={`Prerequisites for ${r.statement}`} value={dependencies[r.id] ?? []} onChange={(event) => setDependencies({ ...dependencies, [r.id]: Array.from(event.target.selectedOptions, (option) => option.value) })}>{requirements.filter((other) => other.id !== r.id).map((other) => <option key={other.id} value={other.id}>{other.statement}</option>)}</select></label>)}
    </>}</LazyDetails>
    <LazyDetails summary={<>Assessment reuse boundaries · {requirements.filter((r) => assessmentScopes[r.id]?.length).length} / {requirements.length} scoped</>}>{() => <>
      <label><input type="checkbox" checked={reuseEquivalentScopes} onChange={(event) => setReuseEquivalentScopes(event.target.checked)} />Reuse equivalent local/main assessments</label><p>Skip a second semantic assessment when captured impact scope, decisions, model and workflow match exactly. Main verification commands still run; original semantic provenance is retained. Existing settings keep separate assessment until you enable this.</p>
      <p>Optional reviewed boundaries let unrelated code changes reuse saved assessments. Include implementation, tests and supporting modules. Leave a requirement blank for repository-wide impact checking. Root files and nested configuration are always watched; prerequisite scopes and referenced evidence are included. A prerequisite without a boundary or incomplete capture widens checking conservatively.</p>
      <label>Shared code paths · one per line<textarea aria-label="Shared assessment paths" rows={3} value={sharedPaths} onChange={(event) => setSharedPaths(event.target.value)} placeholder={"src/core\nsrc/shared"} maxLength={30100} /></label>
      <label>Boundary to configure<select aria-label="Assessment boundary to configure" value={scopeTarget} onChange={(event) => selectScope(event.target.value)}><option value="">Choose a feature or requirement…</option>{project.epics.filter((e) => !e.archived && requirements.some((r) => r.epicID === e.id)).map((e) => <option key={e.id} value={`epic:${e.id}`}>Feature: {e.title}</option>)}{requirements.map((r) => <option key={r.id} value={`requirement:${r.id}`}>{r.statement}</option>)}</select></label>
      {scopeTarget && <><label>Reviewed files or directories · one per line<textarea aria-label="Reviewed assessment paths" rows={4} value={scopeDraft} onChange={(event) => setScopeDraft(event.target.value)} placeholder={"src/features/accounts\ntests/accounts"} maxLength={15050} /></label><p>Literal repository-relative paths, no wildcards. Applying to a feature replaces boundaries for its currently approved requirements; future requirements start repository-wide.</p><button type="button" className="secondary" onClick={() => { const next = { ...assessmentScopes }; for (const r of scopeMembers(scopeTarget)) next[r.id] = paths(scopeDraft); setAssessmentScopes(next); }}>Apply boundary to {scopeMembers(scopeTarget).length} requirements</button><small>Apply the boundary, then Save implementation settings. New boundaries need one fresh assessment to establish their search scope.</small></>}
    </>}</LazyDetails><button className="secondary">Save implementation settings</button></fieldset>{disabled && <small>Settings are frozen while a worker or resumable coding run owns them. Finish or stop the worker; archive a coding run before changing its settings. Branches, commits and sessions are retained.</small>}</form></details></ActionScope>;
}
