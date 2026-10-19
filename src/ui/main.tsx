import React, { startTransition, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type { Job, Project, Submission } from "../core/model.js";
import type { coverage } from "../core/coverage.js";
import { dimensionLabels } from "../core/epics.js";
import "./appearance.css";
import "./review.css";
import { ReviewQueue, reviewItems } from "./review.js";
import { ProcessingQueue } from "./processing-queue.js";
import { queueActivities } from "./queue-activity.js";
import { ImplementationTab } from "./implementation.js";
import { ProjectProgress } from "./project-progress.js";
import { ActivityProvider, ActivityFeedback, HeaderActivity, Spinner, useActivity } from "./activity.js";
import { createExecutionIndex, deliveredRequirement, type ExecutionState, type WorkspaceRepository } from "../core/execution.js";
import { shareSnapshot } from "./snapshot.js";
import { reviewFingerprint } from "../core/model.js";
import { AppearanceSettings } from "./appearance-settings.js";
import { AnnotatedText, QuestionHelp, wordHelpContext, type HelpControls } from "./question-help.js";
import { AIConnections } from "./connections.js";
import { WorkspacePicker, WorkspaceConnection, WorkspaceScan, ImplementationProgress } from "./workspace-files.js";
import type { Workspace } from "../storage/workspace.js";
import type { FolderPreview } from "../core/folder-preview.js";

type Snapshot = { project: Project; workspace: Workspace | null; coverage: ReturnType<typeof coverage>; previousCoverage: number | null; jobs: Job[]; helpJobs: Job[]; active: boolean; progress: string[]; submissions: Submission[]; queuePaused: boolean; execution: ExecutionState; implementationActive: boolean; implementationOperation?: string };
type Item = { id: string; name: string; revision: number };
type Draft = { kind: "answer" | "delegation" | "deferral"; text: string };
// Carry pre-rename browser preferences forward once, without replacing newer values.
for (const storage of [localStorage, sessionStorage]) {
  for (const key of Object.keys(storage).filter((key) => key.startsWith("wizard-"))) {
    const renamed = key.replace(/^wizard-/, "reqwizit-");
    if (storage.getItem(renamed) === null) storage.setItem(renamed, storage.getItem(key)!);
    storage.removeItem(key);
  }
}
const token = document.querySelector<HTMLMetaElement>('meta[name="reqwizit-token"]')?.content ?? "";
async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: body === undefined ? "GET" : "POST",
    signal, headers: { "X-Reqwizit-Token": token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}
function QuestionCleanup({ project, queuedIDs, disabled, replaceDisabled, retire }: { project: Project; queuedIDs: Set<string>; disabled: boolean; replaceDisabled: boolean; retire: (ids: string[], regenerate?: boolean) => Promise<void> }) {
  const eligible = project.questions.filter((q) => q.status === "pending" && !q.sourceID && !queuedIDs.has(q.id));
  const retired = project.questions.filter((q) => q.status === "retired");
  if (!eligible.length && !retired.length) return null;
  return <details className="question-cleanup"><summary>Bulk question actions &amp; history</summary>
    <p>Dismiss individual questions beside Save response. These actions apply to all eligible unanswered questions; saved and queued responses are protected. Questions and reasons remain in history.</p>
    {!!eligible.length && <div className="button-row"><button className="secondary" disabled={disabled} onClick={() => void retire(eligible.map((q) => q.id))}>Dismiss unanswered questions</button><button className="secondary" disabled={disabled || replaceDisabled} onClick={() => void retire(eligible.map((q) => q.id), true)}>Replace unanswered questions from project evidence</button></div>}
    {replaceDisabled && <small>Complete a folder scan before generating evidence-based replacements.</small>}
    {!!retired.length && <details><summary>Dismissed questions · {retired.length}</summary>{retired.map((q) => <p key={q.id}><strong>{q.text}</strong><br />{q.retirementReason}</p>)}</details>}
  </details>;
}
function Meter({ value, stale = false }: { value: number; stale?: boolean }) {
  return <div className={`meter ${stale ? "stale" : ""}`} role="meter" aria-label="Definition coverage" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>;
}
function App() {
  const [projects, setProjects] = useState<Item[]>([]);
  const [id, setID] = useState<string | null>(localStorage.getItem("reqwizit-project"));
  const selected = useRef(id); selected.current = id;
  const [data, setData] = useState<Snapshot | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"discover" | "review" | "implementation" | "requirements" | "research" | "history">("discover");
  const [epicID, setEpicID] = useState("all");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [actionLabel, setActionLabel] = useState("Saving changes…");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string[]>([]);
  const requests = useRef(new Map<string, string>());
  const inFlight = useRef(new Set<string>());
  const drafts = useRef(new Map<string, Draft>());
  const [auto, setAuto] = useState(localStorage.getItem("reqwizit-auto") !== "false");
  const [research, setResearch] = useState(localStorage.getItem("reqwizit-research") !== "false");
  const [name, setName] = useState(""); const [idea, setIdea] = useState("");
  const [workspacePath, setWorkspacePath] = useState(""); const [createDirectory, setCreateDirectory] = useState(false);
  const [initializeFolder, setInitializeFolder] = useState(false);
  const [folderPreview, setFolderPreview] = useState<FolderPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const editedIdentity = useRef({ name: false, description: false });
  const [model, setModel] = useState("gpt-6.1-sol");
  const [connectionID, setConnectionID] = useState("");
  const [note, setNote] = useState("");
  const [newEpic, setNewEpic] = useState(false);
  const [editingEpic, setEditingEpic] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ revision: number; reason: string }>>([]);
  const [showContext, setShowContext] = useState(false);
  const [showSettings, setShowSettings] = useState(location.hash === "#/settings");
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const workspaceScroll = useRef(0);
  function navigate(page: "settings" | "workspace", replace = false) {
    if ((page === "settings") === showSettings) return;
    if (page === "settings") workspaceScroll.current = window.scrollY;
    window.history[replace ? "replaceState" : "pushState"]({ reqwizitSettings: page === "settings" }, "", `#/${page}`);
    setShowSettings(page === "settings");
  }
  function backToWorkspace() {
    if (window.history.state?.reqwizitSettings) window.history.back();
    else navigate("workspace", true);
  }
  const [questionFilter, setQuestionFilter] = useState<"open" | "answered" | "later" | "submitted">("open");
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<{ id: string; text: string } | null>(null);
  const project = data?.project;
  const summary = data?.coverage;
  const busy = pending || !!data?.active || !!data?.implementationActive;
  useActivity(pending, actionLabel);
  useActivity(loading, "Loading workspace…");
  useActivity(sending.length > 0, `Saving ${sending.length} ${sending.length === 1 ? "response" : "responses"}…`);
  useActivity(previewBusy, "Inspecting local folder…");
  const connectionChanged = !!project && (model !== project.model.modelID || connectionID !== (project.model.connectionID ?? ""));
  const activeConnection = project ? `${project.model.connectionID ? "Direct ChatGPT plan" : "OpenCode"} · ${project.model.modelID}` : "";
  const lastScan = data?.jobs.filter((job) => job.kind === "scan").at(-1);
  const needsInitialization = !!project && !project.scans.length && (!!project.origin || !!lastScan);
  const help: HelpControls = {
    jobs: data?.helpJobs ?? [], revision: project?.revision ?? 1,
    busy: !!data?.helpJobs.some((j) => ["pending", "running"].includes(j.status)),
    request: async (request) => {
      if (!project) return;
      await api(`projects/${project.id}/question-help`, { revision: project.revision, request });
      await load(project.id);
    },
    cancel: async (jobID) => { if (project) { await api(`projects/${project.id}/cancel-help`, { jobID }); await load(project.id); } },
  };

  async function list() {
    const items = await api<Item[]>("projects"); setProjects(items);
    if (!items.some((item) => item.id === selected.current)) setID(items[0]?.id ?? null);
  }
  async function load(projectID = selected.current, signal?: AbortSignal, background = false) {
    if (!projectID) return;
    const snapshot = await api<Snapshot>(`projects/${projectID}`, undefined, signal);
    if (signal?.aborted) return;
    const update = () => {
      if (selected.current === projectID) setData((previous) => previous && previous.project.id === projectID && (previous.project.revision > snapshot.project.revision || previous.project.revision === snapshot.project.revision && previous.execution.version > snapshot.execution.version) ? previous : shareSnapshot(previous, snapshot));
    };
    if (background) startTransition(update); else update();
  }
  useEffect(() => { void list().catch((error: Error) => setError(error.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    let current = true;
    setFolderPreview(null); setPreviewError("");
    if (!initializeFolder || !workspacePath.trim()) { setPreviewBusy(false); return; }
    setPreviewBusy(true);
    const timer = setTimeout(() => {
      void api<FolderPreview>("folder-preview", { path: workspacePath.trim() }).then((preview) => {
        if (!current) return;
        setFolderPreview(preview);
        if (!editedIdentity.current.name) setName(preview.name);
        if (!editedIdentity.current.description) setIdea(preview.description);
      }).catch((error: Error) => { if (current) setPreviewError(error.message); }).finally(() => { if (current) setPreviewBusy(false); });
    }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [initializeFolder, workspacePath]);
  useEffect(() => {
    const syncPage = () => setShowSettings(location.hash === "#/settings");
    window.addEventListener("popstate", syncPage);
    window.addEventListener("hashchange", syncPage);
    return () => { window.removeEventListener("popstate", syncPage); window.removeEventListener("hashchange", syncPage); };
  }, []);
  useEffect(() => {
    document.title = showSettings ? "Settings · Reqwizit" : "Reqwizit";
    pageHeading.current?.focus({ preventScroll: true });
    window.scrollTo(0, showSettings ? 0 : workspaceScroll.current);
  }, [showSettings]);
  useEffect(() => { localStorage.setItem("reqwizit-auto", String(auto)); }, [auto]);
  useEffect(() => { localStorage.setItem("reqwizit-research", String(research)); }, [research]);
  useEffect(() => {
    setData(null); setEpicID("all"); setTab("discover"); setQuestionFilter("open"); setExpandedQuestion(null); setSavedMessage(null); setError("");
    if (id) { setLoading(true); localStorage.setItem("reqwizit-project", id); void load(id).catch((error: Error) => { setError(error.message); }).finally(() => setLoading(false)); }
  }, [id]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await load(id, controller.signal, true); }
      catch (error) { if (!controller.signal.aborted) setError((error as Error).message); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 2000); }
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id]);
  useEffect(() => { if (project) { setModel(project.model.modelID); setConnectionID(project.model.connectionID ?? ""); } }, [project?.id, project?.model.modelID, project?.model.connectionID]);
  useEffect(() => {
    if (project && epicID !== "all" && !project.epics.some((item) => item.id === epicID && !item.archived)) setEpicID("all");
  }, [project?.revision, epicID]);
  useEffect(() => {
    if (tab === "history" && id) void api<typeof history>(`projects/${id}/history`).then(setHistory).catch((error: Error) => setError(error.message));
  }, [tab, project?.revision]);

  async function act(action: () => Promise<void>, label = "Saving changes…") {
    setError(""); setActionLabel(label); setPending(true);
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Action failed."); }
    finally { await load().catch(() => {}); setPending(false); }
  }
  async function mutate(action: string, body: Record<string, unknown>, analyze = false) {
    if (!project) return;
    const updated = await api<Project>(`projects/${project.id}/${action}`, { revision: project.revision, ...body });
    if (analyze && auto) await api(`projects/${project.id}/analyze`, { revision: updated.revision, research: updated.model.connectionID ? false : research, ...(epicID !== "all" ? { focusEpicID: epicID } : {}) });
    await list();
  }
  async function explore() {
    if (connectionChanged && !creating) throw new Error("Save your connection and model selection in Settings before exploring.");
    if (project) await api(`projects/${project.id}/analyze`, { revision: project.revision, research: project.model.connectionID ? false : research, ...(epicID !== "all" ? { focusEpicID: epicID } : {}) });
  }
  async function dismissQuestions(questionIDs: string[], regenerate = false) {
    await mutate("retire-questions", { questionIDs, reason: regenerate ? "Replace generic unanswered questions with gaps grounded in the existing project evidence." : "Dismissed by the user as unrelated to this project.", regenerate, research: project?.model.connectionID ? false : research });
  }
  async function submit(input: Submission["input"], key: string, replaces?: string): Promise<boolean> {
    if (!project || inFlight.current.has(key)) return false;
    const projectID = project.id;
    const useResearch = project.model.connectionID ? false : research;
    const payload = JSON.stringify({ projectID, input, auto, research: useResearch, replaces });
    const submissionID = requests.current.get(payload) ?? crypto.randomUUID();
    requests.current.set(payload, submissionID);
    inFlight.current.add(key); setSending([...inFlight.current]); setError("");
    try {
      await api(`projects/${projectID}/submit`, { id: submissionID, input, auto, research: useResearch, ...(replaces ? { replaces } : {}) });
      await load(projectID); await list(); return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Could not submit response. Your draft is retained."); return false; }
    finally { inFlight.current.delete(key); setSending([...inFlight.current]); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (initializeFolder && (!workspacePath.trim() || !folderPreview || previewBusy)) { setError("Inspect an existing local folder before creating the project."); return; }
    await act(async () => {
      const created = await api<Project & { workspaceError?: string }>("projects", { name, idea: idea.trim() ? idea : "Reconstruct the existing project from its connected source folder; review inferred definitions before discovering missing requirements.", entryMode: initializeFolder ? "existing" : "idea", ...(initializeFolder ? { previewFingerprint: folderPreview!.fingerprint } : {}), model: { providerID: "openai", modelID: model, ...(connectionID ? { connectionID } : {}) }, ...(workspacePath.trim() ? { workspace: { path: workspacePath, create: initializeFolder ? false : createDirectory } } : {}) });
      setID(created.id); selected.current = created.id; setCreating(false); setName(""); setIdea("");
      setWorkspacePath(""); setCreateDirectory(false);
      editedIdentity.current = { name: false, description: false };
      await list();
      if (initializeFolder) {
        setInitializeFolder(false); setTab("requirements");
      } else await api(`projects/${created.id}/analyze`, { revision: created.revision, research: connectionID ? false : research });
      if (created.workspaceError) setError(`Project created, but workspace connection failed: ${created.workspaceError}. Connect it in Settings.`);
    }, "Creating project…");
  }
  const epics = project?.epics.filter((item) => !item.archived) ?? [];
  const selectedEpic = epics.find((item) => item.id === epicID);
  const epicScore = summary?.epics.find((item) => item.epicID === epicID);
  const queuedQuestionIDs = new Set(data?.submissions.flatMap((item) => item.input.type === "answer" && ["queued", "processing"].includes(item.status) ? [item.input.questionID] : []) ?? []);
  const protectedQuestionIDs = new Set(data?.submissions.flatMap((item) => item.input.type === "answer" && ["queued", "processing", "saved", "needs-attention"].includes(item.status) ? [item.input.questionID] : []) ?? []);
  const questions = project?.questions.filter((item) => item.status !== "retired" && !queuedQuestionIDs.has(item.id) && (epicID === "all" || item.epicID === epicID)) ?? [];
  const openQuestions = questions.filter((item) => ["pending", "deferred", "delegated"].includes(item.status));
  const scopedQuestions = project?.questions.filter((item) => item.status !== "retired" && (epicID === "all" || item.epicID === epicID)) ?? [];
  const visibleQuestions = scopedQuestions.filter((item) => questionFilter === "submitted" ? queuedQuestionIDs.has(item.id) : !queuedQuestionIDs.has(item.id) && (questionFilter === "open" ? item.status === "pending" : questionFilter === "answered" ? item.status === "answered" : ["deferred", "delegated"].includes(item.status)));
  // Keep a ready-to-answer card open as submissions leave the list, including
  // changes arriving through polling. Explicit navigation can still open another.
  const activeQuestionID = visibleQuestions.some((question) => question.id === expandedQuestion)
    ? expandedQuestion : questionFilter === "open" ? visibleQuestions[0]?.id ?? null : null;
  const latestSubmission = (questionID: string) => [...(data?.submissions ?? [])].reverse().find((item) => item.input.type === "answer" && item.input.questionID === questionID && ["queued", "processing"].includes(item.status));
  const requirements = project?.requirements.filter((item) => epicID === "all" || item.epicID === epicID) ?? [];
  const implementationRemaining = useMemo(() => {
    if (!project || !data) return 0;
    const index = createExecutionIndex(project, data.execution);
    return [...index.requirements.values()].filter((r) => !deliveredRequirement(project, data.execution, r.id, index)).length;
  }, [project, data?.execution]);
  const lastJob = data?.jobs.at(-1);
  const responseStatus = (questionID: string) => [...(data?.submissions ?? [])].reverse().find((item) => item.input.type === "answer" && item.input.questionID === questionID && ["queued", "processing"].includes(item.status))?.status;
  const saveAnswer = async (question: Project["questions"][number], kind: "answer" | "delegation" | "deferral", text: string) => {
    const previous = latestSubmission(question.id);
    if (await submit({ type: "answer", questionID: question.id, questionText: question.text, sourceID: question.sourceID ?? null, answer: { kind, text } }, question.id, previous?.status === "queued" ? previous.id : undefined)) {
      if (drafts.current.get(question.id)?.text === text) drafts.current.delete(question.id);
      setExpandedQuestion(null); setSavedMessage({ id: question.id, text: previous || question.sourceID ? "Correction saved. Related requirements may need review when it is applied." : "Answer saved." });
    }
  };

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><div>Reqwizit</div></div>
      <div className="sidebar-label">YOUR WORKSPACE</div>
      <button className="new-project" onClick={() => { setCreating(true); navigate("workspace"); }}>＋ New project</button>
      <nav aria-label="Projects">{projects.map((item) => <button key={item.id} className={`project-link ${id === item.id && !showSettings ? "selected" : ""}`} onClick={() => { setID(item.id); setCreating(false); navigate("workspace"); }}><span>◇</span>{item.name}</button>)}</nav>
      <div className="sidebar-tools"><button className={`settings-toggle ${showSettings ? "selected" : ""}`} aria-label="Settings" title="Settings" aria-current={showSettings ? "page" : undefined} onClick={() => navigate("settings")}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9.5 3-.6 2.2-1.7 1-2.2-.6L2.5 10l1.6 1.6v1.8L2.5 15 5 19.4l2.2-.6 1.7 1 .6 2.2h5l.6-2.2 1.7-1 2.2.6 2.5-4.4-1.6-1.6v-1.8l1.6-1.6L19 5.6l-2.2.6-1.7-1L14.5 3Z" /><circle cx="12" cy="12.5" r="3" /></svg></button></div>
      <div className="sidebar-bottom"><span className="connection-dot" /> Local-first workspace<p>Project files are saved on this device.<br />Discovery sends context to ChatGPT.</p></div>
    </aside>
    <main>
      {showSettings && <nav className="page-navigation" aria-label="Page navigation"><button className="quiet" onClick={backToWorkspace}>← Back to workspace</button></nav>}
      <header className="topbar"><div><h1 ref={pageHeading} tabIndex={-1}>{showSettings ? "Settings" : creating ? "New project" : project?.name ?? "Your next idea starts here."}</h1><small>{showSettings ? project && !creating ? `Settings for ${project.name} · Active connection: ${activeConnection}` : "AI connections and workspace preferences" : project && !creating ? `Active connection: ${activeConnection}` : "Local workspace"}</small><HeaderActivity /></div>
        {!creating && project && data && <ProcessingQueue key={project.id} active={data.active} progress={data.progress} submissions={data.submissions} paused={data.queuePaused} lastJob={lastJob} activities={queueActivities(project, data.execution, data.implementationActive, data.helpJobs, data.implementationOperation)} stopActivity={(target) => void act(async () => { await api(`projects/${project.id}/${target.action}`, target.body); }, "Stopping background task…")} scope={selectedEpic ? areaTitle(selectedEpic) : "All project areas"} disabled={busy || connectionChanged || needsInitialization} stopDisabled={pending} error={error} resume={() => void act(explore, "Starting discovery…")} stop={() => void act(async () => { await api(`projects/${project.id}/cancel`, {}); }, "Stopping discovery…")} />}
        {!showSettings && project && summary && data && !creating && <ProjectProgress key={`progress:${project.id}`} project={project} execution={data.execution} definition={summary} />}</header>
      {pending && <ActivityFeedback label={actionLabel} />}
      {error && <div role="alert" className="error"><strong>Something needs attention.</strong> {error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {showSettings && <section id="workspace-settings" className="settings-panel" aria-label="Settings">
        <AppearanceSettings />
        <AIConnections request={api} disabled={pending} accountID={connectionID} modelID={model} onSelect={(account, selectedModel) => { setConnectionID(account); setModel(selectedModel); }}>
          {project && !creating && <div className="connection-notice"><p><strong>Active connection:</strong> {activeConnection}</p><p>{connectionChanged ? "Your selection is not saved. Choose a model and save it to switch this project's connection." : "This saved connection will be used by Explore next gaps and question help."}</p><button disabled={busy || !model || !connectionChanged} className="primary" onClick={() => void act(() => mutate("model", { model: { providerID: "openai", modelID: model, ...(connectionID ? { connectionID } : {}) } }))}>Save model</button></div>}
        </AIConnections>
        {project && !creating ? <><h2>Project settings</h2><label><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} /> Automatically explore queued answers</label><p>Waiting answers are batched into the next round. Each round uses your model allowance.</p></> : <p>Your selected connection and model will be used when you create a project.</p>}
        <label><input type="checkbox" checked={!connectionID && !(project?.model.connectionID && !creating) && research} disabled={!!connectionID || !!project?.model.connectionID && !creating} onChange={(event) => setResearch(event.target.checked)} /> Allow targeted research in future rounds</label>{(connectionID || project?.model.connectionID && !creating) && <p>Direct ChatGPT discovery runs without web research.</p>}
        {project && !creating && <WorkspaceConnection project={project} scanJob={lastScan} workspace={data?.workspace ?? null} request={api} disabled={pending || !!data?.active} run={act} />}
      </section>}
      <div hidden={showSettings}>
      {project && !creating && connectionChanged && <div className="connection-notice" role="status">Connection changes are not saved. This project still uses {activeConnection}. <button className="secondary" onClick={() => navigate("settings")}>Review connection settings</button></div>}
      {(creating || !projects.length) ? <section className="welcome">
        <div className="welcome-art">✦</div><span className="eyebrow">LET’S MAKE IT CONCRETE</span><h2>Big ideas begin<br />with a little clarity.</h2><p>Tell us what you have in mind. Your AI partner will organize the possibilities, ask useful questions, and help fill in the gaps.</p>
        <form onSubmit={(event) => void create(event)}>
          <fieldset className="project-start"><legend>Start from</legend><label><input type="radio" name="project-start" checked={!initializeFolder} disabled={pending} onChange={() => setInitializeFolder(false)} /> New idea</label><label><input type="radio" name="project-start" checked={initializeFolder} disabled={pending} onChange={() => { setInitializeFolder(true); setCreateDirectory(false); }} /> Existing project</label></fieldset>
          {initializeFolder && <><WorkspacePicker path={workspacePath} create={false} existingOnly onChange={(path) => setWorkspacePath(path)} request={api} disabled={pending} /><div className="folder-preview" aria-live="polite">{previewBusy ? "Inspecting local metadata and documentation…" : folderPreview ? <><strong>Detected: {folderPreview.projectType}</strong><p>Name and description are editable suggestions. No AI connection was used for this preview.</p><small>{folderPreview.evidence.length ? folderPreview.evidence.map((item) => `${item.field}: ${item.path}`).join(" · ") : "Name suggested from the folder name; no descriptive metadata found."}</small>{!folderPreview.description && <p>No suitable description found. You can enter one or let initialization reconstruct it.</p>}</> : "Choose an existing folder to suggest the project name and description."}{previewError && <p role="alert">{previewError}</p>}</div></>}
          <label>Project name<input required maxLength={150} value={name} onChange={(event) => { editedIdentity.current.name = true; setName(event.target.value); }} placeholder="Something worth building" /></label>
          <label>{initializeFolder ? "Project description (suggested from files)" : "Your idea"}<textarea required={!initializeFolder} maxLength={12000} value={idea} onChange={(event) => { editedIdentity.current.description = true; setIdea(event.target.value); }} placeholder={initializeFolder ? "Describe this existing project, or leave blank for initialization…" : "I want to build an app that…"} rows={5} /></label>
          {!initializeFolder && <WorkspacePicker path={workspacePath} create={createDirectory} onChange={(path, make) => { setWorkspacePath(path); setCreateDirectory(make); }} request={api} disabled={pending} />}
          {initializeFolder && <p>Source files will be sent to your selected AI connection in bounded batches. Review the generated feature and requirement proposals first. {workspacePath.trim() ? "" : "Select a local folder to initialize."}</p>}
          <div className="connection-summary">{connectionID ? "Direct ChatGPT plan" : "OpenCode connection"} · {model || "Choose a model in Settings"} <button type="button" className="quiet" onClick={() => navigate("settings")}>Choose AI connection</button></div>
          <label className="research-toggle"><input type="checkbox" checked={!connectionID && research} disabled={!!connectionID} onChange={(event) => setResearch(event.target.checked)} /> Allow targeted web research</label>
          <button className="primary" disabled={pending || !model || initializeFolder && (!workspacePath.trim() || previewBusy || !folderPreview)}>{pending && <Spinner />}{pending ? "Creating…" : initializeFolder ? "Create & initialize existing project →" : "Create & explore →"}</button>
        </form>
      </section> : !project || !summary ? <div className="empty">Loading your workspace…</div> : <>
        <div className="workspace-status" role="status"><span>{data.workspace ? `${data.workspace.status === "saved" ? "Saved" : data.workspace.status === "pending" ? "Saving" : data.workspace.status === "conflict" ? "Conflict" : "Unavailable"} · ${data.workspace.path}${data.workspace.savedRevision ? ` · r${data.workspace.savedRevision}` : ""}` : "No local folder connected"}</span><button className="quiet" onClick={() => navigate("settings")}>{data.workspace ? "Workspace settings" : "Connect workspace"}</button>{data.workspace?.diagnostic && <span>{data.workspace.diagnostic}</span>}</div>
        <div className="tabs main-tabs" role="tablist" aria-label="Workspace">{([ ["discover", "Design"], ["review", "Review"], ["implementation", "Implement"], ["requirements", "Project map"], ["history", "Activity"] ] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key || key === "history" && tab === "research"} className={tab === key || key === "history" && tab === "research" ? "active" : ""} onClick={() => setTab(key)}>{label}{key === "discover" && <span>{openQuestions.length}</span>}{key === "review" && <span>{reviewItems(project, data.submissions, "pending").length}</span>}{key === "implementation" && <span>{implementationRemaining}</span>}</button>)}</div>
        <section className="workspace">
          <div className="discovery-column">
            <div className="work-heading"><div><h2>{tab === "discover" ? "One decision at a time" : tab === "review" ? "Review one requirement at a time" : tab === "implementation" ? "Build one requirement at a time" : tab === "requirements" ? "Your project, taking shape" : "Project activity"}</h2><label className="area-filter">Feature<select aria-label="Filter by feature" value={epicID} onChange={(event) => setEpicID(event.target.value)}><option value="all">All project areas</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>{areaTitle(epic)}</option>)}</select></label></div>{tab !== "implementation" && <button className="primary" disabled={busy || connectionChanged || needsInitialization} onClick={() => void act(explore, "Starting discovery…")}>{data.active && <Spinner />}{data.active ? "Discovering…" : "Explore next gaps →"}</button>}</div>
            {needsInitialization && tab !== "implementation" && <p role="status">Initialization must complete before gap discovery. Retry the folder scan below.</p>}
            {tab !== "implementation" && data.workspace && (!project.scans.length || tab === "requirements") && <WorkspaceScan project={project} scanJob={lastScan} disabled={busy || connectionChanged} scan={(resumeJobID) => act(async () => { await api(`projects/${project.id}/scan`, { revision: project.revision, resumeJobID }); setTab("requirements"); })} />}
            {tab === "implementation" && <ImplementationTab key={project.id} project={project} state={data.execution} active={data.implementationActive} disabled={pending || data.active} discoveryActive={data.active} connected={!!data.workspace} workspaceID={data.workspace?.bindingID} epicID={epicID} inspectRepository={() => api<WorkspaceRepository>(`projects/${project.id}/execution-repository`)} action={(name, body) => act(async () => { await api(`projects/${project.id}/${name}`, { ...(name === "execution-start" || name === "execution-config" ? { revision: project.revision } : {}), ...body }); })} />}
            {(tab === "history" || tab === "research") && <div className="filter-row"><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Revisions</button><button className={tab === "research" ? "active" : ""} onClick={() => setTab("research")}>Research sources</button></div>}
            {tab === "discover" && <>
              <QuestionCleanup project={project} disabled={busy || connectionChanged} queuedIDs={protectedQuestionIDs} replaceDisabled={!project.scans.length} retire={(ids, regenerate) => act(() => dismissQuestions(ids, regenerate))} />
              <div className="filter-row" aria-label="Question filters">{([ ["open", "To answer"], ["answered", "Previous answers"], ["later", "Deferred / delegated"], ["submitted", "Submitted"] ] as const).map(([key, label]) => <button key={key} aria-pressed={questionFilter === key} className={questionFilter === key ? "active" : ""} onClick={() => { setQuestionFilter(key); setExpandedQuestion(null); }}>{label} <span>{scopedQuestions.filter((q) => key === "submitted" ? queuedQuestionIDs.has(q.id) : !queuedQuestionIDs.has(q.id) && (key === "open" ? q.status === "pending" : key === "answered" ? q.status === "answered" : ["deferred", "delegated"].includes(q.status))).length}</span></button>)}</div>
              {savedMessage && <div className="save-notice" role="status">{savedMessage.text} <button className="quiet" onClick={() => { const q = project.questions.find((q) => q.id === savedMessage.id); setQuestionFilter(queuedQuestionIDs.has(savedMessage.id) ? "submitted" : q?.status === "answered" ? "answered" : "later"); setExpandedQuestion(savedMessage.id); }}>Edit answer</button><button className="quiet" aria-label="Dismiss saved message" onClick={() => setSavedMessage(null)}>×</button></div>}
              {visibleQuestions.length === 0 && <div className="empty-card"><h3>{questionFilter !== "open" ? "No responses in this view yet." : queuedQuestionIDs.size ? "Your responses are in the queue." : "Ready for the next questions?"}</h3><p>{questionFilter === "open" ? "Explore the next gaps or add more information. Questions will adapt as you answer; no open questions does not mean the specification is complete." : "Use the filters above to answer questions or revisit a saved response."}</p></div>}
              {(epics.some((epic) => !["project", "inbox"].includes(epic.id)) || project.organizationReviews.some((review) => review.status === "pending")) && <button className="map-prompt" onClick={() => setTab("requirements")}>Your project is taking shape · {epics.filter((epic) => !["project", "inbox"].includes(epic.id)).length} feature areas{project.organizationReviews.some((review) => review.status === "pending") ? " · Organization changes to review" : ""} <span>View project map →</span></button>}
              {project.questions.filter((question) => question.status === "retired" && drafts.current.get(question.id)?.text.trim()).map((question) => <article className="question-card" key={question.id}><h3>Draft retained: {question.text}</h3><p>This question was retired during discovery. Your draft is still here; you can save it as a project note.</p><p className="source-excerpt">{drafts.current.get(question.id)!.text}</p><button className="secondary" disabled={sending.includes(question.id)} onClick={() => void submit({ type: "note", text: drafts.current.get(question.id)!.text, epicID: "project" }, question.id).then((saved) => { if (saved) { drafts.current.delete(question.id); void load(); } })}>Save draft as note</button></article>)}
              {visibleQuestions.map((question, index) => {
                const submission = latestSubmission(question.id);
                const response = submission?.input.type === "answer" ? submission.input.answer : undefined;
                const source = project.sources.find((item) => item.id === question.sourceID);
                return <QuestionCard key={`${project.id}:${question.id}:${submission?.id ?? question.sourceID ?? "new"}`} question={question} area={areaTitle(epics.find((epic) => epic.id === question.epicID))} purpose={epics.find((epic) => epic.id === question.epicID)?.purpose} expanded={activeQuestionID === question.id} onToggle={() => setExpandedQuestion(activeQuestionID === question.id ? null : question.id)} onCancel={() => { drafts.current.delete(question.id); setExpandedQuestion(null); }} help={help} draft={drafts.current.get(question.id)} onDraft={(draft) => drafts.current.set(question.id, draft)} initialText={response?.text ?? source?.text} initialKind={response?.kind ?? (source && ["answer", "delegation", "deferral"].includes(source.kind) ? source.kind as Draft["kind"] : undefined)} number={index + 1} disabled={sending.includes(question.id)} dismissDisabled={busy || connectionChanged} onDismiss={question.status === "pending" && !question.sourceID && !protectedQuestionIDs.has(question.id) ? () => act(() => dismissQuestions([question.id])) : undefined} status={sending.includes(question.id) ? "Saving…" : responseStatus(question.id)} onSave={(kind, text) => saveAnswer(question, kind, text)} />;
              })}
              <details className="add-information"><summary>Add information</summary><form className="note-card" onSubmit={(event) => { event.preventDefault(); const submitted = note; void submit({ type: "note", text: submitted, epicID: epicID === "all" ? "project" : epicID }, "note").then((saved) => { if (saved) setNote((current) => current === submitted ? "" : current); }); }}><label>Add an idea, correction, or constraint<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Something else the project should consider…" maxLength={12000} required /></label><button className="secondary" disabled={sending.includes("note") || !note.trim()}>{sending.includes("note") ? "Saving…" : "Add to project →"}</button></form></details>
            </>}
            <div hidden={tab !== "review"}><ReviewQueue key={project.id} project={project} submissions={data.submissions} epicID={epicID} sending={sending} submit={submit}
              disabled={busy || !!data.active || connectionChanged || needsInitialization}
              refine={() => void act(async () => { await api(`projects/${project.id}/analyze`, { revision: project.revision, refinementOnly: true, research: false, ...(epicID !== "all" ? { focusEpicID: epicID } : {}) }); })}
              reviewRefinement={async (proposalID, accept) => {
                let saved = false;
                await act(async () => { await mutate("refinement-review", { proposalID, accept }); saved = true; });
                return saved;
              }} /></div>
            {tab === "requirements" && <>
              <p className="view-intro">Features group related requirements and decisions. Open a feature to explore it; suggestions stay proposed until you confirm them.</p>
              <ImplementationProgress project={project} requirements={requirements} disabled={pending} save={(requirementID, value) => act(() => mutate("implementation", { requirementID, ...value }))} />
              <details className="project-overview"><summary>Project overview</summary><p>{project.summary || "Your answers will help clarify the project scope."}</p>{project.analysisRevision !== project.revision && <small>New information has been saved since this overview was generated.</small>}</details>
              <button className="secondary" onClick={() => setNewEpic(!newEpic)}>{newEpic ? "Cancel" : "+ Add feature"}</button>
              {newEpic && <EpicForm disabled={busy} onSave={(title, purpose) => act(async () => { await mutate("epic", { title, purpose }); setNewEpic(false); })} />}
              {!requirements.length && <div className="empty-card"><h3>Your specification will take shape here.</h3><p>Start with the questions. Features and requirements appear as the project becomes clearer.</p></div>}
              {epics.filter((epic) => epicID === "all" || epic.id === epicID).map((epic) => {
                const members = requirements.filter((r) => r.epicID === epic.id);
                const related = project.questions.filter((q) => q.epicID === epic.id && q.status !== "retired");
                if (["project", "inbox"].includes(epic.id) && !members.length && !related.length && !project.sources.some((s) => s.kind === "note" && s.epicID === epic.id)) return null;
                return <details className="feature-group" key={epic.id}><summary><strong>{areaTitle(epic)}</strong><span>{members.filter((r) => r.status === "accepted").length} confirmed · {members.filter((r) => ["proposed", "needs-review"].includes(r.status)).length} to review · {related.filter((q) => ["pending", "deferred", "delegated"].includes(q.status)).length} open questions</span></summary><p>{epic.purpose}</p><div className="button-row"><button className="quiet" onClick={() => { setEpicID(epic.id); setTab("discover"); setQuestionFilter("open"); }}>Answer feature questions →</button><button className="quiet" onClick={() => setEpicID(epic.id)}>Focus progress details</button>{!["project", "inbox"].includes(epic.id) && <button className="quiet" onClick={() => setEditingEpic(editingEpic === epic.id ? null : epic.id)}>Edit feature</button>}</div>
                {editingEpic === epic.id && <EpicForm title={epic.title} purpose={epic.purpose} disabled={busy} onSave={(title, purpose) => act(async () => { await mutate("epic", { epicID: epic.id, title, purpose }); setEditingEpic(null); })} />}
                {!members.length && <p>No requirements recorded for this feature yet.</p>}
                {members.map((requirement) => <details className="requirement-detail" key={requirement.id}><summary><span className={`badge ${requirement.status}`}>{requirement.status === "accepted" ? "Confirmed" : requirement.status === "needs-review" ? "Needs review" : requirement.status === "proposed" ? "Proposed" : "Rejected"}</span><strong>{requirement.statement}</strong></summary><article className="requirement-card"><p>{requirement.rationale}</p><h4>Acceptance scenarios</h4><ul>{requirement.acceptance.map((item) => <li key={item}>{item}</li>)}</ul><details><summary>Supporting decisions</summary>{requirement.sourceIDs.map((sourceID) => <Evidence key={sourceID} id={sourceID} project={project} />)}</details><label>Organize into<select aria-label={`Feature for ${requirement.statement}`} disabled={busy} value={requirement.epicID} onChange={(event) => void act(() => mutate("organize", { operations: [{ type: "move", recordID: requirement.id, epicID: event.target.value }] }))}>{epics.map((area) => <option key={area.id} value={area.id}>{areaTitle(area)}</option>)}</select></label><p className="review-note">{requirement.reviewNote}</p><ReviewForm disabled={sending.includes(`review:${requirement.id}`) || data.submissions.some((s) => s.input.type === "review" && s.input.requirementID === requirement.id && ["queued", "saved", "processing"].includes(s.status))} onReview={async (action, note) => { await submit({ type: "review", requirementID: requirement.id, requirementText: requirement.statement, fingerprint: reviewFingerprint(requirement), action, note }, `review:${requirement.id}`); }} /></article></details>)}
                <details className="feature-decisions"><summary>Saved answers & notes</summary>{related.filter((q) => q.sourceID).map((q) => <div key={q.id}><strong>{q.text}</strong><p className="source-excerpt">{project.sources.find((s) => s.id === q.sourceID)?.text}</p><button className="quiet" onClick={() => { setEpicID(epic.id); setTab("discover"); setQuestionFilter(queuedQuestionIDs.has(q.id) ? "submitted" : q.status === "answered" ? "answered" : "later"); setExpandedQuestion(q.id); }}>Edit answer</button></div>)}{project.sources.filter((s) => s.kind === "note" && s.epicID === epic.id).map((s) => <p className="source-excerpt" key={s.id}>{s.text}</p>)}</details>
                </details>;
              })}
            </>}
            {tab === "history" && <div className="history-list">{history.map((entry) => <article key={entry.revision}><span className="history-dot" /><div><strong>Revision {entry.revision}</strong><p>{entry.reason}</p></div></article>)}</div>}
            {tab === "research" && <><div className="research-intro"><label><input type="checkbox" checked={!project.model.connectionID && research} disabled={!!project.model.connectionID} onChange={(event) => setResearch(event.target.checked)} /> Allow targeted research in future rounds</label><p>{project.model.connectionID ? "Direct ChatGPT discovery runs without web research. Existing sources remain available below." : "Search and page retrieval are limited to relevant uncertainties. Sources inform choices; they do not decide your preferences. The round stops if it exceeds the monitored tool budget."}</p></div>{project.research.filter((item) => epicID === "all" || item.epicID === epicID).map((finding) => <article className="requirement-card" key={finding.id}><span className="badge">{finding.kind === "fetched-page" ? "Retrieved page" : "Search-result evidence"}</span><h3><a href={finding.url} target="_blank" rel="noreferrer">{finding.title} ↗</a></h3><p>{finding.finding}</p><small>{new URL(finding.url).hostname} · {new Date(finding.retrievedAt).toLocaleString()}</small><details><summary>Source excerpt</summary><p className="source-excerpt">{finding.excerpt}</p></details></article>)}{!project.research.length && <div className="empty-card"><h3>No sources collected yet.</h3><p>{project.model.connectionID ? "Web research is not yet available for direct ChatGPT connections." : "Enable research and explore a concrete area. Vague ideas may need clarification before external research is useful."}</p></div>}</>}
          </div>
          {tab !== "discover" && <aside className="insight-column">
            <details className="insight-card definition-details"><summary><strong>Definition progress</strong><span>{epicScore?.percent ?? summary.percent}% estimated coverage · {(epicScore?.stale ?? summary.stale) ? "Review needed" : "View details"}</span></summary><p>Coverage describes identified work, not completeness or build readiness.</p><Meter value={epicScore?.percent ?? summary.percent} stale={epicScore?.stale ?? summary.stale} /><p>{epicScore?.explanation ?? summary.scopeExplanation}</p>{epicScore ? <>{epicScore.checks.map((check) => <details className="check-row" key={check.dimension}><summary><span className={`check-icon ${check.status}`}>{check.status === "defined" || check.status === "not-applicable" ? "✓" : check.status === "partial" ? "◐" : "○"}</span>{check.label}<span className="check-status">{({ unknown: "Not explored yet", partial: "Needs more detail", defined: "Decision recorded", "needs-review": "Review needed", "not-applicable": "Not relevant" } as const)[check.status]}</span></summary><p>{check.explanation}</p><small>{check.importance} · {check.evidenceIDs.length} evidence links</small>{check.evidenceIDs.map((evidenceID) => <Evidence key={evidenceID} id={evidenceID} project={project} />)}</details>)}</> : <><p className="muted">Choose a feature using the filter to inspect its definition details and supporting decisions.</p><small>{summary.note}</small></>}</details>
            {!!selectedEpic?.dependencies.length && <section className="insight-card"><h3>Related dependencies</h3>{selectedEpic.dependencies.map((dependency) => <button className="quiet" key={dependency} onClick={() => setEpicID(dependency)}>{epics.find((item) => item.id === dependency)?.title ?? "Related area"} →</button>)}</section>}
            <details className="insight-card changes"><summary>Latest changes</summary>{project.roundChanges.length ? <ul>{project.roundChanges.map((change, index) => <li key={index}>{change}</li>)}</ul> : <p>Your next round’s changes will appear here.</p>}{lastJob?.status === "completed" && lastJob.expectedRevision < project.revision && <button className="quiet" disabled={busy} onClick={() => void act(() => mutate("undo-organization", { targetRevision: lastJob.expectedRevision }))}>Restore map before this round</button>}</details>
            {project.organizationReviews.filter((item) => item.status === "pending").map((review) => <section key={review.id} className="insight-card review-organization"><h3>Reorganization to review</h3><p>{review.reason}</p><details><summary>See proposed changes</summary><ul>{review.operations.map((op, index) => <li key={index}>{op.type === "upsert" ? `${op.type}: ${op.title} — ${op.purpose}` : op.type === "merge" || op.type === "split" ? `${op.type}: ${op.reason}` : `Move a record to ${project.epics.find((item) => item.id === op.epicID)?.title ?? "a proposed epic"}`}</li>)}</ul></details><div className="button-row"><button className="secondary" disabled={busy} onClick={() => void act(() => mutate("organization-review", { reviewID: review.id, accept: true }))}>Apply</button><button className="quiet" disabled={busy} onClick={() => void act(() => mutate("organization-review", { reviewID: review.id, accept: false }))}>Keep current</button></div></section>)}
            {!!project.assumptions.length && <details className="insight-card"><summary>Unconfirmed assumptions <span>{project.assumptions.length}</span></summary><ul>{project.assumptions.map((item) => <li key={item}>{item.replace(/^Unconfirmed:\s*/i, "")}</li>)}</ul></details>}
            <details className="insight-card"><summary>Your original idea & recent notes</summary>{[...project.sources.filter((item) => item.kind === "initial"), ...project.sources.filter((item) => item.kind === "note").slice(-9)].map((item) => <blockquote key={item.id}><small>{item.kind === "initial" ? "Original idea" : "Your note"}</small><p className="source-excerpt">{item.text}</p></blockquote>)}<small>Original idea and latest nine notes. All saved input remains in revision history.</small></details>
            {tab === "history" && <section className="insight-card settings"><button className="quiet" aria-expanded={showContext} onClick={() => setShowContext(!showContext)}>Technical details {showContext ? "−" : "+"}</button>{showContext && <><p>Project revision {project.revision} · Analysis revision {project.analysisRevision ?? "Not yet analyzed"}</p>{lastJob?.context && <><p>{lastJob.context.characters.toLocaleString()} / {lastJob.context.budget.toLocaleString()} context characters · {lastJob.context.includedIDs.length} evidence records · {lastJob.context.omittedIDs.length} omitted from detail</p>{lastJob.context.partial && <p>Task-sized pass: exact human guardrails retained; whole-area assessments and project interpretation preserved.</p>}{!!lastJob.context.submissionIDs?.length && <p>{lastJob.context.submissionIDs.length} saved responses in this working group.</p>}</>}<small>Fresh revision-bound context each round. AI summaries do not replace your decisions. The context budget is a conservative character bound, not an exact tokenizer count.</small></>}</section>}
          </aside>}
        </section>
      </>}
      </div>
    </main>
  </div>;
}

function areaTitle(epic?: Project["epics"][number]) {
  return epic?.id === "project" ? "Shared project decisions" : epic?.id === "inbox" ? "Items to organize" : epic?.title ?? "Items to organize";
}

function QuestionCard({ question, area, purpose, expanded, onToggle, onCancel, help, initialText, initialKind, draft, onDraft, number, disabled, dismissDisabled, onDismiss, status, onSave }: { question: Project["questions"][number]; area: string; purpose?: string; expanded: boolean; onToggle: () => void; onCancel: () => void; help: HelpControls; initialText?: string; initialKind?: Draft["kind"]; draft?: Draft; onDraft: (draft: Draft) => void; number: number; disabled: boolean; dismissDisabled: boolean; onDismiss?: () => Promise<void>; status?: string; onSave: (kind: "answer" | "delegation" | "deferral", text: string) => Promise<void> }) {
  const [text, setText] = useState(draft?.text ?? initialText ?? ""); const [kind, setKind] = useState<Draft["kind"]>(draft?.kind ?? initialKind ?? (question.status === "delegated" ? "delegation" : question.status === "deferred" ? "deferral" : "answer"));
  const updateText = (value: string) => { setText(value); onDraft({ kind, text: value }); };
  const updateKind = (value: Draft["kind"]) => { setKind(value); onDraft({ kind: value, text }); };
  const currentQuestion = number === 1 && question.status === "pending" && !status;
  const [helpReveal, setHelpReveal] = useState(0);
  const [explaining, setExplaining] = useState(false);
  const explanationInFlight = useRef(false);
  async function explain(phrase: string, context: string) {
    if (explanationInFlight.current || help.busy) return;
    explanationInFlight.current = true; setExplaining(true); setHelpReveal((value) => value + 1);
    try { await help.request({ questionID: question.id, action: "follow-up", message: `${wordHelpContext(phrase, context)}Start with a short, plain-language summary in one or two sentences as the first paragraph (for an inline tooltip). Then explain what it changes for this project's choice. Keep any assumptions or caveats explicit.` }); }
    finally { explanationInFlight.current = false; setExplaining(false); }
  }
  const annotated = (text: string, field: "text" | "whyItMatters" | "label" | "consequence", optionIndex?: number) => <AnnotatedText text={text} concepts={question.concepts?.filter((c) => c.field === field && c.optionIndex === optionIndex)} onExplain={explain} onCancel={help.cancel} busy={explaining || help.busy} jobs={help.jobs.filter((job) => job.helpRequest?.questionID === question.id)} revision={help.revision} />;
  return <article className={`question-card ${expanded ? "expanded" : "collapsed"}`}><div className="question-meta"><span>{area}{question.category ? ` · ${dimensionLabels[question.category]}` : ""}</span><span role="status">{status ?? (question.status === "pending" ? "To answer" : question.status === "answered" ? "Answered" : question.status)}</span></div><div className="question-title"><h3 aria-label={question.text}>{expanded ? annotated(question.text, "text") : <button aria-expanded={false} onClick={onToggle}>{question.text}</button>}</h3>{expanded && currentQuestion ? <span className="quiet">Current question</span> : <button className="quiet" aria-expanded={expanded} onClick={onToggle}>{expanded ? "Collapse" : initialText ? "Edit answer" : "Answer"}</button>}</div>{!expanded && initialText && <p className="answer-preview">{initialText}</p>}{expanded && <div className="question-body"><p>{annotated(question.whyItMatters, "whyItMatters")}</p>{purpose && <details className="question-context"><summary>About this feature</summary><p>{purpose}</p></details>}{status === "processing" && <p className="correction-hint">This response is being reviewed. A correction will be saved for the next round.</p>}{status === "queued" && <p className="correction-hint">Saving changes replaces this waiting response. Its earlier version stays in history.</p>}<div className="options">{question.options.map((option, index) => <div className={`option ${kind === "answer" && text === option.label ? "chosen" : ""}`} key={index}><span className="option-circle">{String.fromCharCode(65 + index)}</span><div className="option-copy"><strong>{annotated(option.label, "label", index)}</strong><small>{annotated(option.consequence, "consequence", index)}</small></div><button type="button" className="option-choose" aria-label={`Choose ${option.label}. ${option.consequence}`} aria-pressed={kind === "answer" && text === option.label} disabled={disabled} onClick={() => { setKind("answer"); setText(option.label); onDraft({ kind: "answer", text: option.label }); }}>{kind === "answer" && text === option.label ? "✓ Selected" : "Choose"}</button></div>)}</div>
    {disabled && <ActivityFeedback label="Saving response…" />}
    <p className="word-help-hint">Unclear wording? Click any word, then ? to ask what it means. Underlined concepts explain instantly.</p>
    <QuestionHelp questionID={question.id} help={help} reveal={helpReveal} requesting={explaining} />
    <form onSubmit={(event) => { event.preventDefault(); if (!disabled) void onSave(kind, text); }}><label className="sr-only">Your answer to {question.text}</label><textarea aria-label={`Your answer to ${question.text}`} value={text} onChange={(event) => updateText(event.target.value)} rows={2} maxLength={12000} placeholder={kind === "delegation" ? "Describe exactly which choice the AI may make, and its limits…" : kind === "deferral" ? "What should remain open, and why?" : "Choose an option above, or write it in your own words…"} required /><div className="answer-actions"><select aria-label={`Response type for ${question.text}`} value={kind} disabled={disabled} onChange={(event) => updateKind(event.target.value as typeof kind)}><option value="answer">My answer</option><option value="deferral">Defer for now</option><option value="delegation">Delegate within limits</option></select><button type="button" className="quiet" disabled={disabled} onClick={() => { setText(initialText ?? ""); setKind(initialKind ?? "answer"); onCancel(); }}>Cancel</button>{onDismiss && <button type="button" className="quiet" disabled={disabled || dismissDisabled} onClick={() => void onDismiss()} aria-label={`Dismiss unrelated question: ${question.text}`}>Unrelated / dismiss</button>}<button className="primary" disabled={disabled || !text.trim()}>{initialText ? "Save changes →" : "Save response →"}</button></div>{kind === "delegation" && <small className="delegation-note">Delegation records permission within your stated limits. It does not turn this text into a confirmed product preference.</small>}</form></div>}
  </article>;
}
function ReviewForm({ disabled, onReview }: { disabled: boolean; onReview: (action: "accepted" | "rejected", note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  return <div className="review-form"><label>Review rationale (optional)<input maxLength={12000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything to add or change?" /></label><div className="button-row"><button className="secondary" disabled={disabled} onClick={() => void onReview("accepted", note)}>Confirm requirement</button><button className="quiet" disabled={disabled} onClick={() => void onReview("rejected", note)}>Reject</button></div></div>;
}
function EpicForm({ disabled, onSave, title: initialTitle = "", purpose: initialPurpose = "" }: { disabled: boolean; title?: string; purpose?: string; onSave: (title: string, purpose: string) => Promise<void> }) {
  const [title, setTitle] = useState(initialTitle); const [purpose, setPurpose] = useState(initialPurpose);
  return <form className="epic-form" onSubmit={(event) => { event.preventDefault(); void onSave(title, purpose); }}><label>Feature name<input required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} /></label><label>Purpose<textarea required value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={4000} rows={3} /></label><button className="secondary" disabled={disabled}>{initialTitle ? "Save feature" : "Add feature"}</button></form>;
}
function Evidence({ id, project }: { id: string; project: Project }) {
  const source = project.sources.find((item) => item.id === id);
  const requirement = project.requirements.find((item) => item.id === id);
  const question = project.questions.find((item) => item.id === id);
  const research = project.research.find((item) => item.id === id);
  const label = source ? `Human ${source.kind}` : requirement ? `Requirement · ${requirement.status}` : question ? `Question · ${question.status}` : "Research finding";
  const value = source?.text ?? requirement?.statement ?? question?.text ?? research?.finding ?? "Evidence unavailable";
  return <blockquote className="evidence"><small>{label}</small><p>{value.length > 800 ? `${value.slice(0, 800)}… (excerpt)` : value}</p>{research && <a href={research.url} target="_blank" rel="noreferrer">Open source ↗</a>}</blockquote>;
}
createRoot(document.getElementById("root")!).render(<ActivityProvider><App /></ActivityProvider>);
