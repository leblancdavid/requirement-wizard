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
- **Next:** phase 2 impact/consent inventory and shared pending-follow-through contract.
  No new scheduler, consent setting or consolidated primary control ships in phase 1.

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
