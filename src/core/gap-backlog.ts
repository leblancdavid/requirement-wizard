import { createHash } from "node:crypto";
import type { Job, Project } from "./model.js";
import { currentDecisionProjection } from "./current-decisions.js";
import { gapCheckSchema, gapLensSchema, gapReportSchema, type GapLens, type GapReport } from "./gap-types.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Record = Project["requirements"][number] | Project["questions"][number] | Project["sources"][number];
/** Storage may supply metadata only; backlog selection never needs old model output. */
export type GapHistory = Pick<Job, "id" | "expectedRevision" | "status"> & { kind?: string; helpRequest?: unknown;
  context?: Pick<NonNullable<Job["context"]>, "gapExploration" | "refinementOnly"> & { includedIDs?: string[] }; gapReport?: Job["gapReport"] };
export type GapTask = { record: Record; lens: GapLens; inputKey: string; recordIDs: string[]; supportingRecordIDs: string[]; state: "pending" | "checked" | "waiting" | "blocked" };

/** Revision-independent identities, computed from explicit evidence and conservative feature human guardrails. */
export function gapEvidence(project: Project) {
  const decisions = currentDecisionProjection(project);
  const records = new Map<string, Record>([...project.sources, ...project.questions, ...project.requirements].map((r) => [r.id, r]));
  const owners = new Map([...project.questions, ...project.requirements].map((r) => [r.id, r.epicID]));
  const area = (r: Record) => "kind" in r ? owners.get(r.questionID ?? r.requirementID ?? "") ?? r.epicID : r.epicID;
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const normalize = (r: Record): unknown => {
    if ("kind" in r && decisions.receipts.has(r.id)) return { id: r.id, kind: r.kind, requirementID: r.requirementID, epicID: r.epicID, decision: decisions.receipts.get(r.id) };
    if ("statement" in r) return { id: r.id, epicID: r.epicID, statement: r.statement, acceptance: r.acceptance,
      status: r.status, sourceIDs: r.sourceIDs.filter((id) => !decisions.omitted.has(id)), reviewNote: r.reviewNote ?? "" };
    if ("options" in r) return { id: r.id, epicID: r.epicID, text: r.text, options: r.options, status: r.status,
      sourceID: r.sourceID, evidenceIDs: r.evidenceIDs ?? [], category: r.category };
    return r;
  };
  const ordered = (items: Record[]) => items.slice().sort((a, b) => a.id.localeCompare(b.id)).map(normalize);
  const close = (ids: Set<string>) => {
    const queue = [...ids];
    for (let index = 0; index < queue.length; index++) {
      const r = records.get(queue[index]!);
      const linked = !r ? [] : "statement" in r ? r.sourceIDs : "options" in r ? [...r.evidenceIDs ?? [], ...r.sourceID ? [r.sourceID] : []]
        : [r.questionID, r.requirementID].filter((value): value is string => !!value);
      for (const link of linked) if (!ids.has(link) && !decisions.omitted.has(link)) { ids.add(link); queue.push(link); }
    }
  };
  const scopes = new Map<string, string>();
  function scope(epicID: string) {
    if (scopes.has(epicID)) return scopes.get(epicID)!;
    const selected = new Set(["project", epicID]);
    const visit = (id: string) => {
      for (const dependency of project.epics.find((e) => e.id === id)?.dependencies ?? []) if (!selected.has(dependency)) { selected.add(dependency); visit(dependency); }
    };
    for (const id of [...selected]) visit(id);
    const human = project.sources.filter((s) => s.kind !== "workspace" && !decisions.omitted.has(s.id)
      && (s.kind === "initial" || selected.has(area(s)) && (!superseded.has(s.id) || decisions.addenda.has(s.id))));
    const guardrails = project.requirements.filter((r) => selected.has(r.epicID) && (r.epicID === "project" || r.epicID !== epicID));
    const scopeIDs = new Set([...human, ...guardrails].map((r) => r.id)); close(scopeIDs);
    const key = digest({ guardrails: ordered([...scopeIDs].flatMap((id) => records.has(id) ? [records.get(id)!] : [])),
      dependencies: project.epics.filter((e) => selected.has(e.id)).map((e) => ({ id: e.id, purpose: e.purpose, archived: e.archived, dependencies: [...e.dependencies].sort() })).sort((a, b) => a.id.localeCompare(b.id)),
      // A rescan can change whether historical static evidence is current.
      snapshotID: project.scans.at(-1)?.id ?? null });
    scopes.set(epicID, key); return key;
  }
  return (record: Record) => {
    const ids = new Set([record.id]);
    close(ids);
    // Explicit target-linked questions block re-asking unresolved choices and
    // invalidate this work when their answers change. Generic lexical hints don't.
    const linkedQuestions = project.questions.filter((q) => q.status !== "retired" && (q.id === record.id || q.evidenceIDs?.includes(record.id)));
    for (const q of linkedQuestions) ids.add(q.id);
    close(ids);
    return { inputKey: digest({ compatibility: "gap-evidence-v1", scope: scope(area(record)), records: ordered([...ids].flatMap((id) => records.has(id) ? [records.get(id)!] : [])),
      missingIDs: [...ids].filter((id) => !records.has(id)).sort() }),
      recordIDs: [record.id], supportingRecordIDs: linkedQuestions.filter((q) => q.id !== record.id).map((q) => q.id),
      waiting: linkedQuestions.some((q) => ["pending", "deferred", "delegated"].includes(q.status)) };
  };
}

/** The catalog is deterministic; immutable completed jobs are its durable check ledger. */
export function gapBacklog(project: Project, jobs: GapHistory[], focusEpicID?: string) {
  if (focusEpicID && !project.epics.some((e) => e.id === focusEpicID && !e.archived)) throw new Error("Focused epic does not exist.");
  const active = new Set(project.epics.filter((e) => !e.archived).map((e) => e.id));
  const records: Record[] = [...project.requirements.filter((r) => r.status !== "rejected"),
    ...project.questions.filter((q) => q.status !== "retired"), ...project.sources.filter((s) => s.kind === "note" || s.kind === "initial")]
    .filter((r) => active.has(r.epicID) && (!focusEpicID || r.epicID === focusEpicID));
  // A newly organized empty feature still needs a first exploration. Scope the
  // original idea to that feature without inventing a source or a human decision.
  if (!records.length && focusEpicID) {
    const initial = project.sources.find((s) => s.kind === "initial");
    if (initial) records.push({ ...initial, epicID: focusEpicID });
  }
  const completed = new Set<string>(), blocked = new Set<string>(), lastRecord = new Map<string, number>(), lastArea = new Map<string, number>();
  const areas = new Map(records.map((r) => [r.id, r.epicID]));
  const savedJobs = new Map(jobs.map((job) => [job.id, job]));
  jobs.forEach((job, index) => {
    const exploration = job.context?.gapExploration;
    if (exploration?.check) gapCheckSchema.parse(exploration.check);
    if (job.gapReport) gapReportSchema.parse(job.gapReport);
    for (const task of job.gapReport?.blockedTasks ?? []) if (task.planner === "staged-evidence-v1") blocked.add(`${task.targetRecordID}:${task.lens}:${task.inputKey}`);
    for (const task of job.gapReport?.reusedChecks ?? []) {
      const original = savedJobs.get(task.sourceJobID);
      if (original?.status === "completed" && !original.kind && !original.helpRequest && !original.context?.refinementOnly
        && original.context?.gapExploration?.targetRecordID === task.targetRecordID && !original.context.gapExploration.check)
        completed.add(`${task.targetRecordID}:${task.lens}:${task.inputKey}`);
    }
    if (job.status !== "completed" || !exploration || job.kind || job.helpRequest || job.context?.refinementOnly) return;
    const id = exploration.targetRecordID;
    if (exploration.check) completed.add(`${id}:${exploration.check.lens}:${exploration.check.inputKey}`);
    if (areas.has(id)) { lastRecord.set(id, index); lastArea.set(areas.get(id)!, index); }
  });
  records.sort((a, b) => (lastArea.get(a.epicID) ?? -1) - (lastArea.get(b.epicID) ?? -1)
    || (lastRecord.get(a.id) ?? -1) - (lastRecord.get(b.id) ?? -1));
  const evidence = gapEvidence(project);
  const tasks: GapTask[] = records.flatMap((record) => {
    const basis = evidence(record);
    const lenses: GapLens[] = "statement" in record ? gapLensSchema.options : ["behavior"];
    return lenses.map((lens) => ({ record, lens, ...basis,
      state: completed.has(`${record.id}:${lens}:${basis.inputKey}`) ? "checked" : basis.waiting ? "waiting"
        : blocked.has(`${record.id}:${lens}:${basis.inputKey}`) ? "blocked" : "pending" }));
  });
  return tasks;
}

export function gapReport(tasks: GapTask[]): GapReport {
  const checked = tasks.filter((t) => t.state === "checked").length, waiting = tasks.filter((t) => t.state === "waiting").length;
  const blocked = tasks.filter((t) => t.state === "blocked").length;
  return { format: 1, state: "idle", total: tasks.length, checked, waiting, blocked,
    pending: tasks.length - checked - waiting - blocked, modelCalls: 0,
    explanation: "Task checks describe bounded exploration of recorded evidence, not completeness, correctness or verified implementation. Unrelated omitted history was not reviewed." };
}
