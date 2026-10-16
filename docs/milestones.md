# Milestone backlog

Status: M1 partially verified; M2 persistent engine and local API implemented with
remaining review/UI work; M3 browser-first workspace implemented; M4 research/epic
coverage/context slice implemented with readiness work pending. Requirements refer to
[product-specification.md](product-specification.md). Complete and verify each
vertical slice before expanding it. The integrated build pilot follows the initial release.

## M1 — OpenCode runtime integration spike

Progress: version-pinned runner, provider discovery, live ChatGPT JSON-text response,
streaming, cancellation, and completed-session recovery verified. Native
structured-output/recovery failures remain. Copilot support is deferred and its
quota does not block M1. See [runtime-spike.md](runtime-spike.md)
for evidence and outstanding checks; M1 exit criteria are not all met.

Dependencies: none. Covers RW-004–006; investigates RW-010 and the runtime/tool boundary.

Work:

- M1.1 Inspect installed runtime and current SDK interfaces; pin tested versions.
- M1.2 Create a minimal TypeScript integration runner with explicit provider/model selection.
- M1.3 Exercise supported ChatGPT sign-in and model discovery. Copilot checks are deferred.
- M1.4 Request a small schema-validated interpretation/question response with streaming.
- M1.5 Exercise cancellation, provider failure, and reconnection after process restart.
- M1.6 Inspect effective configuration/tool profiles and verify discovery can run with
  the intended tool restrictions. Identify a feasible source-backed search/fetch path.
- M1.7 Publish reproducible commands, results, gaps, and the adapter recommendation.

Exit checks:

- A live authenticated response succeeds through the ChatGPT subscription connection.
- Schema errors and runtime failures are surfaced; cancellation permits a subsequent call.
- Restart behavior and actual tool-profile behavior are recorded.
- Record model IDs and available usage metadata without recording secrets.
- Missing credentials may block a live check; report it as blocked, never as a pass
  based on a fixture. Continue independent implementation work where possible.

Deliverables: runnable spike, versioned runtime notes, capability report, and updated
technical decisions. Do not commit to full UI infrastructure before reviewing the result.

### M1 direct-provider migration follow-up (DEC-015)

App-owned direct ChatGPT OAuth/catalog/streaming, browser Settings connection UI/API,
and direct discovery/help dispatch are implemented under `src/providers/` and `src/ui/`.
Deterministic service/API/browser checks and native Windows credential protection pass;
live sign-in, inference, refresh, revocation, and reconnect remain unverified.
Legacy selections still require OpenCode; direct selections do not launch it.
Direct research remains unsupported. This does not complete M1.
See [direct-providers.md](direct-providers.md).

- Confirm distribution eligibility and exercise the direct live compatibility checks.
- Qualify the implemented connection/catalog operations and direct discovery adapter.
- Broaden terminal selection controls; browser auth/model selection is implemented
  and existing snapshots retain their explicit legacy route.
- Replace research/tool execution and qualify provenance, budgets, and cancellation.
- Remove required OpenCode discovery execution after end-to-end verification.

## M2 — Shared engine and terminal vertical slice

Progress: project/evidence/proposal schemas, SQLite revision snapshots, durable jobs,
in-process discovery service, runtime adapter, and terminal create/show/answer/review
commands implemented. A two-round live ChatGPT interview preserved answers and an
accepted requirement across processes. Deterministic checks cover failures, stale
updates, cancellation, and restart/lease recovery. See
[terminal-discovery.md](terminal-discovery.md) for verification details.

M2 remains in progress: richer terminal help, explanation/recommendation requests,
requirement editing, and automatic service discovery are outstanding. The browser
now uses an authenticated loopback API; CLI commands still use the in-process facade.

Dependencies: M1 adapter path established. Covers RW-001, 003, 005–008, 011–012.

Work:

- M2.1 Define schemas for projects, evidence, questions, answers, decisions, and requirements.
- M2.2 Implement SQLite revisions, expected-revision writes, jobs, and restart recovery.
- M2.3 Implement local service lifecycle and the runtime adapter boundary.
- M2.4 Implement initial interpretation, question batches, and proposed requirement changes.
- M2.5 Add terminal project creation/opening, model selection, answering, and review.
- M2.6 Support custom answers, explanations, scoped delegation, and deferral.
- M2.7 Add meaningful fixtures and failure/restart checks.

Exit checks:

- Complete a small interview, restart, and continue without losing decisions.
- A changed answer retires irrelevant questions and leaves prior answers traceable.
- Malformed/stale model output does not overwrite newer project records.
- Provider/model switching preserves project state.

## M3 — Browser workspace and cross-client continuity

Priority changed by DEC-008: browser first; desktop packaging is deferred.
Implemented: React browser shell, same-store project selection, clickable answers,
requirement confirmation/rejection, epic map, discovery progress/cancellation, and
responsive layout. Playwright checks creation, answering without IDs, review, reload
continuity, and mobile overflow. See [browser-workspace.md](browser-workspace.md).

Dependencies: M2. Covers RW-002–003 and RW-017–020.

Work:

- M3.1 Add a local browser API and React interface using the shared service.
- M3.2 Add project/model selection, interview cards, explanations, and specification panel.
  Inline concept annotations and durable question-help panels (rephrase, rationale,
  example, decision support, follow-up) are implemented in the browser. Terminal help
  presentation and live qualification of explanation quality remain outstanding.
- M3.3 Add proposed-change review and visible pending/interrupted work states.
- M3.4 Verify cross-client continuity, stale-edit handling, and keyboard access.
- M3.5 Document the Windows browser run path. Desktop packaging follows after the
  browser discovery experience is validated with users.

Exit checks:

- Start an interview in either client and continue in the other.
- Simultaneous edits receive a conflict response rather than silently losing an answer.
- Both clients support the same persisted decisions and review actions.

## M4 — Research, scenario review, and readiness

Progress: opt-in source-backed webfetch was verified live; nine-area epic assessments,
deterministic coverage scoring, split/merge/move operations, confirmed-organization
review, map undo, bounded revision-aware task context, and automatic saved-response
grouping on overflow are implemented. Partial passes preserve global interpretation
and whole-area assessments. Websearch and
adversarial tool-budget/permission checks still need live qualification. Full scenario
review, conflict resolution, release baselines, and readiness gates remain pending.

Dependencies: M2 and M1 research recommendation; M3 required for full client verification.
Covers RW-009–010 and RW-013–014.

Work:

- M4.1 Implement bounded search/fetch research with source capture and question links.
- M4.2 Add applicable coverage templates and scenario-driven decision discovery.
- M4.3 Add conflict detection and acceptance-scenario gap review.
- M4.4 Add release scope selection, readiness findings, and explicit human baseline review.
- M4.5 Propagate revision changes to affected assessments and dependent records.
- M4.6 Expose findings, sources, unresolved decisions, and review actions in both clients.

Exit checks:

- Research findings reference retrieved sources and distinguish recommendation from fact.
- A failed retrieval remains incomplete and produces no invented source evidence.
- Seeded contradictory answers and missing critical behavior produce specific findings.
- Relevant changes make prior readiness assessments require review.
- Deferred or delegated choices retain scope and remain visible in the baseline.

## M5 — Implementation plans and portable handoffs

Dependencies: M4. Covers RW-015–016. Completes initial release functionality.

Work:

- M5.1 Generate requirement-linked phases and work packages with explicit dependencies.
- M5.2 Validate coverage, references, technical-task rationales, and dependency cycles.
- M5.3 Export revision-bound Markdown/JSON packages with a manifest and per-phase context.
- M5.4 Add export destination/collision handling to both clients.
- M5.5 Evaluate three contrasting ideas and build one small application in a fresh OpenCode session.
- M5.6 Record builder clarifications, guesses, acceptance outcomes, user effort, and available usage.

Exit checks:

- Every in-scope requirement maps to work and has acceptance scenarios where applicable.
- Exported packages identify their baseline and do not require the original chat.
- A relevant decision change marks affected plans for review.
- Exports contain no provider credentials and do not silently replace existing files.
- Publish the end-to-end evaluation, including failures and remaining gaps, before
  assessing initial release readiness.

## M6 — Integrated build pilot (follow-on)

Dependencies: M5 and an explicit target-workspace/execution design.

Work:

- M6.1 Launch an OpenCode coding session for one selected work package and workspace.
- M6.2 Stream build progress, cancellation, permission requests, and clarification questions.
- M6.3 Route requirement clarifications through discovery and identify stale build context.
- M6.4 Record verification commands/results against acceptance scenarios.
- M6.5 Distinguish planned, running, implemented, verified, failed, and interrupted work.

Exit checks:

- Complete one phase from the application and inspect its recorded verification evidence.
- A builder question can revise the specification and produce a revised work package.
- Model-reported completion alone does not mark a phase verified.

## M7 — Existing-project discovery and feature planning (follow-on)

Status: planned, not implemented. Follows DEC-014. The milestone number identifies
the backlog item; M6 integrated execution is not a dependency.

Dependencies: M4 review/baseline capabilities and M5 portable handoffs. Covers RW-021–022.
Initial scope is a local source folder and a one-time, read-only analysis; automatic
repository refresh/change detection remains later work.

Work:

- M7.1 Define folder selection, evidence retention, snapshot identity, file exclusions,
  and bounded inspection/context budgets, including non-Git and dirty working trees.
- M7.2 Capture documentation, source, tests, and configuration with file-linked evidence,
  an inspected/omitted manifest, and durable cancellable analysis jobs.
- M7.3 Propose goals, actors, epics, workflows, rules, integrations, and constraints;
  distinguish observed behavior, documented/tested intent, and inferred requirements.
- M7.4 Add human review and targeted questions for ambiguity, conflicting artifacts,
  incomplete workflows, and behavior the user wants to retain or change.
- M7.5 Discover one new feature against the reviewed baseline, identify affected areas,
  and produce change and preservation acceptance scenarios.
- M7.6 Export a change-focused handoff tied to the specification and source snapshot;
  evaluate it with a fresh coding session.

Exit checks:

- Import a small existing application, review its reconstructed requirements, specify
  one new feature, and export a handoff identifying affected behavior and preservation
  scenarios. Record builder clarifications and acceptance outcomes.
- Findings resolve to captured file evidence even after local source files change;
  exclusions and analysis limits remain visible.
- Conflicting documentation/code and missing intent produce reviewable questions;
  inferred behavior does not silently become confirmed intent or completeness credit.
- Initial import leaves target files unchanged and does not run project scripts.
- Malformed references, stale revisions, failure, cancellation, and restart preserve
  saved human decisions and never partially apply or automatically repeat analysis.
- The handoff clearly identifies its one-time source snapshot and unresolved impact
  assumptions; it does not imply synchronization with the current working tree.

## Immediate next work package

Try real ideas in the browser, calibrate the epic/coverage/context loop, and refine
requirement editing and material-change review. Then implement deeper scenario and
conflict review and an explicit release baseline before planning/handoff work.
Continue tracking the outstanding M1 checks in [runtime-spike.md](runtime-spike.md).
