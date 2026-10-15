import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type { Job, Project } from "../core/model.js";
import type { coverage } from "../core/coverage.js";
import "./styles.css";
import "./details.css";

type Snapshot = { project: Project; coverage: ReturnType<typeof coverage>; previousCoverage: number | null; jobs: Job[]; active: boolean; progress: string[] };
type Item = { id: string; name: string; revision: number };
const token = document.querySelector<HTMLMetaElement>('meta[name="wizard-token"]')?.content ?? "";
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { "X-Wizard-Token": token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}
function Meter({ value, stale = false }: { value: number; stale?: boolean }) {
  return <div className={`meter ${stale ? "stale" : ""}`} role="meter" aria-label="Definition coverage" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>;
}
function App() {
  const [projects, setProjects] = useState<Item[]>([]);
  const [id, setID] = useState<string | null>(localStorage.getItem("wizard-project"));
  const selected = useRef(id); selected.current = id;
  const [data, setData] = useState<Snapshot | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"discover" | "requirements" | "research" | "history">("discover");
  const [epicID, setEpicID] = useState("all");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [auto, setAuto] = useState(localStorage.getItem("wizard-auto") !== "false");
  const [research, setResearch] = useState(localStorage.getItem("wizard-research") !== "false");
  const [name, setName] = useState(""); const [idea, setIdea] = useState("");
  const [model, setModel] = useState("gpt-6.1-sol");
  const [note, setNote] = useState("");
  const [newEpic, setNewEpic] = useState(false);
  const [editingEpic, setEditingEpic] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ revision: number; reason: string }>>([]);
  const [showContext, setShowContext] = useState(false);
  const project = data?.project;
  const summary = data?.coverage;
  const busy = pending || !!data?.active;

  async function list() {
    const items = await api<Item[]>("projects"); setProjects(items);
    if (!items.some((item) => item.id === selected.current)) setID(items[0]?.id ?? null);
  }
  async function load(projectID = selected.current) {
    if (!projectID) return;
    const snapshot = await api<Snapshot>(`projects/${projectID}`);
    if (selected.current === projectID) setData(snapshot);
  }
  useEffect(() => { void list().catch((error: Error) => setError(error.message)); }, []);
  useEffect(() => { localStorage.setItem("wizard-auto", String(auto)); }, [auto]);
  useEffect(() => { localStorage.setItem("wizard-research", String(research)); }, [research]);
  useEffect(() => {
    setData(null); setEpicID("all"); setTab("discover"); setError("");
    if (id) { localStorage.setItem("wizard-project", id); void load(id).catch((error: Error) => { setError(error.message); }); }
  }, [id]);
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => { void load(id).catch((error: Error) => setError(error.message)); }, 2000);
    return () => clearInterval(timer);
  }, [id]);
  useEffect(() => { if (project) setModel(project.model.modelID); }, [project?.model.modelID]);
  useEffect(() => {
    if (project && epicID !== "all" && !project.epics.some((item) => item.id === epicID && !item.archived)) setEpicID("all");
  }, [project?.revision, epicID]);
  useEffect(() => {
    if (tab === "history" && id) void api<typeof history>(`projects/${id}/history`).then(setHistory).catch((error: Error) => setError(error.message));
  }, [tab, project?.revision]);

  async function act(action: () => Promise<void>) {
    setError(""); setPending(true);
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Action failed."); }
    finally { setPending(false); await load().catch(() => {}); }
  }
  async function mutate(action: string, body: Record<string, unknown>, analyze = false) {
    if (!project) return;
    const updated = await api<Project>(`projects/${project.id}/${action}`, { revision: project.revision, ...body });
    if (analyze && auto) await api(`projects/${project.id}/analyze`, { revision: updated.revision, research, ...(epicID !== "all" ? { focusEpicID: epicID } : {}) });
    await list();
  }
  async function explore() {
    if (project) await api(`projects/${project.id}/analyze`, { revision: project.revision, research, ...(epicID !== "all" ? { focusEpicID: epicID } : {}) });
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const created = await api<Project>("projects", { name, idea, model: { providerID: "openai", modelID: model } });
      setID(created.id); selected.current = created.id; setCreating(false); setName(""); setIdea("");
      await list(); await api(`projects/${created.id}/analyze`, { revision: created.revision, research });
    });
  }
  const epics = project?.epics.filter((item) => !item.archived) ?? [];
  const selectedEpic = epics.find((item) => item.id === epicID);
  const epicScore = summary?.epics.find((item) => item.epicID === epicID);
  const questions = project?.questions.filter((item) => item.status !== "retired" && (epicID === "all" || item.epicID === epicID)) ?? [];
  const openQuestions = questions.filter((item) => ["pending", "deferred", "delegated"].includes(item.status));
  const requirements = project?.requirements.filter((item) => epicID === "all" || item.epicID === epicID) ?? [];
  const lastJob = data?.jobs.at(-1);

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><div>Requirement<span>WIZARD</span></div></div>
      <div className="sidebar-label">YOUR WORKSPACE</div>
      <button className="new-project" onClick={() => setCreating(true)}>＋ New project</button>
      <nav aria-label="Projects">{projects.map((item) => <button key={item.id} className={`project-link ${id === item.id ? "selected" : ""}`} onClick={() => { setID(item.id); setCreating(false); }}><span>◇</span>{item.name}</button>)}</nav>
      <div className="sidebar-bottom"><span className="connection-dot" /> Local-first workspace<p>Project files are saved on this device.<br />Discovery sends context to ChatGPT.</p></div>
    </aside>
    <main>
      <header className="topbar"><div><span className="eyebrow">FROM IDEA TO BUILD-READY</span><h1>{creating ? "Start with a spark." : project?.name ?? "Your next idea starts here."}</h1></div>
        <div className="local-tag">◉ Local workspace{project && !creating && <span>Revision {project.revision}</span>}</div></header>
      {error && <div role="alert" className="error"><strong>Something needs attention.</strong> {error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {(creating || !projects.length) ? <section className="welcome">
        <div className="welcome-art">✦</div><span className="eyebrow">LET’S MAKE IT CONCRETE</span><h2>Big ideas begin<br />with a little clarity.</h2><p>Tell us what you have in mind. Your AI partner will organize the possibilities, ask useful questions, and help fill in the gaps.</p>
        <form onSubmit={(event) => void create(event)}>
          <label>Project name<input required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} placeholder="Something worth building" /></label>
          <label>Your idea<textarea required maxLength={12000} value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="I want to build an app that…" rows={5} /></label>
          <label>ChatGPT model<input required value={model} onChange={(event) => setModel(event.target.value)} /></label>
          <small>Uses your existing OpenCode connection. If needed, run <code>opencode auth login</code> first.</small>
          <label className="research-toggle"><input type="checkbox" checked={research} onChange={(event) => setResearch(event.target.checked)} /> Allow targeted web research</label>
          <button className="primary" disabled={pending}>{pending ? "Creating…" : "Create & explore →"}</button>
        </form>
      </section> : !project || !summary ? <div className="empty">Loading your workspace…</div> : <>
        <section className="overview">
          <div className="overview-copy"><span className="eyebrow">A LIVING PROJECT MAP</span><h2>Clarity, one decision at a time.</h2><p>{project.summary || "Your first discovery round will turn your idea into questions and logical areas of work."}</p>
            {project.analysisRevision !== project.revision && project.summary && <span className="subtle-badge">New information · analysis needs refresh</span>}</div>
          <div className="coverage-main"><div><span>Definition coverage</span><strong>{summary.percent}<small>%</small></strong></div><Meter value={summary.percent} stale={summary.stale} /><p>{summary.stale ? "Estimate needs review" : "Latest assessment"} · {summary.scopeConfidence} scope confidence</p>{data.previousCoverage !== null && <small>{summary.percent - data.previousCoverage >= 0 ? "+" : ""}{summary.percent - data.previousCoverage} points from before the last discovery round</small>}<small>Coverage of identified work, not proof of completeness.</small></div>
        </section>
        <div className="stats"><span><b>{epics.filter((item) => !["project", "inbox"].includes(item.id)).length}</b> epics taking shape</span><span><b>{summary.openQuestions}</b> decisions to explore</span><span><b>{summary.criticalGaps}</b> critical assessed gaps</span><span><b>{project.requirements.filter((item) => item.status === "accepted").length}</b> requirements confirmed</span></div>
        <section className="workspace">
          <div className="epic-column"><div className="section-heading"><h2>Project map</h2><button className="icon-button" aria-label="Add epic" onClick={() => setNewEpic(!newEpic)}>＋</button></div>
            <button className={`map-all ${epicID === "all" ? "active" : ""}`} onClick={() => setEpicID("all")}>▦ All project areas<span>{epics.length}</span></button>
            {epics.map((epic) => { const score = summary.epics.find((item) => item.epicID === epic.id)!; return <button key={epic.id} className={`epic-card ${epicID === epic.id ? "active" : ""}`} onClick={() => setEpicID(epic.id)}>
              <div><span>{epic.id === "project" ? "◈" : epic.id === "inbox" ? "▱" : "◇"}</span><strong>{epic.title}</strong></div><p>{epic.purpose}</p><Meter value={score.percent} stale={score.stale} /><footer><span>{score.assessed ? `${score.percent}% defined` : "Not assessed"}</span><span>{score.openQuestions} open</span></footer></button>; })}
            {newEpic && <EpicForm disabled={busy} onSave={(title, purpose) => act(async () => { await mutate("epic", { title, purpose }); setNewEpic(false); })} />}
          </div>
          <div className="discovery-column">
            <div className="work-heading"><div><span className="eyebrow">{selectedEpic ? "FOCUSED DISCOVERY" : "PROJECT DISCOVERY"}</span><h2>{selectedEpic?.title ?? "Shape your idea"}</h2>{selectedEpic && !["project", "inbox"].includes(selectedEpic.id) && <button className="quiet" onClick={() => setEditingEpic(editingEpic === selectedEpic.id ? null : selectedEpic.id)}>Edit epic</button>}</div><button className="primary" disabled={busy} onClick={() => void act(explore)}>{data.active ? "Discovering…" : "✦ Explore next gaps"}</button></div>
            {selectedEpic && editingEpic === selectedEpic.id && <EpicForm key={selectedEpic.id} title={selectedEpic.title} purpose={selectedEpic.purpose} disabled={busy} onSave={(title, purpose) => act(async () => { await mutate("epic", { epicID: selectedEpic.id, title, purpose }); setEditingEpic(null); })} />}
            <div className="round-status" aria-live="polite">{data.active ? <><span className="pulse" />{data.progress.at(-1) ?? "Starting discovery…"}<button onClick={() => void act(async () => { await api(`projects/${project.id}/cancel`, {}); })}>Stop</button></> : lastJob?.status === "failed" || lastJob?.status === "stale" || lastJob?.status === "interrupted" ? <span className="job-error">Last round {lastJob.status}: {lastJob.diagnostic}</span> : <><span className="connection-dot" />{lastJob?.status === "completed" ? "Discovery saved. Your project map is ready to explore." : lastJob?.status === "cancelled" ? "Discovery stopped. Your saved answers are intact." : "Ready when you are. Start a round to explore your idea."}</>}</div>
            <div className="tabs" role="tablist">{([ ["discover", "Questions"], ["requirements", "Requirements"], ["research", "Research"], ["history", "Activity"] ] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}{key === "discover" && <span>{openQuestions.length}</span>}</button>)}</div>
            {tab === "discover" && <>
              <div className="answer-preference"><label><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} /> Reorganize and explore after each answer</label><small>Each round uses your model allowance.</small></div>
              {openQuestions.length === 0 && <div className="empty-card"><span>✧</span><h3>{project.questions.length ? "A little more clarity." : "Let’s find the right questions."}</h3><p>Explore the next gaps or add more information below. No pending questions does not mean all requirements are defined.</p></div>}
              {openQuestions.map((question, index) => <QuestionCard key={`${question.id}:${question.sourceID ?? "new"}`} question={question} initialText={project.sources.find((item) => item.id === question.sourceID)?.text} number={index + 1} disabled={busy} onSave={(kind, text) => act(() => mutate("answer", { questionID: question.id, answer: { kind, text } }, true))} />)}
              <form className="note-card" onSubmit={(event) => { event.preventDefault(); void act(async () => { await mutate("note", { text: note, epicID: epicID === "all" ? "project" : epicID }, true); setNote(""); }); }}><label>Add an idea, correction, or constraint<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Something else the project should consider…" maxLength={12000} required /></label><button className="secondary" disabled={busy || !note.trim()}>Add to project →</button></form>
              {questions.some((item) => item.status === "answered") && <details className="past-answers"><summary>Review or change previous answers</summary>{questions.filter((item) => item.status === "answered").map((question) => <QuestionCard key={`${question.id}:${question.sourceID}`} question={question} initialText={project.sources.find((item) => item.id === question.sourceID)?.text} number={0} disabled={busy} onSave={(kind, text) => act(() => mutate("answer", { questionID: question.id, answer: { kind, text } }, true))} />)}</details>}
            </>}
            {tab === "requirements" && <>{!requirements.length && <div className="empty-card"><h3>Requirements will take shape here.</h3><p>Answer the discovery questions first. Suggestions remain proposals until you confirm them.</p></div>}{requirements.map((requirement) => <article className="requirement-card" key={requirement.id}><span className={`badge ${requirement.status}`}>{requirement.status.replace("-", " ")}</span><h3>{requirement.statement}</h3><p>{requirement.rationale}</p><ul>{requirement.acceptance.map((item) => <li key={item}>{item}</li>)}</ul><label>Organize into<select aria-label={`Epic for ${requirement.statement}`} disabled={busy} value={requirement.epicID} onChange={(event) => void act(() => mutate("organize", { operations: [{ type: "move", recordID: requirement.id, epicID: event.target.value }] }))}>{epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.title}</option>)}</select></label><p className="review-note">{requirement.reviewNote}</p><ReviewForm disabled={busy} onReview={(action, note) => act(() => mutate("review", { requirementID: requirement.id, action, note }))} /></article>)}</>}
            {tab === "history" && <div className="history-list">{history.map((entry) => <article key={entry.revision}><span className="history-dot" /><div><strong>Revision {entry.revision}</strong><p>{entry.reason}</p></div></article>)}</div>}
            {tab === "research" && <><div className="research-intro"><label><input type="checkbox" checked={research} onChange={(event) => setResearch(event.target.checked)} /> Allow targeted research in future rounds</label><p>Search and page retrieval are limited to relevant uncertainties. Sources inform choices; they do not decide your preferences. The round stops if it exceeds the monitored tool budget.</p></div>{project.research.filter((item) => epicID === "all" || item.epicID === epicID).map((finding) => <article className="requirement-card" key={finding.id}><span className="badge">{finding.kind === "fetched-page" ? "Retrieved page" : "Search-result evidence"}</span><h3><a href={finding.url} target="_blank" rel="noreferrer">{finding.title} ↗</a></h3><p>{finding.finding}</p><small>{new URL(finding.url).hostname} · {new Date(finding.retrievedAt).toLocaleString()}</small><details><summary>Source excerpt</summary><p className="source-excerpt">{finding.excerpt}</p></details></article>)}{!project.research.length && <div className="empty-card"><h3>No sources collected yet.</h3><p>Enable research and explore a concrete area. Vague ideas may need clarification before external research is useful.</p></div>}</>}
          </div>
          <aside className="insight-column">
            <section className="insight-card"><span className="eyebrow">DEFINITION HEALTH</span><h3>{selectedEpic ? "What’s still missing?" : "How much do we know?"}</h3><p>{epicScore?.explanation ?? summary.scopeExplanation}</p>{epicScore ? <><div className="insight-percent">{epicScore.percent}% <span>{epicScore.stale ? "needs re-assessment" : `${epicScore.confidence} confidence`}</span></div>{epicScore.checks.map((check) => <details className="check-row" key={check.dimension}><summary><span className={`check-icon ${check.status}`}>{check.status === "defined" || check.status === "not-applicable" ? "✓" : check.status === "partial" ? "◐" : "○"}</span>{check.label}<span className="check-status">{check.status.replaceAll("-", " ")}</span></summary><p>{check.explanation}</p><small>{check.importance} · {check.evidenceIDs.length} evidence links</small>{check.evidenceIDs.map((evidenceID) => <Evidence key={evidenceID} id={evidenceID} project={project} />)}</details>)}</> : <><p className="muted">Select an epic to inspect its nine coverage areas and supporting evidence.</p><small>{summary.note}</small></>}</section>
            {!!selectedEpic?.dependencies.length && <section className="insight-card"><h3>Related dependencies</h3>{selectedEpic.dependencies.map((dependency) => <button className="quiet" key={dependency} onClick={() => setEpicID(dependency)}>{epics.find((item) => item.id === dependency)?.title ?? "Related area"} →</button>)}</section>}
            <section className="insight-card changes"><span className="eyebrow">LAST DISCOVERY ROUND</span><h3>What moved forward</h3>{project.roundChanges.length ? <ul>{project.roundChanges.map((change, index) => <li key={index}>{change}</li>)}</ul> : <p>Your next round’s changes will appear here.</p>}<small>Estimates can fall when discovery reveals missing work. More complete scope is progress, too.</small>{lastJob?.status === "completed" && lastJob.expectedRevision < project.revision && <button className="quiet" disabled={busy} onClick={() => void act(() => mutate("undo-organization", { targetRevision: lastJob.expectedRevision }))}>Restore map before this round</button>}</section>
            {project.organizationReviews.filter((item) => item.status === "pending").map((review) => <section key={review.id} className="insight-card review-organization"><h3>Reorganization to review</h3><p>{review.reason}</p><details><summary>See proposed changes</summary><ul>{review.operations.map((op, index) => <li key={index}>{op.type === "upsert" ? `${op.type}: ${op.title} — ${op.purpose}` : op.type === "merge" || op.type === "split" ? `${op.type}: ${op.reason}` : `Move a record to ${project.epics.find((item) => item.id === op.epicID)?.title ?? "a proposed epic"}`}</li>)}</ul></details><div className="button-row"><button className="secondary" disabled={busy} onClick={() => void act(() => mutate("organization-review", { reviewID: review.id, accept: true }))}>Apply</button><button className="quiet" disabled={busy} onClick={() => void act(() => mutate("organization-review", { reviewID: review.id, accept: false }))}>Keep current</button></div></section>)}
            {!!project.assumptions.length && <details className="insight-card"><summary>Unconfirmed assumptions <span>{project.assumptions.length}</span></summary><ul>{project.assumptions.map((item) => <li key={item}>{item.replace(/^Unconfirmed:\s*/i, "")}</li>)}</ul></details>}
            <details className="insight-card"><summary>Your original idea & recent notes</summary>{[...project.sources.filter((item) => item.kind === "initial"), ...project.sources.filter((item) => item.kind === "note").slice(-9)].map((item) => <blockquote key={item.id}><small>{item.kind === "initial" ? "Original idea" : "Your note"}</small><p className="source-excerpt">{item.text}</p></blockquote>)}<small>Original idea and latest nine notes. All saved input remains in revision history.</small></details>
            <section className="insight-card settings"><button className="quiet" onClick={() => setShowContext(!showContext)}>Context & model {showContext ? "−" : "+"}</button>{showContext && <><label>ChatGPT model<input value={model} onChange={(event) => setModel(event.target.value)} /></label><button disabled={busy || model === project.model.modelID} className="secondary" onClick={() => void act(() => mutate("model", { model: { providerID: "openai", modelID: model } }))}>Save model</button>{lastJob?.context && <p>{lastJob.context.characters.toLocaleString()} / {lastJob.context.budget.toLocaleString()} context characters · {lastJob.context.includedIDs.length} full records · {lastJob.context.omittedIDs.length} omitted from detail</p>}<small>Fresh revision-bound context each round. AI summaries do not replace your decisions. The context budget is a conservative character bound, not an exact tokenizer count.</small></>}</section>
          </aside>
        </section>
      </>}
    </main>
  </div>;
}

function QuestionCard({ question, initialText, number, disabled, onSave }: { question: Project["questions"][number]; initialText?: string; number: number; disabled: boolean; onSave: (kind: "answer" | "delegation" | "deferral", text: string) => Promise<void> }) {
  const [text, setText] = useState(initialText ?? ""); const [kind, setKind] = useState<"answer" | "delegation" | "deferral">(question.status === "delegated" ? "delegation" : question.status === "deferred" ? "deferral" : "answer");
  return <article className="question-card"><div className="question-meta"><span>{number ? `QUESTION ${String(number).padStart(2, "0")}` : "PREVIOUS ANSWER"}</span><span>{question.status === "pending" ? "Your perspective matters" : question.status}</span></div><h3>{question.text}</h3><p>{question.whyItMatters}</p><div className="options">{question.options.map((option, index) => <button type="button" aria-pressed={kind === "answer" && text === option.label} disabled={disabled} className={`option ${kind === "answer" && text === option.label ? "chosen" : ""}`} key={index} onClick={() => { setKind("answer"); setText(option.label); }}><span className="option-circle">{String.fromCharCode(65 + index)}</span><div><strong>{option.label}</strong><small>{option.consequence}</small></div><span className="selected-mark">{kind === "answer" && text === option.label ? "✓" : ""}</span></button>)}</div>
    <form onSubmit={(event) => { event.preventDefault(); void onSave(kind, text); }}><label className="sr-only">Your answer to {question.text}</label><textarea aria-label={`Your answer to ${question.text}`} value={text} onChange={(event) => setText(event.target.value)} rows={2} maxLength={12000} placeholder={kind === "delegation" ? "Describe exactly which choice the AI may make, and its limits…" : kind === "deferral" ? "What should remain open, and why?" : "Choose an option above, or write it in your own words…"} required /><div className="answer-actions"><select aria-label={`Response type for ${question.text}`} value={kind} disabled={disabled} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="answer">My answer</option><option value="deferral">Defer for now</option><option value="delegation">Delegate within limits</option></select><button className="primary" disabled={disabled || !text.trim()}>Save response →</button></div>{kind === "delegation" && <small className="delegation-note">Delegation records permission within your stated limits. It does not turn this text into a confirmed product preference.</small>}</form>
  </article>;
}
function ReviewForm({ disabled, onReview }: { disabled: boolean; onReview: (action: "accepted" | "rejected", note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  return <div className="review-form"><label>Review rationale<input maxLength={12000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why does this belong in your project, or why not?" /></label><div className="button-row"><button className="secondary" disabled={disabled || !note.trim()} onClick={() => void onReview("accepted", note)}>Confirm requirement</button><button className="quiet" disabled={disabled || !note.trim()} onClick={() => void onReview("rejected", note)}>Reject</button></div></div>;
}
function EpicForm({ disabled, onSave, title: initialTitle = "", purpose: initialPurpose = "" }: { disabled: boolean; title?: string; purpose?: string; onSave: (title: string, purpose: string) => Promise<void> }) {
  const [title, setTitle] = useState(initialTitle); const [purpose, setPurpose] = useState(initialPurpose);
  return <form className="epic-form" onSubmit={(event) => { event.preventDefault(); void onSave(title, purpose); }}><label>Epic name<input required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} /></label><label>Purpose<textarea required value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={4000} rows={3} /></label><button className="secondary" disabled={disabled}>{initialTitle ? "Save epic" : "Add epic"}</button></form>;
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
createRoot(document.getElementById("root")!).render(<App />);
