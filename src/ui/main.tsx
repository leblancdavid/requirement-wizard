import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { DiagnosticNotice } from "./diagnostic-notice.js";
import type { Job, Project, Submission } from "../core/model.js";
import { captureAnswerScope } from "../core/input-scope.js";
import type { coverage } from "../core/coverage.js";
import { dimensionLabels } from "../core/epics.js";
import "./appearance.css";
import "./review.css";
import "./action-button.css";
import { ReviewQueue, reviewItems, reviewProcessingScope, type ReviewDraft } from "./review.js";
import { Pagination, PagedList, usePagination } from "./pagination.js";
import "./pagination.css";
import { ProcessingQueue } from "./processing-queue.js";
import { MaintenanceSettings, type MaintenanceAction } from "./maintenance-controls.js";
import { WorkflowControls, type WorkflowAction } from "./workflow-controls.js";
import type { WorkflowView } from "../service/workflow.js";
import type { WorkflowDecision } from "../core/workflow.js";
import "./maintenance-controls.css";
import type { MaintenanceView } from "../core/maintenance.js";
import { IssueDialog } from "./issue-dialog.js";
import { attentionSummary } from "./attention.js";
import { queueActivities } from "./queue-activity.js";
import { ImplementationTab } from "./implementation.js";
import { ProjectProgress } from "./project-progress.js";
import { definitionDecisions } from "../core/definition-decisions.js";
import type { ReadinessQuestionTask } from "../core/readiness-questions.js";
import { ProjectActivityFeed } from "./project-activity.js";
import { LazyDetails } from "./lazy-details.js";
import { projectProgress } from "../core/progress.js";
import { ActivityProvider, ActivityFeedback, HeaderActivity, Spinner, useActivity } from "./activity.js";
import { createExecutionIndex, deliveredRequirement, type ExecutionEvaluation, type ExecutionState, type WorkspaceRepository } from "../core/execution.js";
import { executionEvaluation } from "./execution-state.js";
import { SnapshotRefresh } from "./snapshot.js";
import type { SnapshotTokens } from "../web/snapshot.js";
import { questionReviewFingerprint } from "../core/model.js";
import { ReviewUpdateNotice, SpecificationChanges } from "./review-update.js";
import { AppearanceSettings } from "./appearance-settings.js";
import { AnnotatedText, QuestionHelp, type HelpControls } from "./question-help.js";
import { AIConnections } from "./connections.js";
import { WorkspacePicker, WorkspaceConnection, WorkspaceScan, ImplementationProgress } from "./workspace-files.js";
import type { Workspace } from "../storage/workspace.js";
import type { FolderPreview } from "../core/folder-preview.js";
import { ActionButton, ActionScope } from "./action-button.js";
import { discoveryBlockReason, executionBlockReason } from "../core/operations.js";
import { ItemProcessingNotice } from "./decision-recovery.js";
import { AttemptCleanup } from "./attempt-cleanup.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";
import { GapContinuation } from "./gap-continuation.js";
import { AppMenu } from "./app-menu.js";
import { DesktopTitleBar } from "./desktop-titlebar.js";
import { Logs } from "./logs.js";
import { LogLink, LogProject, openLogs, recordLog } from "./log-access.js";

type Snapshot = { project: Project; workspace: Workspace | null; coverage: ReturnType<typeof coverage>; previousCoverage: number | null; jobs: (Job & { gapContinuationAvailable?: boolean })[]; helpJobs: Job[]; active: boolean; progress: string[]; refinementProgress?: import("../core/refinement.js").RefinementProgress | null; maintenance: MaintenanceView; workflow?: WorkflowView; submissions: Submission[]; queuePaused: boolean; execution: ExecutionState; implementationActive: boolean; implementationOperation?: string };
type Item = { id: string; name: string; revision: number };
type Draft = { kind: "answer" | "delegation" | "deferral"; text: string; fingerprint?: string };
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
  try {
    const response = await fetch(`/api/${path}`, { method: body === undefined ? "GET" : "POST",
      signal, headers: { "X-Reqwizit-Token": token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed.");
    return data as T;
  } catch (error) {
    const projectID = /^projects\/([^/]+)/.exec(path)?.[1];
    if (!signal?.aborted) recordLog({ id: crypto.randomUUID(), title: "App request failed", source: "App", status: "failed", projectID: projectID === "open" ? undefined : projectID, at: new Date().toISOString(), detail: error instanceof Error ? error.message : "Request failed." });
    throw error;
  }
}
function QuestionCleanup({ project, queuedIDs, disabled, replaceDisabled, retire }: { project: Project; queuedIDs: Set<string>; disabled: boolean; replaceDisabled: boolean; retire: (ids: string[], regenerate?: boolean) => Promise<void> }) {
  const eligible = project.questions.filter((q) => q.status === "pending" && !q.sourceID && !queuedIDs.has(q.id));
  const retired = project.questions.filter((q) => q.status === "retired");
  if (!eligible.length && !retired.length) return null;
  return <ActionScope><details className="question-cleanup"><summary>Bulk question actions &amp; history</summary>
    <p>Dismiss individual questions beside Save response. These actions apply to all eligible unanswered questions; saved and queued responses are protected. Questions and reasons remain in history.</p>
    {!!eligible.length && <div className="button-row"><button className="secondary" disabled={disabled} onClick={() => void retire(eligible.map((q) => q.id))}>Dismiss unanswered questions</button><button className="secondary" disabled={disabled || replaceDisabled} title={!disabled && replaceDisabled ? "Complete a folder scan before generating evidence-based replacements." : undefined} onClick={() => void retire(eligible.map((q) => q.id), true)}>Replace unanswered questions from project evidence</button></div>}
    {replaceDisabled && <small>Complete a folder scan before generating evidence-based replacements.</small>}
    {!!retired.length && <details><summary>Dismissed questions · {retired.length}</summary><PagedList items={retired} itemID={(q) => q.id} label="Dismissed questions">{(q) => <div><p><strong>{q.text}</strong><br />{q.retirementReason}</p><ReviewUpdateNotice project={project} recordType="question" recordID={q.id} /></div>}</PagedList></details>}
  </details></ActionScope>;
}
function App() {
  const [projects, setProjects] = useState<Item[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [id, setID] = useState<string | null>(localStorage.getItem("reqwizit-project"));
  const selected = useRef(id); selected.current = id;
  const [data, setData] = useState<Snapshot | null>(null);
  const refresh = useRef(new SnapshotRefresh<Snapshot>());
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [tab, setWorkspaceTab] = useState<"discover" | "review" | "implementation" | "research" | "history">("discover");
  // Existing recovery links now lead to the single specification workspace.
  const setTab = (next: "discover" | "review" | "implementation" | "requirements" | "research" | "history") => setWorkspaceTab(next === "requirements" ? "review" : next);
  const [queueRequest, setQueueRequest] = useState<{ projectID: string; value: number }>();
  const [epicID, setEpicID] = useState("all");
  const [error, setError] = useState("");
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [actionLabel, setActionLabel] = useState("Saving changes…");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string[]>([]);
  const requests = useRef(new Map<string, string>());
  const inFlight = useRef(new Set<string>());
  const drafts = useRef(new Map<string, Draft>());
  const [auto, setAuto] = useState(localStorage.getItem("reqwizit-auto") !== "false");
  const [research, setResearch] = useState(localStorage.getItem("reqwizit-research") !== "false");
  const [evidencePilot, setEvidencePilot] = useState(false);
  const [questionTarget, setQuestionTarget] = useState(5);
  useEffect(() => {
    const saved = Number(localStorage.getItem(`reqwizit-question-target:${id}`));
    setQuestionTarget(Number.isInteger(saved) && saved >= 1 && saved <= 50 ? saved : 5);
  }, [id]);
  useEffect(() => { setEvidencePilot(false); setQueueRequest(undefined); }, [id]);
  const [name, setName] = useState(""); const [idea, setIdea] = useState("");
  const [workspacePath, setWorkspacePath] = useState(""); const [createDirectory, setCreateDirectory] = useState(false);
  const [initializeFolder, setInitializeFolder] = useState(false);
  const [folderPreview, setFolderPreview] = useState<FolderPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const editedIdentity = useRef({ name: false, description: false });
  const [model, setModel] = useState("gpt-6.1-sol");
  const [providerID, setProviderID] = useState("openai");
  const [connectionID, setConnectionID] = useState("");
  const [selectionProjectID, setSelectionProjectID] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [newEpic, setNewEpic] = useState(false);
  const [editingEpic, setEditingEpic] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(location.hash === "#/settings");
  const [maintenanceSettingsRequested, setMaintenanceSettingsRequested] = useState(false);
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
  const [issue, setIssue] = useState<{ projectID: string; submissionID?: string; requirementID?: string }>();
  const issueDrafts = useRef<Record<string, ReviewDraft>>({});
  const openIssue = (submissionID: string) => { if (project) setIssue({ projectID: project.id, submissionID }); };
  const [savedMessage, setSavedMessage] = useState<{ id: string; text: string } | null>(null);
  const [definitionClarification, setDefinitionClarification] = useState<{ projectID: string; task: ReadinessQuestionTask; reused: boolean; result?: Job["result"] }>();
  const openedClarification = useRef<string>(undefined);
  const project = data?.project;
  const openProcessingQueue = () => { if (project) setQueueRequest((previous) => ({ projectID: project.id, value: (previous?.value ?? 0) + 1 })); };
  const openMaintenanceSettings = () => { setMaintenanceSettingsRequested(true); navigate("settings"); };
  const configureMaintenance = (action: MaintenanceAction) => void act(async () => {
    if (project && data) await api(`projects/${project.id}/maintenance`, { revision: project.revision, version: data.maintenance.version, action });
  }, "Updating automatic maintenance…");
  const configureWorkflow = (action: WorkflowAction) => void act(async () => {
    if (project && data?.workflow) await api(`projects/${project.id}/workflow`, { revision: project.revision, version: data.workflow.version, action });
  }, "Updating project workflow…");
  const openWorkflowDecision = (decision: WorkflowDecision) => {
    if (!project) return;
    navigate("workspace");
    if (decision.kind === "input") openIssue(decision.id);
    else if (decision.kind === "requirement") setIssue({ projectID: project.id, requirementID: decision.id });
    else if (decision.kind === "question") {
      const question = project.questions.find((q) => q.id === decision.id); if (!question) return;
      setTab("discover"); setEpicID(question.epicID); setQuestionFilter(question.status === "pending" ? "open" : "later"); setExpandedQuestion(question.id);
    } else if (decision.kind === "refinement") {
      const proposal = project.refinements.find((p) => p.id === decision.id); if (proposal) setIssue({ projectID: project.id, requirementID: proposal.requirementID });
    } else { setTab("requirements"); setEpicID("all"); }
  };
  const summary = data?.coverage;
  const evaluationCache = useRef<ExecutionEvaluation | null>(null);
  const evaluation = useMemo(() => {
    evaluationCache.current = data ? executionEvaluation(data.execution, evaluationCache.current) : null;
    return evaluationCache.current;
  }, [data?.execution]);
  const executionIndex = useMemo(() => project && evaluation ? createExecutionIndex(project, evaluation) : null, [project, evaluation?.config]);
  const mapProgress = useMemo(() => project && evaluation && executionIndex ? projectProgress(project, evaluation, data!.coverage, executionIndex) : null, [project, evaluation, data?.coverage, executionIndex]);
  const busy = pending || !!data?.active || !!data?.implementationActive;
  useActivity(pending, actionLabel);
  useActivity(loading, "Loading workspace…");
  useActivity(sending.length > 0, `Saving ${sending.length} ${sending.length === 1 ? "response" : "responses"}…`);
  useActivity(previewBusy, "Inspecting local folder…");
  const connectionChanged = !!project && (providerID !== project.model.providerID || model !== project.model.modelID || connectionID !== (project.model.connectionID ?? ""));
  const activeConnection = project ? `${project.model.connectionID ? "Direct ChatGPT plan" : `OpenCode · ${project.model.providerID}`} · ${project.model.modelID}` : "";
  const lastScan = data?.jobs.filter((job) => job.kind === "scan").at(-1);
  const needsInitialization = !!project && !project.scans.length && (!!project.origin || !!lastScan);
  const busyReason = pending ? "A workspace request is being saved. Wait for it to finish." : data?.implementationActive ? executionBlockReason : data?.active ? discoveryBlockReason : "";
  const discoveryReason = busyReason || (connectionChanged ? "Save or revert your AI connection selection in Settings first." : needsInitialization ? "Complete the folder scan before exploring gaps." : "");
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
    const items = await api<Item[]>("projects"); setProjects(items); setProjectsLoaded(true);
    if (!items.some((item) => item.id === selected.current)) setID(items[0]?.id ?? null);
  }
  async function load(projectID = selected.current, signal?: AbortSignal, background = false) {
    if (!projectID) return;
    const ticket = refresh.current.begin(projectID);
    const response = await fetch(`/api/projects/${projectID}`, { signal, headers: { "X-Reqwizit-Token": token, "X-Reqwizit-Snapshot": JSON.stringify(ticket.baseline?.tokens ?? {}) } });
    const sections = await response.json();
    if (!response.ok) throw new Error(sections.error ?? "Request failed.");
    const tokens: SnapshotTokens | null = response.headers.has("X-Reqwizit-Snapshot") ? JSON.parse(response.headers.get("X-Reqwizit-Snapshot")!) : null;
    // A full-response fallback keeps older servers and development overlays compatible.
    const snapshot = refresh.current.complete(ticket, sections, tokens, selected.current, signal?.aborted);
    if (!snapshot) return;
    const update = () => {
      if (selected.current === projectID) setData(snapshot);
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
  useEffect(() => {
    if (!showSettings || !maintenanceSettingsRequested) return;
    const section = document.getElementById("automatic-maintenance-settings");
    section?.scrollIntoView({ block: "start" }); section?.focus(); setMaintenanceSettingsRequested(false);
  }, [showSettings, maintenanceSettingsRequested]);
  useEffect(() => { localStorage.setItem("reqwizit-auto", String(auto)); }, [auto]);
  useEffect(() => { localStorage.setItem("reqwizit-research", String(research)); }, [research]);
  useEffect(() => {
    setData(null); setItemErrors({}); setEpicID("all"); setTab("discover"); setQuestionFilter("open"); setExpandedQuestion(null); setSavedMessage(null); setError("");
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
  useEffect(() => { if (project) { setProviderID(project.model.providerID); setModel(project.model.modelID); setConnectionID(project.model.connectionID ?? ""); setSelectionProjectID(project.id); } }, [project?.id, project?.model.providerID, project?.model.modelID, project?.model.connectionID]);
  useEffect(() => {
    if (project && epicID !== "all" && !project.epics.some((item) => item.id === epicID && !item.archived)) setEpicID("all");
  }, [project?.revision, epicID]);

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
  async function explore(target?: number) {
    if (connectionChanged && !creating) throw new Error("Save your connection and model selection in Settings before exploring.");
    if (project) await api(`projects/${project.id}/analyze`, { revision: project.revision, ...(target === undefined ? {} : { questionTarget: target }), research: project.model.connectionID ? false : research, savedEvidencePolicy: evidencePilot ? "prefix-aux-v1" : "prefix", ...(epicID !== "all" ? { focusEpicID: epicID } : {}) });
  }
  async function reviewEpic() {
    if (connectionChanged && !creating) throw new Error("Save your connection and model selection in Settings before reviewing.");
    if (project) await api(`projects/${project.id}/analyze`, { revision: project.revision, gapMode: "epic", questionTarget,
      research: project.model.connectionID ? false : research, ...(epicID !== "all" ? { focusEpicID: epicID } : {}) });
  }
  async function resumeDiscovery() {
    if (connectionChanged && !creating) throw new Error("Save your connection and model selection in Settings before resuming.");
    if (project) await api(`projects/${project.id}/resume-discovery`, { revision: project.revision, questionTarget,
      research: project.model.connectionID ? false : research, ...(epicID !== "all" ? { focusEpicID: epicID } : {}) });
  }
  async function continueExploration() {
    if (project && lastJob) await api(`projects/${project.id}/continue-exploration`, { revision: project.revision, jobID: lastJob.id });
  }
  async function dismissQuestions(questionIDs: string[], regenerate = false) {
    await mutate("retire-questions", { questionIDs, reason: regenerate ? "Replace generic unanswered questions with gaps grounded in the existing project evidence." : "Dismissed by the user as unrelated to this project.", regenerate, research: project?.model.connectionID ? false : research });
  }
  async function submit(input: Submission["input"], key: string, replaces?: string): Promise<boolean> {
    if (!project || inFlight.current.has(key)) return false;
    if ((input.type === "review" || input.type === "answer") && input.reviewedRevision === undefined) input = { ...input, reviewedRevision: project.revision };
    const projectID = project.id;
    const useResearch = project.model.connectionID ? false : research;
    const processAutomatically = data?.workflow?.enabled ? true : auto;
    const payload = JSON.stringify({ projectID, input, auto: processAutomatically, research: useResearch, replaces });
    const submissionID = requests.current.get(payload) ?? crypto.randomUUID();
    requests.current.set(payload, submissionID);
    inFlight.current.add(key); setSending([...inFlight.current]); setError("");
    setItemErrors((errors) => ({ ...errors, [key]: "" }));
    try {
      const saved = await api<Submission>(`projects/${projectID}/submit`, { id: submissionID, input, auto: processAutomatically, research: useResearch, ...(replaces ? { replaces } : {}) });
      requests.current.delete(payload);
      await load(projectID); await list(); return saved.status !== "needs-attention";
    } catch (error) { setItemErrors((errors) => ({ ...errors, [key]: error instanceof Error ? error.message : "Could not submit response. Your draft is retained." })); return false; }
    finally { inFlight.current.delete(key); setSending([...inFlight.current]); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (initializeFolder && (!workspacePath.trim() || !folderPreview || previewBusy)) { setError("Inspect an existing local folder before creating the project."); return; }
    await act(async () => {
      const created = await api<Project & { workspaceError?: string }>("projects", { name, idea: idea.trim() ? idea : "Reconstruct the existing project from its connected source folder; review inferred definitions before discovering missing requirements.", entryMode: initializeFolder ? "existing" : "idea", ...(initializeFolder ? { previewFingerprint: folderPreview!.fingerprint } : {}), model: { providerID, modelID: model, ...(connectionID ? { connectionID } : {}) }, ...(workspacePath.trim() ? { workspace: { path: workspacePath, create: initializeFolder ? false : createDirectory } } : {}) });
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
  async function openProject(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const opened = await api<Project>("projects/open", { path: workspacePath, model: { providerID, modelID: model, ...(connectionID ? { connectionID } : {}) } });
      setID(opened.id); selected.current = opened.id; setCreating(false); setOpening(false); setWorkspacePath(""); setTab("requirements");
      await list();
    }, "Opening saved Reqwizit project…");
  }
  const epics = project?.epics.filter((item) => !item.archived) ?? [];
  const selectedEpic = epics.find((item) => item.id === epicID);
  const queuedQuestionIDs = useMemo(() => new Set(data?.submissions.flatMap((item) => item.input.type === "answer" && ["queued", "processing"].includes(item.status) ? [item.input.questionID] : []) ?? []), [data?.submissions]);
  const protectedQuestionIDs = useMemo(() => new Set(data?.submissions.flatMap((item) => item.input.type === "answer" && ["queued", "processing", "saved", "needs-attention"].includes(item.status) ? [item.input.questionID] : []) ?? []), [data?.submissions]);
  const pendingReviewCount = useMemo(() => project && data ? reviewItems(project, data.submissions, "pending").length + definitionDecisions(project, data.jobs).length : 0, [project, data?.submissions, data?.jobs]);
  const questions = project?.questions.filter((item) => item.status !== "retired" && !queuedQuestionIDs.has(item.id) && (epicID === "all" || item.epicID === epicID)) ?? [];
  const openQuestions = questions.filter((item) => ["pending", "deferred", "delegated"].includes(item.status));
  const scopedQuestions = project?.questions.filter((item) => item.status !== "retired" && (epicID === "all" || item.epicID === epicID)) ?? [];
  const visibleQuestions = scopedQuestions.filter((item) => questionFilter === "submitted" ? queuedQuestionIDs.has(item.id) : !queuedQuestionIDs.has(item.id) && (questionFilter === "open" ? item.status === "pending" : questionFilter === "answered" ? item.status === "answered" : ["deferred", "delegated"].includes(item.status)));
  const questionPaging = usePagination(visibleQuestions.map((q) => q.id), `${project?.id}:${epicID}:${questionFilter}`, expandedQuestion);
  const pagedQuestions = visibleQuestions.slice(questionPaging.start, questionPaging.end);
  // Keep a ready-to-answer card open as submissions leave the list, including
  // changes arriving through polling. Explicit navigation can still open another.
  const activeQuestionID = pagedQuestions.some((question) => question.id === expandedQuestion)
    ? expandedQuestion : questionFilter === "open" ? pagedQuestions[0]?.id ?? null : null;
  useEffect(() => {
    if (!project || definitionClarification?.projectID === project.id) return;
    const saved = [...(data?.jobs ?? [])].reverse().find((job) => job.readinessProgress && job.status !== "completed" && job.context?.readinessQuestions);
    if (saved?.context?.readinessQuestions) setDefinitionClarification({ projectID: project.id, task: saved.context.readinessQuestions, reused: false });
  }, [project?.id, data?.jobs, definitionClarification?.projectID]);
  const clarificationJob = definitionClarification?.projectID === project?.id ? [...(data?.jobs ?? [])].reverse()
    .find((job) => JSON.stringify(job.context?.readinessQuestions) === JSON.stringify(definitionClarification?.task)) : undefined;
  const clarificationResult = clarificationJob?.result ?? definitionClarification?.result;
  const clarificationFinished = clarificationJob?.status === "completed" || definitionClarification?.reused;
  useEffect(() => {
    if (!project || definitionClarification?.projectID !== project.id || !clarificationFinished) return;
    const token = JSON.stringify(definitionClarification.task);
    if (openedClarification.current === token) return;
    const question = project.questions.find((q) => q.epicID === definitionClarification.task.epicID && q.status === "pending"
      && clarificationResult?.questions.some((newQuestion) => newQuestion.text === q.text));
    if (question) { setExpandedQuestion(question.id); openedClarification.current = token; }
  }, [project, definitionClarification, clarificationFinished, clarificationResult]);
  const latestSubmission = (questionID: string) => [...(data?.submissions ?? [])].reverse().find((item) => item.input.type === "answer" && item.input.questionID === questionID && ["queued", "processing"].includes(item.status));
  const requirements = project?.requirements.filter((item) => epicID === "all" || item.epicID === epicID) ?? [];
  const implementationRemaining = useMemo(() => {
    if (!project || !evaluation || !executionIndex) return 0;
    return [...executionIndex.requirements.values()].filter((r) => !deliveredRequirement(project, evaluation, r.id, executionIndex)).length;
  }, [project, evaluation, executionIndex]);
  const lastJob = data?.jobs.at(-1);
  const responseStatus = (questionID: string) => [...(data?.submissions ?? [])].reverse().find((item) => item.input.type === "answer" && item.input.questionID === questionID && ["queued", "processing"].includes(item.status))?.status;
  const inspectRepository = useCallback(() => api<WorkspaceRepository>(`projects/${project?.id}/execution-repository`), [project?.id]);
  const implementationAction = useCallback((name: string, body: Record<string, unknown>) => act(async () => {
    if (project) await api(`projects/${project.id}/${name}`, { ...(name === "execution-start" || name === "execution-config" ? { revision: project.revision } : {}), ...body });
  }), [project?.id, project?.revision]);
  const saveAnswer = async (question: Project["questions"][number], kind: "answer" | "delegation" | "deferral", text: string) => {
    const previous = latestSubmission(question.id);
    if (await submit({ type: "answer", questionID: question.id, questionText: question.text, sourceID: question.sourceID ?? null, answer: { kind, text } }, question.id, previous?.status === "queued" ? previous.id : undefined)) {
      if (drafts.current.get(question.id)?.text === text) drafts.current.delete(question.id);
      setExpandedQuestion(null); setSavedMessage({ id: question.id, text: previous || question.sourceID ? "Correction saved. Related requirements may need review when it is applied." : "Answer saved." });
    }
  };

  const processBlocking = (ids: string[]) => void act(async () => {
    if (!project || !data) return;
    if (connectionChanged) throw new Error("Save your connection and model selection in Settings before processing.");
    await api(`projects/${project.id}/analyze`, { revision: project.revision, research: project.model.connectionID ? false : research, ...reviewProcessingScope(project, data.submissions, ids) });
  });
  const renderClarification = (question: Project["questions"][number]) => {
    if (!project || !data) return null;
    const submission = [...data.submissions].reverse().find((s) => s.input.type === "answer" && s.input.questionID === question.id && !s.conflict && ["queued", "saved", "processing", "needs-attention"].includes(s.status)
      && (s.applied ? question.sourceID === s.appliedSourceID : s.input.questionText === question.text && (s.input.sourceID ?? null) === (question.sourceID ?? null)));
    if (submission) return <section className="save-notice" key={question.id} aria-label={`Updating clarification: ${question.text}`}><h5>{question.text}</h5><p>Answer saved. Process its follow-up, then review the updated requirement here. Your review note is retained.</p><ItemProcessingNotice submission={submission} error={itemErrors[question.id]} resume={() => processBlocking([submission.id])} disabled={busy || connectionChanged} /><ActionButton className="secondary" disabled={busy || connectionChanged} onClick={() => processBlocking([submission.id])}>Process blocking input</ActionButton></section>;
    const source = project.sources.find((s) => s.id === question.sourceID);
    return <QuestionCard key={`${project.id}:review:${question.id}:${question.sourceID ?? "new"}`} inline question={question} area={areaTitle(epics.find((e) => e.id === question.epicID))} expanded={true} onToggle={() => {}} onCancel={() => { drafts.current.delete(question.id); }} help={help} draft={drafts.current.get(question.id)} onDraft={(draft) => drafts.current.set(question.id, draft)} initialText={source?.text} initialKind="answer" number={0} disabled={sending.includes(question.id)} dismissDisabled={true} onSave={(kind, text) => saveAnswer(question, kind, text)} notice={<ItemProcessingNotice error={itemErrors[question.id]} />} />;
  };
  async function clarifyDefinition(epicID: string) {
    if (!project) return;
    setPending(true);
    try {
      const result = await api<{ task: ReadinessQuestionTask; reused: boolean; result?: Job["result"] }>(`projects/${project.id}/clarify-definition`, {
        revision: project.revision, epicID, confirmAIUsage: true,
      });
      setDefinitionClarification({ projectID: project.id, ...result });
      setIssue(undefined); setEpicID(epicID); setQuestionFilter("open"); setExpandedQuestion(null); setTab("discover");
      await load();
    } finally { setPending(false); }
  }
  const renderReview = (focusRequirementID?: string) => {
    if (!project || !data) return null;
    return <ReviewQueue key={`${project.id}:${focusRequirementID ?? "list"}`} draftStore={focusRequirementID ? issueDrafts : undefined} focusRequirementID={focusRequirementID} openIssue={openIssue} visible={!!focusRequirementID || tab === "review"} project={project} submissions={data.submissions} jobs={data.jobs} epicID={focusRequirementID ? "all" : epicID} sending={sending} submit={submit} itemErrors={itemErrors} resume={() => focusRequirementID ? processBlocking(data.submissions.filter((s) => s.input.type === "review" && s.input.requirementID === focusRequirementID && s.status === "needs-attention" && !s.conflict).map((s) => s.id)) : void act(explore)}
      processBlocking={processBlocking} renderClarification={focusRequirementID || tab === "review" ? renderClarification : undefined}
      clarifyDefinition={clarifyDefinition}
      openQuestion={(questionID) => { const q = project.questions.find((q) => q.id === questionID); if (!q) return; setIssue(undefined); setEpicID(q.epicID); setTab("discover"); setQuestionFilter(queuedQuestionIDs.has(questionID) ? "submitted" : q.status === "answered" ? "answered" : q.status === "pending" ? "open" : "later"); setExpandedQuestion(questionID); }}
      disabled={busy || connectionChanged || needsInitialization} disabledReason={discoveryReason}
      refine={() => void act(async () => { await api(`projects/${project.id}/analyze`, { revision: project.revision, refinementOnly: true, research: false, ...(epicID !== "all" ? { focusEpicID: epicID } : {}) }); })}
      reviewRefinement={async (proposalID, accept) => {
        const key = `refinement:${proposalID}`;
        setItemErrors((errors) => ({ ...errors, [key]: "" })); setPending(true);
        try { await mutate("refinement-review", { proposalID, accept }); await load(); return true; }
        catch (error) { setItemErrors((errors) => ({ ...errors, [key]: error instanceof Error ? error.message : "Could not save refinement decision." })); return false; }
        finally { setPending(false); }
      }}
      refreshRefinement={(proposalID) => void act(async () => { await api(`projects/${project.id}/refresh-refinement`, { revision: project.revision, proposalID }); })}
      removeDuplicate={async (revision, removeID, keepID, note) => {
        let saved = false;
        await act(async () => { await api(`projects/${project.id}/remove-duplicate`, { revision, removeID, keepID, note }); saved = true; });
        return saved;
      }} />;
  };
  const issueSubmission = issue && issue.projectID === project?.id ? data?.submissions.find((s) => s.id === issue.submissionID) : undefined;
  const issueRequirementID = issue?.requirementID ?? (issueSubmission?.input.type === "review" ? issueSubmission.input.requirementID : undefined);
  const issueQuestion = issueSubmission?.input.type === "answer" ? project?.questions.find((q) => issueSubmission.input.type === "answer" && q.id === issueSubmission.input.questionID) : undefined;
  const issueHistory = data?.submissions.filter((s) => issueRequirementID ? s.input.type === "review" && s.input.requirementID === issueRequirementID : issueQuestion ? s.input.type === "answer" && s.input.questionID === issueQuestion.id : s.id === issueSubmission?.id) ?? [];
  const resolvedAttempts = useMemo(() => project && data ? resolvedReviewAttempts(project, data.submissions) : new Map(), [project, data?.submissions]);

  return <LogProject.Provider value={creating ? undefined : project?.id}><ActionScope reason={discoveryReason || "Wait for the current save to finish."}><div className="app">
    <DesktopTitleBar />
    <Logs request={api} project={creating ? undefined : project} jobs={creating ? [] : [...(data?.jobs ?? []), ...(data?.helpJobs ?? [])]} submissions={creating ? [] : data?.submissions} execution={creating ? undefined : data?.execution} progress={data?.progress} workflowMessage={data?.workflow?.message} workspaceDiagnostic={data?.workspace?.diagnostic ?? undefined} exportDiagnostics={project && !creating ? (jobIDs) => api(`projects/${project.id}/discovery-diagnostics`, { jobIDs }) : undefined} />
    {issue && issue.projectID === project?.id && data && <IssueDialog key={project.id} close={() => setIssue(undefined)}>
      <p>Current saved information · Actions use the same checks as Review. Closing returns you to your previous view.</p>
      {error && <DiagnosticNotice detail={error} alert />}
      {issueHistory.some((s) => resolvedAttempts.has(s.id)) && <p role="status">A later decision was saved. Earlier failed attempts are history only; all original notes are preserved, not applied. Current wording may still need review.</p>}
      {issueRequirementID && <AttemptCleanup key={issueRequirementID} submissions={issueHistory.filter((s) => !resolvedAttempts.has(s.id))} disabled={pending} dismiss={async (submissionIDs) => {
        const items = await api<Submission[]>(`projects/${project.id}/dismiss-review-attempts`, { revision: project.revision, requirementID: issueRequirementID, submissionIDs });
        await load().catch((error: Error) => setError(error.message)); return items;
      }} undo={async (attempts) => {
        await api(`projects/${project.id}/restore-review-attempts`, { revision: project.revision, requirementID: issueRequirementID, attempts });
        await load().catch((error: Error) => setError(error.message));
      }} />}
      {issueRequirementID ? renderReview(issueRequirementID) : issueQuestion ? renderClarification(issueQuestion) : issueSubmission ? <><p>{attentionSummary(project, data.submissions, issueSubmission, data.jobs)}</p><p className="source-excerpt">{issueSubmission.input.type === "note" ? issueSubmission.input.text : "The original item is no longer available. Its response is retained below."}</p>{["needs-attention", "saved", "queued"].includes(issueSubmission.status) && !issueSubmission.conflict && <ActionButton className="secondary" disabled={busy || connectionChanged} onClick={() => processBlocking([issueSubmission.id])}>Retry follow-up</ActionButton>}</> : <p role="status">This saved response is no longer available.</p>}
      <LazyDetails summary={<>Saved attempts &amp; notes · {issueHistory.length}</>}>{() => <PagedList items={issueHistory.slice().reverse()} itemID={(s) => s.id} label="Saved attempts">{(s) => <article className="queue-item" key={s.id}>
        <small>{new Date(s.submittedAt).toLocaleString()} · {s.archivedAt ? "Archived · history only" : resolvedAttempts.has(s.id) ? "Resolved · history only" : s.status}</small>
        {s.input.type === "review" && <p><strong>Wording at this attempt:</strong> {s.input.requirementText}</p>}
        <p className="source-excerpt">{s.input.type === "review" ? `${s.input.action}${s.applied ? " · applied" : " · not applied"}: ${s.input.note || "No addendum"}` : s.input.type === "answer" ? s.input.answer.text : s.input.text}</p>
        {s.diagnostic && <LogLink target={s.id} />}
        {s.input.type === "review" && !resolvedAttempts.has(s.id) && !s.applied && s.conflict && s.status === "needs-attention" && s.overlapFollowup?.state !== "pending" && <details><summary>Archive attempt…</summary><p>This only moves this unapplied attempt to history. Its note is preserved. It does not resolve questions, apply a decision or retry follow-up.</p><ActionButton className="secondary" disabled={pending} onClick={() => void act(async () => { await api(`projects/${project.id}/archive-review-attempt`, { revision: project.revision, submissionID: s.id }); })}>Confirm archive attempt</ActionButton></details>}
      </article>}</PagedList>}</LazyDetails>
    </IssueDialog>}
    <main>
      <header className="topbar"><div className="app-header-leading"><AppMenu projects={projects} activeID={id}
        newProject={() => { setOpening(false); setCreating(true); navigate("workspace"); }}
        openProject={() => { setOpening(true); setCreating(true); setInitializeFolder(false); setCreateDirectory(false); navigate("workspace"); }}
        selectProject={(projectID) => { setID(projectID); setCreating(false); navigate("workspace"); }}
        settings={() => navigate("settings")} logs={() => openLogs()} reportError={setError} />
        <div className="app-header-title"><div className="app-header-title-row"><h1 ref={pageHeading} tabIndex={-1}>{showSettings ? "Settings" : creating ? opening ? "Open Reqwizit project" : "New project" : project?.name ?? "Your next idea starts here."}</h1><HeaderActivity /></div><small>{showSettings ? project && !creating ? `Settings for ${project.name} · Active connection: ${activeConnection}` : "AI connections and workspace preferences" : project && !creating ? `Active connection: ${activeConnection}` : "Local workspace"}</small></div></div>
        {!creating && project && data && <ProcessingQueue key={project.id} project={project} jobs={data.jobs} workflow={data.workflow} configureWorkflow={configureWorkflow} openWorkflowDecision={openWorkflowDecision} maintenance={data.maintenance} configureMaintenance={configureMaintenance} maintenanceSettings={openMaintenanceSettings} openRequest={queueRequest?.projectID === project.id ? queueRequest.value : undefined} openIssue={openIssue} active={data.active} progress={data.progress} refinementProgress={data.refinementProgress} submissions={data.submissions} paused={data.queuePaused} lastJob={lastJob} activities={queueActivities(project, data.execution, data.implementationActive, data.helpJobs, data.implementationOperation)} stopActivity={(target) => void act(async () => { await api(`projects/${project.id}/${target.action}`, target.body); }, "Stopping background task…")} scope={selectedEpic ? areaTitle(selectedEpic) : "All project areas"} disabled={busy || connectionChanged || needsInitialization} stopDisabled={pending} error={error} resume={() => void act(resumeDiscovery, "Resuming processing…")} discover={() => void act(reviewEpic, "Preparing workflow evidence…")} continuationAvailable={!!lastJob?.gapContinuationAvailable} continueExploration={() => void act(continueExploration, "Continuing saved gap exploration…")} stop={() => void act(async () => { await api(`projects/${project.id}/cancel`, {}); }, "Stopping discovery…")} />}
        {!showSettings && project && summary && data && !creating && <ProjectProgress key={`progress:${project.id}`} progress={mapProgress!} definition={summary} project={project} jobs={data.jobs} disabled={busy || connectionChanged || needsInitialization} disabledReason={discoveryReason || (connectionChanged ? "Save your connection and model selection first." : undefined)} refreshDefinition={(focusEpicID, additionalRequests) => void act(async () => { await api(`projects/${project.id}/refresh-definition`, { revision: project.revision, ...(focusEpicID ? { focusEpicID } : {}), ...(additionalRequests?.length ? { additionalRequests, confirmAdditionalRequests: true } : {}) }); }, "Refreshing definition coverage…")} />}
        {!showSettings && project && summary && data && !creating && <div className="tabs main-tabs" role="tablist" aria-label="Workspace">{([ ["discover", "Design"], ["review", "Specification"], ["implementation", "Implement"], ["history", "Activity"] ] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key || key === "history" && tab === "research"} className={tab === key || key === "history" && tab === "research" ? "active" : ""} onClick={() => setTab(key)}>{label}{key === "discover" && <span>{openQuestions.length}</span>}{key === "review" && <span title="Requirements needing a decision">{pendingReviewCount}</span>}{key === "implementation" && <span>{implementationRemaining}</span>}</button>)}</div>}
      </header>
      <div className="tab-content">
      <div className="workspace-content">
      {pending && <ActivityFeedback label={actionLabel} />}
      {showSettings && <nav className="page-navigation" aria-label="Page navigation"><button className="quiet" onClick={backToWorkspace}>← Back to workspace</button></nav>}
      {error && <div className="error"><DiagnosticNotice detail={error} next="Check the current screen before trying again. More information is available in Technical details." alert /><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {showSettings && <section id="workspace-settings" className="settings-panel" aria-label="Settings">
        <AppearanceSettings />
        {projectsLoaded && (!id || project?.id === id && selectionProjectID === id) ? <AIConnections request={api} disabled={pending} accountID={connectionID} providerID={providerID} modelID={model} onSelect={(account, selectedModel, provider) => { setConnectionID(account); setProviderID(provider); setModel(selectedModel); }}>
          {project && !creating && <div className="connection-notice"><p><strong>Active connection:</strong> {activeConnection}</p><p>{connectionChanged ? "Your selection is not saved. Choose a model and save it to switch this project's connection." : "This saved connection will be used by Discover missing decisions and question help."}</p><button title={busyReason || (!model ? "Choose a model first." : !connectionChanged ? "This connection and model are already saved." : undefined)} disabled={busy || !providerID || !model || !connectionChanged} className="primary" onClick={() => void act(() => mutate("model", { model: { providerID, modelID: model, ...(connectionID ? { connectionID } : {}) } }))}>Save model</button></div>}
        </AIConnections> : <ActivityFeedback label="Loading saved AI selection…" />}
        {project && !creating ? <><h2>Project settings</h2>
          {data?.workflow && <WorkflowControls workflow={data.workflow} disabled={busy || connectionChanged || needsInitialization} pending={pending} configure={configureWorkflow} settings />}
          {data?.workflow?.enabled ? <p>Saved input and definition checks are managed by the coordinated workflow allowance. Advanced-mode preferences are retained, not overwritten.</p> : <>
            <label><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} /> Automatically process saved inputs</label><p>Each saved response receives its own focused follow-up using your model allowance. This does not request unrelated gap discovery. Automatic definition updates are separately opt-in below.</p>
            {data?.maintenance && <MaintenanceSettings maintenance={data.maintenance} disabled={busy || connectionChanged || needsInitialization} pending={pending} configure={configureMaintenance} openQueue={openProcessingQueue} />}</>}
          </> : <p>Your selected connection and model will be used when you create a project.</p>}
        <label><input type="checkbox" checked={!connectionID && !(project?.model.connectionID && !creating) && research} disabled={!!connectionID || !!project?.model.connectionID && !creating} onChange={(event) => setResearch(event.target.checked)} /> Allow targeted research in future rounds</label>{(connectionID || project?.model.connectionID && !creating) && <p>Direct ChatGPT discovery runs without web research.</p>}
        {project && !creating && !!(project.requirements.length || project.questions.length) && <section aria-label="Saved-evidence retrieval pilot"><details><summary>Experimental tools</summary><h2>Experimental saved-evidence search</h2>
          <label><input type="checkbox" checked={evidencePilot} disabled={busy} onChange={(event) => setEvidencePilot(event.target.checked)} /> Use auxiliary merge for legacy individual-check exploration</label>
          <p>Default off. Applies to legacy individual-check exploration resumed here, not the workflow-based Discover missing decisions button, queued answers, scans, Refine or terminal commands. Resets on reload or project change. Existing prefix hits keep priority; auxiliary fields fill only free slots. Model requests, scan and context budgets do not increase.</p>
          <p>Switching off affects new searches, not committed receipts: compatible retries reuse original results and cumulative attempts. Relevance quality is not independently qualified; exact loading is still required.</p>
        </details></section>}
        {project && !creating && <WorkspaceConnection project={project} scanJob={lastScan} workspace={data?.workspace ?? null} request={api} disabled={busy} run={act} />}
      </section>}
      <div hidden={showSettings}>
      {project && !creating && connectionChanged && <div className="connection-notice" role="status">Connection changes are not saved. This project still uses {activeConnection}. <button className="secondary" onClick={() => navigate("settings")}>Review connection settings</button></div>}
      {(creating || projectsLoaded && !id && !project && !projects.length) ? <section className="welcome">
        <div className="welcome-art">✦</div><span className="eyebrow">LET’S MAKE IT CONCRETE</span><h2>Big ideas begin<br />with a little clarity.</h2><p>Tell us what you have in mind. Your AI partner will organize the possibilities, ask useful questions, and help fill in the gaps.</p>
        {opening && <form onSubmit={(event) => void openProject(event)} aria-label="Open Reqwizit project">
          <h2>Continue saved project work</h2><p>Choose a project folder containing .reqwizit. Your saved decisions, checks and unfinished review progress are restored without asking the AI again. Automatic work starts paused.</p>
          <WorkspacePicker path={workspacePath} create={false} existingOnly onChange={(path) => setWorkspacePath(path)} request={api} disabled={pending} />
          <p>Review shared project information before publishing it. Opening a project does not run its saved checking commands; review Implementation settings first. Active coding work does not transfer between computers.</p>
          <p>Local discovery connection: {connectionID ? "Direct ChatGPT plan" : "OpenCode"} · {model || "Choose a model"}. <button type="button" className="quiet" onClick={() => navigate("settings")}>Choose AI connection</button> Saved assessment models remain attached to their findings.</p>
          <button className="primary" disabled={pending || !workspacePath.trim() || !model}>Open saved project</button>
        </form>}
        <form hidden={opening} onSubmit={(event) => void create(event)}>
          <fieldset className="project-start"><legend>Start from</legend><label><input type="radio" name="project-start" checked={!initializeFolder} disabled={pending} onChange={() => setInitializeFolder(false)} /> New idea</label><label><input type="radio" name="project-start" checked={initializeFolder} disabled={pending} onChange={() => { setInitializeFolder(true); setCreateDirectory(false); }} /> Existing project</label></fieldset>
          {initializeFolder && <><WorkspacePicker path={workspacePath} create={false} existingOnly onChange={(path) => setWorkspacePath(path)} request={api} disabled={pending} /><div className="folder-preview" aria-live="polite">{previewBusy ? "Inspecting local metadata and documentation…" : folderPreview ? <><strong>Detected: {folderPreview.projectType}</strong><p>Name and description are editable suggestions. No AI connection was used for this preview.</p><small>{folderPreview.evidence.length ? folderPreview.evidence.map((item) => `${item.field}: ${item.path}`).join(" · ") : "Name suggested from the folder name; no descriptive metadata found."}</small>{!folderPreview.description && <p>No suitable description found. You can enter one or let initialization reconstruct it.</p>}</> : "Choose an existing folder to suggest the project name and description."}{previewError && <p role="alert">{previewError}</p>}</div></>}
          <label>Project name<input required maxLength={150} value={name} onChange={(event) => { editedIdentity.current.name = true; setName(event.target.value); }} placeholder="Something worth building" /></label>
          <label>{initializeFolder ? "Project description (suggested from files)" : "Your idea"}<textarea required={!initializeFolder} maxLength={12000} value={idea} onChange={(event) => { editedIdentity.current.description = true; setIdea(event.target.value); }} placeholder={initializeFolder ? "Describe this existing project, or leave blank for initialization…" : "I want to build an app that…"} rows={5} /></label>
          {!initializeFolder && <WorkspacePicker path={workspacePath} create={createDirectory} onChange={(path, make) => { setWorkspacePath(path); setCreateDirectory(make); }} request={api} disabled={pending} />}
          {initializeFolder && <p>Selected project files will be sent to your AI in smaller groups. Review its suggested features and requirements before continuing. {workspacePath.trim() ? "" : "Choose the project folder to get started."}</p>}
          <div className="connection-summary">{connectionID ? "Direct ChatGPT plan" : "OpenCode connection"} · {model || "Choose a model in Settings"} <button type="button" className="quiet" onClick={() => navigate("settings")}>Choose AI connection</button></div>
          <label className="research-toggle"><input type="checkbox" checked={!connectionID && research} disabled={!!connectionID} onChange={(event) => setResearch(event.target.checked)} /> Allow targeted web research</label>
          <button className="primary" title={pending ? "Creating your project. Wait for this request to finish." : !model ? "Choose an AI model in Settings first." : initializeFolder && (!workspacePath.trim() || previewBusy || !folderPreview) ? "Select an existing folder and wait for its preview to finish." : undefined} disabled={pending || !model || initializeFolder && (!workspacePath.trim() || previewBusy || !folderPreview)}>{pending && <Spinner />}{pending ? "Creating…" : initializeFolder ? "Create & initialize existing project →" : "Create & explore →"}</button>
        </form>
      </section> : !project || !summary ? <div className="empty">Loading your workspace…</div> : <>
        <div className="workspace-status" role="status"><span>{data.workspace ? `${data.workspace.status === "saved" ? "Saved" : data.workspace.status === "pending" ? "Saving" : data.workspace.status === "conflict" ? "Different saved changes need review" : "Folder unavailable"} · ${data.workspace.path}` : "No local folder connected"}</span><button className="quiet" onClick={() => navigate("settings")}>{data.workspace ? "Workspace settings" : "Connect workspace"}</button>{data.workspace?.diagnostic && <span>Open Workspace settings to review the folder issue.</span>}</div>
        <section className="workspace">
          <div className="discovery-column">
            <div className="work-heading"><div><h2>{tab === "discover" ? "One decision at a time" : tab === "review" ? "Your specification, kept current" : tab === "implementation" ? "Build one requirement at a time" : "Project activity"}</h2><label className="area-filter">Feature<select aria-label="Filter by feature" value={epicID} onChange={(event) => setEpicID(event.target.value)}><option value="all">All project areas</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>{areaTitle(epic)}</option>)}</select></label></div>{tab === "discover" && <div className="gap-controls" aria-label="Gap discovery">
              <button className="primary" title={discoveryReason || `Find missing decisions and ask follow-up questions. Scope: ${selectedEpic ? areaTitle(selectedEpic) : "All project areas"}. Staged packages continue automatically, up to 32 requests per package within the 15-minute action. Stop saves progress.`} disabled={busy || connectionChanged || needsInitialization} onClick={() => void act(reviewEpic, "Preparing workflow evidence…")}>{data.active && <Spinner />}{data.active ? "Discovering…" : "Discover missing decisions"}</button>
              <label title="Project-wide unanswered question target, not additional questions. Stops when reached or eligible work runs out; the final package may exceed it. At most 10 packages or 15 minutes per run. Stop preserves completed results.">Questions ready <input aria-label="Questions ready" type="number" min={1} max={50} value={questionTarget} disabled={busy} onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= 50) { setQuestionTarget(value); localStorage.setItem(`reqwizit-question-target:${project.id}`, String(value)); }
              }} /></label>
              <small className="discovery-hint">Find missing decisions and ask follow-up questions for {selectedEpic ? areaTitle(selectedEpic) : "all project areas"}.</small>
            </div>}</div>
            {lastJob && tab === "discover" && <GapContinuation key={lastJob.id} job={lastJob} available={!!lastJob.gapContinuationAvailable} disabled={busy || connectionChanged || needsInitialization}
              continueExploration={() => void act(continueExploration, "Continuing saved gap exploration…")} />}
            {needsInitialization && tab !== "implementation" && <p role="status">Initialization must complete before gap discovery. Retry the folder scan below.</p>}
            {tab !== "implementation" && data.workspace && !project.scans.length && <WorkspaceScan project={project} scanJob={lastScan} disabled={busy || connectionChanged} scan={(resumeJobID) => act(async () => { await api(`projects/${project.id}/scan`, { revision: project.revision, resumeJobID }); setTab("review"); })} />}
            {tab === "implementation" && <ImplementationTab key={project.id} project={project} state={data.execution} evaluation={evaluation!} executionIndex={executionIndex!} active={data.implementationActive} disabled={pending || data.active} discoveryActive={data.active} connected={!!data.workspace} workspaceID={data.workspace?.bindingID} epicID={epicID} inspectRepository={inspectRepository} action={implementationAction} />}
            {(tab === "history" || tab === "research") && <div className="filter-row"><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Changes & outcomes</button><button className={tab === "research" ? "active" : ""} onClick={() => setTab("research")}>Research sources</button></div>}
            {tab === "discover" && <>
              {definitionClarification?.projectID === project.id && (epicID === "all" || epicID === definitionClarification.task.epicID) && <section className="save-notice" role="status" aria-label="Definition clarification">
                {clarificationFinished ? clarificationResult?.questions.length ? <><strong>Focused questions are ready.</strong><p>Choose an answer option below or write your own answer, then save the response. Earlier decisions stay saved; asking a question does not resolve the assessment.</p></>
                  : <><strong>No new product question was established.</strong><p>{clarificationResult?.summary ?? "The findings did not establish a new choice for you. No answer or specification change is required by this result."}</p></>
                  : clarificationJob?.readinessProgress && !data.active && ["interrupted", "cancelled", "failed"].includes(clarificationJob.status) ? <><strong>Clarification paused.</strong><p>{clarificationJob.readinessProgress.completed} / {clarificationJob.readinessProgress.total} exact read/check steps saved. No partial questions were published. Continuing uses your AI allowance; completed requests and spent attempts are retained.</p><p>{clarificationJob.diagnostic}</p><ActionButton disabled={busy || connectionChanged} onClick={() => void act(() => clarifyDefinition(definitionClarification.task.epicID), "Continuing saved clarification…")}>Continue clarification</ActionButton></>
                  : (clarificationJob && ["failed", "cancelled", "interrupted", "stale"].includes(clarificationJob.status) || !pending && !data.active && !clarificationJob) ? <><strong>Clarification could not finish.</strong><p>Your earlier decisions are unchanged. See Processing &amp; queue and Logs before explicitly trying again.</p></>
                    : <><strong>Preparing focused questions…</strong><p>AI is checking whether this area's findings actually need a human decision. You do not need to type a correction from assessment prose.</p></>}
                {clarificationJob?.readinessProgress && data.active && <p>{clarificationJob.readinessProgress.phase === "read" ? "Reading exact evidence" : "Checking proposed questions"}: {clarificationJob.readinessProgress.completed} / {clarificationJob.readinessProgress.total} steps saved. No questions publish before all batches finish.</p>}
              </section>}
              <SpecificationChanges project={project} inspect={() => setTab("review")} />
              <QuestionCleanup project={project} disabled={busy || connectionChanged} queuedIDs={protectedQuestionIDs} replaceDisabled={!project.scans.length} retire={(ids, regenerate) => act(() => dismissQuestions(ids, regenerate))} />
              <div className="filter-row" aria-label="Question filters">{([ ["open", "To answer"], ["answered", "Previous answers"], ["later", "Deferred / delegated"], ["submitted", "Submitted"] ] as const).map(([key, label]) => <button key={key} aria-pressed={questionFilter === key} className={questionFilter === key ? "active" : ""} onClick={() => { setQuestionFilter(key); setExpandedQuestion(null); }}>{label} <span>{scopedQuestions.filter((q) => key === "submitted" ? queuedQuestionIDs.has(q.id) : !queuedQuestionIDs.has(q.id) && (key === "open" ? q.status === "pending" : key === "answered" ? q.status === "answered" : ["deferred", "delegated"].includes(q.status))).length}</span></button>)}</div>
              {savedMessage && <div className="save-notice" role="status">{savedMessage.text} <button className="quiet" onClick={() => { const q = project.questions.find((q) => q.id === savedMessage.id); setQuestionFilter(queuedQuestionIDs.has(savedMessage.id) ? "submitted" : q?.status === "answered" ? "answered" : "later"); setExpandedQuestion(savedMessage.id); }}>Edit answer</button><button className="quiet" aria-label="Dismiss saved message" onClick={() => setSavedMessage(null)}>×</button></div>}
              {visibleQuestions.length === 0 && <div className="empty-card"><h3>{questionFilter !== "open" ? "No responses in this view yet." : queuedQuestionIDs.size ? "Your responses are in the queue." : "Ready for the next questions?"}</h3><p>{questionFilter === "open" ? "Discover missing decisions or add more information. Questions will adapt as you answer; no open questions does not mean the specification is complete." : "Use the filters above to answer questions or revisit a saved response."}</p></div>}
              {project.questions.filter((question) => question.status === "retired" && drafts.current.get(question.id)?.text.trim()).map((question) => <article className="question-card" key={question.id}><h3>Draft retained: {question.text}</h3><p>This question was retired during discovery. Your draft is still here; you can save it as a project note.</p><p className="source-excerpt">{drafts.current.get(question.id)!.text}</p><button className="secondary" disabled={sending.includes(question.id)} onClick={() => void submit({ type: "note", text: drafts.current.get(question.id)!.text, epicID: "project" }, question.id).then((saved) => { if (saved) { drafts.current.delete(question.id); void load(); } })}>Save draft as note</button></article>)}
              <Pagination paging={questionPaging} label="Design" onNavigate={() => setExpandedQuestion(null)} />
              {pagedQuestions.some((q) => captureAnswerScope(project, q.id)) && <aside className="save-notice" aria-label="Targeted answer scope"><p>Some questions here explicitly link to requirements. Their queued follow-up is limited to those linked records; broader feature/shared constraints belong in Add information.</p><details><summary>Which answers are targeted?</summary>{pagedQuestions.filter((q) => captureAnswerScope(project, q.id)).map((q) => <p key={q.id}>{q.text} · {captureAnswerScope(project, q.id)!.requirementIDs.length} linked requirements</p>)}</details></aside>}
              {pagedQuestions.map((question, pageIndex) => {
                const index = questionPaging.start + pageIndex;
                const submission = latestSubmission(question.id);
                const response = submission?.input.type === "answer" ? submission.input.answer : undefined;
                const source = project.sources.find((item) => item.id === question.sourceID);
                return <QuestionCard key={`${project.id}:${question.id}:${submission?.id ?? question.sourceID ?? "new"}`} question={question} area={areaTitle(epics.find((epic) => epic.id === question.epicID))} purpose={epics.find((epic) => epic.id === question.epicID)?.purpose} expanded={activeQuestionID === question.id} onToggle={() => setExpandedQuestion(activeQuestionID === question.id ? null : question.id)} onCancel={() => { drafts.current.delete(question.id); setExpandedQuestion(null); }} help={help} draft={drafts.current.get(question.id)} onDraft={(draft) => drafts.current.set(question.id, draft)} initialText={response?.text ?? source?.text} initialKind={response?.kind ?? (source && ["answer", "delegation", "deferral"].includes(source.kind) ? source.kind as Draft["kind"] : undefined)} number={index + 1} disabled={sending.includes(question.id)} dismissDisabled={busy || connectionChanged} onDismiss={question.status === "pending" && !question.sourceID && !protectedQuestionIDs.has(question.id) ? () => act(() => dismissQuestions([question.id])) : undefined} status={sending.includes(question.id) ? "Saving…" : responseStatus(question.id)} onSave={(kind, text) => saveAnswer(question, kind, text)} notice={<><ItemProcessingNotice error={itemErrors[question.id]} submission={[...data.submissions].reverse().find((s) => s.input.type === "answer" && s.input.questionID === question.id)} resume={() => void act(explore)} disabled={busy || connectionChanged} /><ReviewUpdateNotice project={project} recordType="question" recordID={question.id} /></>} />;
              })}
               {questionPaging.pages > 1 && <Pagination paging={questionPaging} label="Design bottom" onNavigate={() => setExpandedQuestion(null)} />}
               <ItemProcessingNotice error={itemErrors.note} />
              <details className="add-information"><summary>Add information</summary><form className="note-card" onSubmit={(event) => { event.preventDefault(); const submitted = note; void submit({ type: "note", text: submitted, epicID: epicID === "all" ? "project" : epicID }, "note").then((saved) => { if (saved) setNote((current) => current === submitted ? "" : current); }); }}><label>Add an idea, correction, or constraint<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Something else the project should consider…" maxLength={12000} required /></label><button className="secondary" title={sending.includes("note") ? "Your note is being saved." : !note.trim() ? "Write an idea, correction or constraint first." : undefined} disabled={sending.includes("note") || !note.trim()}>{sending.includes("note") ? "Saving…" : "Add to project →"}</button></form></details>
            </>}
              <div hidden={tab !== "review"}>{renderReview()}</div>
             {tab === "review" && <details className="project-overview"><summary>Organize features</summary>
              <p>Manage feature names, purposes and requirement placement. Read and review requirements in the specification above; progress estimates are in Overall progress.</p>
              <details className="project-overview"><summary>Project overview</summary><p>{project.summary || "Your answers will help clarify the project scope."}</p>{project.analysisRevision !== project.revision && <small>New information has been saved since this overview was generated.</small>}</details>
              <button className="secondary" onClick={() => setNewEpic(!newEpic)}>{newEpic ? "Cancel" : "+ Add feature"}</button>
              {newEpic && <EpicForm disabled={busy} onSave={(title, purpose) => act(async () => { await mutate("epic", { title, purpose }); setNewEpic(false); })} />}
              {!requirements.length && <div className="empty-card"><h3>Your specification will take shape here.</h3><p>Start with the questions. Features and requirements appear as the project becomes clearer.</p></div>}
              {epics.filter((epic) => epicID === "all" || epic.id === epicID).sort((a, b) => Number(["project", "inbox"].includes(a.id)) - Number(["project", "inbox"].includes(b.id))).map((epic) => {
                const members = requirements.filter((r) => r.epicID === epic.id);
                const related = project.questions.filter((q) => q.epicID === epic.id && q.status !== "retired");
                if (["project", "inbox"].includes(epic.id) && !members.length && !related.length && !project.sources.some((s) => s.kind === "note" && s.epicID === epic.id)) return null;
                return <section key={epic.id} className="requirement-card"><h3>{areaTitle(epic)}</h3><p>{epic.purpose}</p>{!!epic.dependencies.length && <p>Depends on: {epic.dependencies.map((dependency) => epics.find((area) => area.id === dependency)?.title ?? "Earlier feature").join(", ")}</p>}
                <div className="button-row">{!["project", "inbox"].includes(epic.id) && <button className="quiet" onClick={() => setEditingEpic(editingEpic === epic.id ? null : epic.id)}>Edit feature</button>}</div>
                {editingEpic === epic.id && <EpicForm title={epic.title} purpose={epic.purpose} disabled={busy} onSave={(title, purpose) => act(async () => { await mutate("epic", { epicID: epic.id, title, purpose }); setEditingEpic(null); })} />}
                {!members.length && <p>No requirements recorded for this feature yet.</p>}
                <PagedList items={members} itemID={(r) => r.id} label={`Organize ${areaTitle(epic)}`}>{(requirement) => <label>{requirement.statement}<select aria-label={`Feature for ${requirement.statement}`} disabled={busy} value={requirement.epicID} onChange={(event) => void act(() => mutate("organize", { operations: [{ type: "move", recordID: requirement.id, epicID: event.target.value }] }))}>{epics.map((area) => <option key={area.id} value={area.id}>{areaTitle(area)}</option>)}</select></label>}</PagedList>
                </section>;
              })}
            </details>}
            {tab === "implementation" && <LazyDetails summary="Manual implementation records">{() => <><p>Retained notes and self-reported progress. These records do not establish verified delivery to main.</p><ImplementationProgress project={project} requirements={requirements} disabled={busy} save={(requirementID, value) => act(() => mutate("implementation", { requirementID, ...value }))} /></>}</LazyDetails>}
             {tab === "history" && <ProjectActivityFeed key={`${project.id}:${epicID}`} projectID={project.id} feature={epicID} openIssue={openIssue} openRequirement={(requirementID) => setIssue({ projectID: project.id, requirementID })} updateToken={`${project.revision}:${data.execution.version}:${data.jobs.map((job) => `${job.id}:${job.status}`).join(",")}:${data.helpJobs.map((job) => `${job.id}:${job.status}`).join(",")}:${data.submissions.map((item) => `${item.id}:${item.status}`).join(",")}`} request={api} activeFeatureIDs={epics.map((epic) => epic.id)} openFeature={(feature) => { setEpicID(feature); setTab("requirements"); }} />}
             {tab === "history" && lastJob?.status === "completed" && lastJob.expectedRevision < project.revision && <LazyDetails summary="Restore earlier feature organization">{() => <><p>Restore the feature organization from before the latest completed review. Check the recorded changes before using this recovery action.</p><button className="secondary" disabled={busy} onClick={() => void act(() => mutate("undo-organization", { targetRevision: lastJob.expectedRevision }))}>Restore organization before this review</button></>}</LazyDetails>}
            {tab === "research" && <><div className="research-intro"><p>{project.model.connectionID ? "Direct ChatGPT discovery runs without web research. Existing sources remain available below." : "Collected sources inform choices; they do not decide your preferences."}</p><button className="quiet" onClick={() => navigate("settings")}>Research settings</button></div>{project.research.filter((item) => epicID === "all" || item.epicID === epicID).map((finding) => <article className="requirement-card" key={finding.id}><span className="badge">{finding.kind === "fetched-page" ? "Retrieved page" : "Search-result evidence"}</span><h3><a href={finding.url} target="_blank" rel="noreferrer">{finding.title} ↗</a></h3><p>{finding.finding}</p><small>{new URL(finding.url).hostname} · {new Date(finding.retrievedAt).toLocaleString()}</small><details><summary>Source excerpt</summary><p className="source-excerpt">{finding.excerpt}</p></details></article>)}{!project.research.length && <div className="empty-card"><h3>No sources collected yet.</h3><p>{project.model.connectionID ? "Web research is not yet available for direct ChatGPT connections." : "Enable research in Settings and explore a concrete area. Vague ideas may need clarification before external research is useful."}</p></div>}</>}
          </div>
          {tab === "review" && <aside className="insight-column">
            {project.organizationReviews.filter((item) => item.status === "pending").map((review) => <section key={review.id} className="insight-card review-organization"><h3>Reorganization to review</h3><p>{review.reason}</p><details><summary>See proposed changes</summary><ul>{review.operations.map((op, index) => <li key={index}>{op.type === "upsert" ? `${op.type}: ${op.title} — ${op.purpose}` : op.type === "merge" || op.type === "split" ? `${op.type}: ${op.reason}` : `Move a record to ${project.epics.find((item) => item.id === op.epicID)?.title ?? "a proposed epic"}`}</li>)}</ul></details><div className="button-row"><button className="secondary" disabled={busy} onClick={() => void act(() => mutate("organization-review", { reviewID: review.id, accept: true }))}>Apply</button><button className="quiet" disabled={busy} onClick={() => void act(() => mutate("organization-review", { reviewID: review.id, accept: false }))}>Keep current</button></div></section>)}
            {!!project.assumptions.length && <details className="insight-card"><summary>Unconfirmed assumptions <span>{project.assumptions.length}</span></summary><ul>{project.assumptions.map((item) => <li key={item}>{item.replace(/^Unconfirmed:\s*/i, "")}</li>)}</ul></details>}
            <details className="insight-card"><summary>Your original idea & recent notes</summary>{[...project.sources.filter((item) => item.kind === "initial"), ...project.sources.filter((item) => item.kind === "note").slice(-9)].map((item) => <blockquote key={item.id}><small>{item.kind === "initial" ? "Original idea" : "Your note"}</small><p className="source-excerpt">{item.text}</p></blockquote>)}<small>Original idea and latest nine notes. All saved input remains in revision history.</small></details>
          </aside>}
        </section>
      </>}
      </div>
      </div>
      </div>
    </main>
  </div></ActionScope></LogProject.Provider>;
}

function areaTitle(epic?: Project["epics"][number]) {
  return epic?.id === "project" ? "Shared project decisions" : epic?.id === "inbox" ? "Items to organize" : epic?.title ?? "Items to organize";
}

function QuestionCard({ question, area, purpose, expanded, onToggle, onCancel, help, initialText, initialKind, draft, onDraft: persistDraft, number, disabled, dismissDisabled, onDismiss, status, onSave, notice, inline = false }: { question: Project["questions"][number]; area: string; purpose?: string; expanded: boolean; onToggle: () => void; onCancel: () => void; help: HelpControls; initialText?: string; initialKind?: Draft["kind"]; draft?: Draft; onDraft: (draft: Draft) => void; number: number; disabled: boolean; dismissDisabled: boolean; onDismiss?: () => Promise<void>; status?: string; onSave: (kind: "answer" | "delegation" | "deferral", text: string) => Promise<void>; notice?: React.ReactNode; inline?: boolean }) {
  const [text, setText] = useState(draft?.text ?? initialText ?? ""); const [kind, setKind] = useState<Draft["kind"]>(draft?.kind ?? initialKind ?? (question.status === "delegated" ? "delegation" : question.status === "deferred" ? "deferral" : "answer"));
  const fingerprint = useMemo(() => questionReviewFingerprint(question), [question]);
  const [basis, setBasis] = useState(draft?.fingerprint ?? fingerprint);
  const changed = basis !== fingerprint;
  const onDraft = (next: Draft) => persistDraft({ ...next, fingerprint: basis });
  const updateText = (value: string) => { setText(value); onDraft({ kind, text: value }); };
  const updateKind = (value: Draft["kind"]) => { setKind(value); onDraft({ kind: value, text }); };
  const currentQuestion = number === 1 && question.status === "pending" && !status;
  const [helpReveal, setHelpReveal] = useState(0);
  const [explaining, setExplaining] = useState(false);
  const explanationInFlight = useRef(false);
  const explain = useCallback(async (phrase: string, context: string) => {
    if (explanationInFlight.current || help.busy) return;
    explanationInFlight.current = true; setExplaining(true); setHelpReveal((value) => value + 1);
    try { await help.request({ questionID: question.id, action: "define", word: { phrase, text: context } }); }
    finally { explanationInFlight.current = false; setExplaining(false); }
  }, [help, question.id]);
  // Answer keystrokes do not change the word/concept controls. Reuse their
  // elements rather than rebuilding every word and scanning help history.
  const annotations = useMemo(() => {
    const jobs = help.jobs.filter((job) => job.helpRequest?.questionID === question.id);
    const render = (text: string, field: "text" | "whyItMatters" | "label" | "consequence", optionIndex?: number) => <AnnotatedText text={text} concepts={question.concepts?.filter((c) => c.field === field && c.optionIndex === optionIndex)} onExplain={explain} onCancel={help.cancel} busy={explaining || help.busy} jobs={jobs} revision={help.revision} />;
    return {
      text: render(question.text, "text"), whyItMatters: render(question.whyItMatters, "whyItMatters"),
      options: question.options.map((option, index) => ({ label: render(option.label, "label", index), consequence: render(option.consequence, "consequence", index) })),
    };
  }, [question, help, explaining, explain]);
  const annotated = (_text: string, field: "text" | "whyItMatters" | "label" | "consequence", optionIndex?: number) => field === "text" || field === "whyItMatters" ? annotations[field] : annotations.options[optionIndex!]![field];
  const render = () => {
  return <article className={`question-card ${expanded ? "expanded" : "collapsed"}`}><div className="question-meta"><span>{area}{question.category ? ` · ${dimensionLabels[question.category]}` : ""}</span><span role="status">{status ?? (question.status === "pending" ? "To answer" : question.status === "answered" ? "Answered" : question.status)}</span></div><div className="question-title"><h3 aria-label={question.text}>{expanded ? annotated(question.text, "text") : <button aria-expanded={false} onClick={onToggle}>{question.text}</button>}</h3>{expanded && currentQuestion ? <span className="quiet">Current question</span> : <button className="quiet" aria-expanded={expanded} onClick={onToggle}>{expanded ? "Collapse" : initialText ? "Edit answer" : "Answer"}</button>}</div>{!expanded && initialText && <p className="answer-preview">{initialText}</p>}{expanded && <div className="question-body"><p>{annotated(question.whyItMatters, "whyItMatters")}</p>{purpose && <details className="question-context"><summary>About this feature</summary><p>{purpose}</p></details>}{status === "processing" && <p className="correction-hint">This response is being reviewed. A correction will be saved for the next round.</p>}{status === "queued" && <p className="correction-hint">Saving changes replaces this waiting response. Its earlier version stays in history.</p>}<div className="options">{question.options.map((option, index) => <div className={`option ${kind === "answer" && text === option.label ? "chosen" : ""}`} key={index}><span className="option-circle">{String.fromCharCode(65 + index)}</span><div className="option-copy"><strong>{annotated(option.label, "label", index)}</strong><small>{annotated(option.consequence, "consequence", index)}</small></div><button type="button" className="option-choose" aria-label={`Choose ${option.label}. ${option.consequence}`} aria-pressed={kind === "answer" && text === option.label} disabled={disabled} onClick={() => { setKind("answer"); setText(option.label); onDraft({ kind: "answer", text: option.label }); }}>{kind === "answer" && text === option.label ? "✓ Selected" : "Choose"}</button></div>)}</div>
    {changed && <p role="status">This question or its choices changed after processing. Your draft is retained. Read the updated question, then <button type="button" className="quiet" onClick={() => { setBasis(fingerprint); persistDraft({ kind, text, fingerprint }); }}>Use draft with updated question</button>.</p>}
    {disabled && <ActivityFeedback label="Saving response…" />}
    <p className="word-help-hint">Unclear wording? Click any word, then ? to ask what it means. Underlined concepts explain instantly.</p>
    <QuestionHelp questionID={question.id} help={help} reveal={helpReveal} requesting={explaining} />
    <form onSubmit={(event) => { event.preventDefault(); if (!disabled && !changed && text.trim()) void onSave(kind, text); }}>
      <label className="sr-only">Your answer to {question.text}</label><textarea aria-label={`Your answer to ${question.text}`} value={text} onChange={(event) => updateText(event.target.value)} rows={2} maxLength={12000} placeholder={kind === "delegation" ? "Describe exactly which choice the AI may make, and its limits…" : kind === "deferral" ? "What should remain open, and why?" : "Choose an option above, or write it in your own words…"} required />
      <div className="answer-actions"><select aria-label={`Response type for ${question.text}`} value={kind} disabled={disabled} onChange={(event) => updateKind(event.target.value as typeof kind)}><option value="answer">My answer</option><option value="deferral">Defer for now</option><option value="delegation">Delegate within limits</option></select>
        <button type="button" className="quiet" disabled={disabled} onClick={() => { setText(initialText ?? ""); setKind(initialKind ?? "answer"); setBasis(fingerprint); onCancel(); }}>Cancel</button>
        {onDismiss && <button type="button" className="quiet" disabled={disabled || dismissDisabled} onClick={() => void onDismiss()} aria-label={`Dismiss unrelated question: ${question.text}`}>Unrelated / dismiss</button>}
        <ActionButton className="primary" reason={changed ? "Review the updated question and choose Use draft with updated question first." : !text.trim() ? "Choose an option or write a response first." : undefined} disabled={disabled || changed || !text.trim()}>{initialText ? "Save changes →" : "Save response →"}</ActionButton></div>
      {kind === "delegation" && <small className="delegation-note">This lets the AI choose only within the limits you describe. It does not record a specific choice as your decision.</small>}
    </form></div>}
    {notice}
   </article>;
  };
   return <ActionScope reason={disabled ? "Your response is being saved. Wait for it to finish." : undefined}>{inline ? <div className="inline-question">{render()}</div> : render()}</ActionScope>;
}
function EpicForm({ disabled, onSave, title: initialTitle = "", purpose: initialPurpose = "" }: { disabled: boolean; title?: string; purpose?: string; onSave: (title: string, purpose: string) => Promise<void> }) {
  const [title, setTitle] = useState(initialTitle); const [purpose, setPurpose] = useState(initialPurpose);
  return <ActionScope><form className="epic-form" onSubmit={(event) => { event.preventDefault(); if (!disabled) void onSave(title, purpose); }}><label>Feature name<input required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} /></label><label>Purpose<textarea required value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={4000} rows={3} /></label><button className="secondary" disabled={disabled}>{initialTitle ? "Save feature" : "Add feature"}</button></form></ActionScope>;
}
createRoot(document.getElementById("root")!).render(<ActivityProvider><App /></ActivityProvider>);
