import type { SnapshotTokens } from "../web/snapshot.js";

// Keep equal sections referentially stable across JSON polling responses. Do not
// compare only revisions: job/lease/workspace outcomes can change independently.
const serialized = new WeakMap<object, string>();
function signature(value: object) {
  let text = serialized.get(value);
  if (text === undefined) { text = JSON.stringify(value); serialized.set(value, text); }
  return text;
}

/** Inputs are immutable JSON snapshots; retained cache entries follow their lifetime. */
export function shareSnapshot<T extends object>(previous: T | null, next: T): T {
  if (!previous) return next;
  const result = { ...next };
  let unchanged = Object.keys(previous).length === Object.keys(next).length;
  for (const key of Object.keys(next) as (keyof T)[]) {
    const before = previous[key], after = next[key];
    if (Object.is(before, after) || before !== null && after !== null && typeof before === "object" && typeof after === "object" && signature(before) === signature(after)) result[key] = before;
    else unchanged = false;
  }
  return unchanged ? previous : result;
}

/** Missing wire sections are retained only when the server confirms their token.
 * Rebuild from the returned keys so removed optional fields never linger.
 */
export function mergeSnapshotSections<T extends object>(previous: { snapshot: T; tokens: SnapshotTokens } | null, sections: Partial<T>, tokens: SnapshotTokens): T {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(tokens)) {
    if (Object.hasOwn(sections, key)) result[key] = sections[key as keyof T];
    else if (previous && previous.tokens[key] === tokens[key] && Object.hasOwn(previous.snapshot, key)) result[key] = previous.snapshot[key as keyof T];
    else throw new Error("Incomplete workspace refresh. Reload this page to recover.");
  }
  return shareSnapshot(previous?.snapshot ?? null, result as T);
}

type VersionedSnapshot = { project: { id: string; revision: number }; execution: { version: number } };
type Baseline<T> = { snapshot: T; tokens: SnapshotTokens };
type RefreshTicket<T> = { sequence: number; projectID: string; baseline: Baseline<T> | null };

/** Each response is merged against the exact baseline sent with its request, not
 * whichever request happened to finish most recently. Late polls cannot undo saves.
 */
export class SnapshotRefresh<T extends VersionedSnapshot> {
  private requested = 0;
  private accepted = 0;
  private cached: Baseline<T> | null = null;
  begin(projectID: string): RefreshTicket<T> {
    return { sequence: ++this.requested, projectID, baseline: this.cached?.snapshot.project.id === projectID ? this.cached : null };
  }
  complete(ticket: RefreshTicket<T>, sections: Partial<T>, tokens: SnapshotTokens | null, selectedID: string | null, aborted = false): T | null {
    if (aborted || selectedID !== ticket.projectID || ticket.sequence <= this.accepted) return null;
    let snapshot = tokens ? mergeSnapshotSections(ticket.baseline, sections, tokens) : shareSnapshot(ticket.baseline?.snapshot ?? null, sections as T);
    if (snapshot.project.id !== ticket.projectID) throw new Error("Workspace refresh returned a different project.");
    const previous = this.cached?.snapshot;
    if (previous?.project.id === ticket.projectID && (previous.project.revision > snapshot.project.revision || previous.project.revision === snapshot.project.revision && previous.execution.version > snapshot.execution.version)) return null;
    // Execution checkpoints replace the section, but equal settings/results/history
    // remain immutable. Preserve those identities for targeted UI memoization.
    if (previous?.project.id === ticket.projectID && previous.execution !== snapshot.execution) {
      snapshot = { ...snapshot, execution: shareSnapshot(previous.execution, snapshot.execution) };
    }
    this.accepted = ticket.sequence;
    this.cached = { snapshot, tokens: tokens ?? {} };
    return snapshot;
  }
}
