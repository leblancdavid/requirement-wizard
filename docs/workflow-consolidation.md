# Workflow consolidation plan

Agreed direction, 2026-10-29. This is an implementation plan, not a claim that the
consolidated workflow is already available. Existing behavior is described in
[coordinated workflow](coordinated-workflow.md), [definition coverage](definition-coverage.md)
and [implementation workspace](implementation-workspace.md).

## Progress

- **Phase 1 implemented:** refinement/resolution approval and duplicate removal retain
  definition assessments. Seven new regression/older-data cases pass, including
  repeated reopen and exact-history/missing-history compatibility.
- Checks run on Node 22.23.4: type check, all 1,014 tests (339 pretests + 675 main),
  42-test focused refinement suite, UI build and diff whitespace check passed.
  UI build retains the existing chunk-size warning. No browser runners, desktop
  packaging, live model calls or personal-project recovery were performed.
- **Phase 2 first slice implemented:** shared read-only definition follow-through
  projection, visible current/outdated/not-assessed area status, and coordinator
  priority for outdated reviews before broader discovery. Existing input, human
  decisions and consistency checks still take priority. Maintenance shares the status
  projection without gaining new dispatch authority. Enabled coordinator controls
  remain available in the drawer when a retained-input shortcut occupies the header.
- Phase 2 checks: type check, 1,018 tests (343 pretests + 675 main), UI build and focused
  workflow/maintenance browser runners passed. Workflow browser covers pending review
  visibility, mobile, paused changes, restart and explicit repair-first continuation.
  Aggregate browser checks passed layout/model selection, then stopped at the known
  obsolete Project map selector (`src/web/browser-check.ts:706`). No live calls,
  personal-data changes or desktop packaging were performed.
- **Phase 2 second slice implemented:** merge/split/restoration and authorized area
  archival retain original assessments, including archived-area findings. New areas
  do not inherit old findings. Exact restored evidence may reuse original reviews;
  later human decisions still require rechecking. Related saved work explains pending
  refinement and implementation-plan freshness through their existing gates, without
  preparing plans or approving changes.
- Second-slice checks: type check, 1,028 tests (344 pretests + 684 main), UI build and
  focused workflow browser checks passed. Added organization cases cover SQLite reopen,
  portable round trips, older saved provenance, failed/stale transactions, destination
  reuse and intervening human decisions. The full browser runner again passed layout/
  model selection, then stopped at its known Project map selector. No live calls or
  personal-project writes were made; the existing bundle warning remains.
- **Next:** safe historical recovery and completion summaries spanning affected
  artifacts, then the phase 3 control/consent consolidation. This is not yet a shared
  durable queue for every downstream artifact or a consent/UI overhaul.

## Intended experience

1. **Continue specification** coordinates authorized saved input, consistency checks,
   affected definition reviews, focused clarification and further gap discovery.
   **Improve requirements** remains an explicit cleanup operation whose approved
   changes feed back into the same follow-through queue.
2. **Prepare implementation** coordinates applicable existing-code checks and reviewed
   implementation planning. Specification definition and verified code remain separate.
3. **Start / Resume implementation / Verify delivery** retains explicit authority for
   coding, commands and delivery. Continuing specification never grants that authority.

Specialized checks remain small validated operations; consolidation does not mean a
single unbounded model request. Research, scans and broader exploration retain explicit
scope/consent. Stop, restart and portable adoption never silently renew model authority.

## Phase 1 — Preserve progress (first implementation slice)

- Retain definition assessments when wording refinements, pair resolutions or human
  duplicate removal change requirements. Existing exact-input freshness checks mark
  affected evidence outdated; unchanged unrelated areas remain reusable.
- Test proposal generation, dismissal, approval, consolidation and duplicate removal;
  cover affected/dependency/unrelated areas and legacy assessments without input keys.
- Verify SQLite reopen and retained historical revisions. Do not change assessment
  semantics, fingerprints or mark outdated evidence current.
- Document compatibility. Already removed assessments require a separate recovery
  design: inspect immutable revisions, retain original provenance and never infer that
  an older assessment is current. Do not automatically replay model calls or rewrite
  a personal database. Historical recovery is not part of the first slice.

Exit: changes retain original findings and provenance, affected coverage is outdated
rather than never assessed, unrelated exact-input coverage stays current, and restart
does not lose the retained work. Detailed stale reasons/recovery remain phase 2 work.

## Phase 2 — Shared impact and follow-through

### Mutation and authority inventory (first slice)

| Entry point | Durable publication and existing follow-through | Consent boundary / remaining gap |
| --- | --- | --- |
| Answers, notes, corrections and requirement reviews | Saved submissions apply through queue/service validation and revision-checked store writes; faithful changes, related pair checks and clarification use retained jobs. | Save-only input waits; the coordinator processes only automatic or explicitly included inputs. Failures and Stop do not renew grants. |
| Refinement/resolution approval and duplicate removal | Direct revision-checked store mutations; phase 1 retains assessments. Existing evidence identities expose affected/dependency reviews without an extra write. | Opted-in maintenance observes relevant decision changes; an armed coordinator can use only its remaining grant. Paused/restarted workers need continuation. |
| Organization, dependency edits, restoration and authorized archival | Revision-checked organization writes/reviews retain original assessments; existing identities include area/dependency records. Archived findings leave active coverage, while unchanged exact restored inputs can reuse their original review. | New split areas need their own baseline. Changed existing destinations/dependents need rechecks. Assessments removed by older versions are not automatically restored. |
| Initialize/rescan folder | Explicit bounded snapshot jobs, validated proposals and revision-checked publication; accepted decisions remain authoritative. | Scanning is not authorized by coordinator continuation. Proposal review still gates decisions; model-only changes do not themselves grant maintenance calls. |
| Implementation checks, planning, coding and delivery | Separate execution state, CAS/leases, frozen runs, planning freshness and code/delivery evidence. Related saved work now explains plan revision/workspace/settings mismatches and pending approval/interruption. | Remain explicit. Follow-through status does not prepare/approve a plan, run commands or start coding. Code/delivery impact and historical recovery remain separate. |

`src/core/follow-through.ts` currently projects definition review state from the
existing coverage freshness rules. It is not a new freshness hash or persisted job
format. Pending areas reconstruct from durable specification/assessment data on every
read and naturally coalesce repeated changes. Original saved job ledgers still own
attempts, blocking diagnostics and exact continuation; the projection grants no calls
and cannot override those ledgers. Reasons are deliberately general when no detailed
historical input comparison is available, rather than inventing a specific cause.

The same module also explains pending refinement freshness with the existing
`refinementStaleReason` gate and implementation plans with `planningCurrent` and the
existing configuration fingerprint. It distinguishes input freshness from unfinished
preparation and human approval. Planning remains revision-bound: even a bookkeeping
revision can make a plan outdated under the existing conservative rule. These notices
expose that rule; they do not introduce semantic plan reuse or automatic regeneration.
Dismissed/historical proposals do not become new tasks merely because of this view.
Current refinement decisions shown in the inbox are not repeated in the related-work
list; outdated suggestions remain explainable without inventing a human decision task.

The coordinator repairs **outdated existing reviews** before new gap discovery,
after pending input, decisions, stale proposals and consistency checks. Missing
initial baselines retain discovery-first ordering. Repair can itself pause/fail or
become outdated again if later exploration changes evidence. Full-area evidence
review remains necessary; no finding-level or semantic-equivalence reuse is inferred.

- Inventory mutation entry points (answers, notes, corrections, refinements,
  organization, scans) and their existing scheduler/lease/consent behavior.
- Define one deterministic impact projection for affected definition reviews,
  workflow checks, proposals and plans, with user-readable reasons. Distinguish
  valid saved work, outdated conclusions, missing evidence and never-assessed scope.
- Integrate a durable follow-through queue with the existing coordinator/maintenance
  paths rather than introducing a competing scheduler. Coalesce repeated changes;
  prioritize authorized input and human blockers before new exploration.
- Completion reports explain applied changes, reused work and remaining follow-through.
  Automatically execute only within the authorized scope/usage; otherwise show the
  appropriate continuation action. Broad exploration needs separate authority from
  changed-area repair.
- Version and migrate any new saved queue/reason payloads transactionally; preserve
  spent attempts, exact receipts, IDs and valid completed work. Assess safe historical
  assessment recovery separately from ordinary freshness.

Exit: every specification mutation either completes necessary follow-through or
leaves a durable explained pending/blocked item. Tests cover coalescing, stale
publication, Stop, exhausted usage, worker conflicts, repeated reopen, interrupted
migration and explicit continuation without repeating completed calls.

## Phase 3 — Consolidated controls and consent

- Evolve Continue project into Continue specification, building on the coordinator.
  Explain what it will do, what needs a decision and what work is saved.
- Put scoped discovery, refinement and recovery operations under More actions;
  retain existing capabilities and compatibility routes.
- Clearly label specification definition versus code/delivery verification.
- Consolidate automatic-processing policy only after mapping existing permissions.
  Preserve prior opt-outs, pauses and machine-local settings; never broaden consent
  on upgrade. Retain advanced scope and usage controls.
- Group implementation preparation without running new commands or code checks merely
  because a plan view opens. Coding and delivery remain explicit.

Exit: deterministic desktop/mobile browser tests cover primary next-action routing,
keyboard access, saved-work explanations, save-only/manual/automatic modes, restart
consent, and specification-to-planning-to-coding boundaries.

## Phase 4 — Safely reduce rechecking

Introduce versioned finding-level dependency tracking and incremental review only
where reuse can be established. Fall back to whole-area evidence review when uncertain.
Never classify a change as semantically harmless solely because it is called wording
cleanup. Benchmark requests and preparation separately; fixtures do not establish live
quality or provider speed. Compatible upgrades must not invalidate completed work.

## Delivery and verification

Deliver in independently tested slices. Run type checks and relevant deterministic
tests for each slice, plus the full test suite where feasible. UI slices additionally
need production builds and applicable browser runners. Record actual results and
known blockers, not inferred passes. Do not use personal data or paid model calls for
the preservation change. No commits/pushes without a separate request.
