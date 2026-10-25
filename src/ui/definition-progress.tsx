import React from "react";
import type { Job, Project } from "../core/model.js";
import { definitionSteps } from "../core/definition-continuation.js";
import { LazyDetails } from "./lazy-details.js";
import { DiagnosticNotice } from "./diagnostic-notice.js";
import { definitionStopSummary, statusLabel } from "./user-messages.js";
import { LogLink } from "./log-access.js";
import { canRecoverDefinition } from "../core/definition-recovery.js";

export function DefinitionProgress({ job, project }: { job: Job; project: Project }) {
  const task = job.context?.definitionAssessment, work = job.definitionWork;
  if (!task) return null;
  const interruption = job.definitionInterruption;
  const stopped = ["interrupted", "cancelled"].includes(job.status);
  const needsAllowance = canRecoverDefinition(job);
  const legacyUnknown = stopped && !interruption && !work?.paused;
  const steps = work ? definitionSteps(work) : [], step = work ? steps[work.receipts.length] : undefined;
  const included = new Set(job.context?.includedIDs ?? []);
  const requirements = project.requirements.filter((r) => included.has(r.id));
  const questions = project.questions.filter((r) => included.has(r.id));
  const sources = project.sources.filter((r) => included.has(r.id));
  const research = project.research.filter((r) => included.has(r.id));
  const label = job.definitionBlock ? "Needs attention" : stopped
    ? interruption?.cause === "user-stop" ? "Stopped—progress saved" : interruption?.cause === "shutdown" ? "Interrupted by shutdown—progress saved"
      : job.status === "interrupted" && (interruption || work?.paused) ? "Paused—progress saved" : "Interrupted—progress saved" : statusLabel(job.status);
  return <section aria-label="Definition assessment progress">
    <p>Latest area assessment: {project.epics.find((e) => e.id === task.epicID)?.title ?? task.epicID} · {label}.</p>
    {work && <p>{work.receipts.length} of {steps.length} review steps saved. {job.status === "completed" ? "The review is finished. This is an estimate of how clearly the area is defined, not a guarantee that nothing is missing." : job.definitionBlock ? "The review needs attention before it can finish. Your progress score has not been updated with partial results." : "The progress score updates when the whole review finishes. Use Refresh definition coverage to continue; completed work is kept."}</p>}
    {work?.recovery && <p>{work.recovery.grants.filter((grant) => grant.spent).length} explicitly authorized recovery requests spent. Original attempts and completed checks are retained; Refresh does not grant more recovery requests.</p>}
    {job.status === "running" && step && <p role="status">{step.phase === "collect" ? "Reading your project information" : "Checking the findings against your project information"}. Larger reviews may need extra steps, so the step count can change.</p>}
    <LogLink target={job.id} />
    {included.size > 0 && <LazyDetails summary={<>Evidence in this request · {requirements.length} requirements · {questions.length} questions · {sources.length} sources · {research.length} research records</>}>{() => <>
      <p>The review uses this area’s requirements and answers, relevant information from related areas, and rules that apply to the whole project. Large areas are reviewed in smaller parts.</p>
      <DefinitionEvidence records={[
        ...requirements.map((r) => ({ id: r.id, label: `Requirement: ${r.statement}` })),
        ...questions.map((r) => ({ id: r.id, label: `Question: ${r.text}` })),
        ...sources.map((r) => ({ id: r.id, label: `Source (${r.kind}): ${r.text}` })),
        ...research.map((r) => ({ id: r.id, label: `Research: ${r.id}` })),
      ]} />
    </>}</LazyDetails>}
    {legacyUnknown && <p>This earlier review stopped, but the reason wasn’t recorded. Completed checks are still saved.</p>}
    {stopped && interruption && <p role="status">{definitionStopSummary(interruption.cause)} Use Refresh definition coverage to continue unfinished work.</p>}
    {(job.definitionBlock?.reason || job.diagnostic) && <DiagnosticNotice detail={job.definitionBlock?.reason ?? job.diagnostic} summary={needsAllowance ? "The review paused after repeated unsuccessful requests. Your saved work is kept." : job.definitionBlock ? "The assessment found an issue that needs attention before it can finish." : stopped ? "The review stopped before finishing. Completed checks are saved." : undefined} next={needsAllowance ? "Use Refresh definition coverage to confirm one additional request and continue." : job.definitionBlock ? "Open Specification → Needs your decision to read the finding and record a correction if your answers conflict. For technical or unavailable-evidence problems, see Logs. Repeating an unchanged review does not resolve the issue." : undefined} />}
  </section>;
}

function DefinitionEvidence({ records }: { records: { id: string; label: string }[] }) {
  const [visible, setVisible] = React.useState(25);
  return <><p>Showing {Math.min(visible, records.length)} of {records.length} records. Long text is previewed here only; exact text is retained for assessment.</p>
    <ul style={{ overflowWrap: "anywhere" }}>{records.slice(0, visible).map((r) => <li key={r.id}>{r.label.slice(0, 240)}{r.label.length > 240 ? "…" : ""}</li>)}</ul>
    {visible < records.length && <button type="button" className="secondary" onClick={() => setVisible((count) => count + 25)}>Show more evidence records</button>}
  </>;
}
