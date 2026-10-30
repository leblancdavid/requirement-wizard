import type { ExecutionEvaluation, ExecutionState } from "../core/execution.js";
import { shareSnapshot } from "./snapshot.js";

/** Derive only calculation inputs; keep the full snapshot for visible worker detail.
 * Version alone never determines equality: capture/impact metadata participates. */
export function executionEvaluation(state: ExecutionState, previous: ExecutionEvaluation | null = null): ExecutionEvaluation {
  return shareSnapshot(previous, {
    config: state.config, assessments: state.assessments, workspaceAssessments: state.workspaceAssessments,
    mainAssessments: state.mainAssessments, delivered: state.delivered, assessmentRequests: state.assessmentRequests,
    run: state.run, history: state.history, recoveryRevision: state.recoveryRevision, definitionRevision: state.definitionRevision,
    assessmentRuns: state.assessmentRuns?.map(({ operation, capture, head, impacts }) => ({ operation, capture, head, impacts })),
  });
}
