# Milestone backlog

Status: M1 runner implemented and partially verified; remaining milestones planned. Requirements refer to
[product-specification.md](product-specification.md). Complete and verify each
vertical slice before expanding it. The integrated build pilot follows the initial release.

## M1 — OpenCode runtime integration spike

Progress: version-pinned runner, provider discovery, live ChatGPT JSON-text response,
streaming, cancellation, and completed-session recovery verified. Copilot quota and
native structured-output/recovery failures remain. See [runtime-spike.md](runtime-spike.md)
for evidence and outstanding checks; M1 exit criteria are not all met.

Dependencies: none. Covers RW-004–006; investigates RW-010 and the runtime/tool boundary.

Work:

- M1.1 Inspect installed runtime and current SDK interfaces; pin tested versions.
- M1.2 Create a minimal TypeScript integration runner with explicit provider/model selection.
- M1.3 Exercise supported GitHub Copilot and ChatGPT sign-in and model discovery.
- M1.4 Request a small schema-validated interpretation/question response with streaming.
- M1.5 Exercise cancellation, provider failure, and reconnection after process restart.
- M1.6 Inspect effective configuration/tool profiles and verify discovery can run with
  the intended tool restrictions. Identify a feasible source-backed search/fetch path.
- M1.7 Publish reproducible commands, results, gaps, and the adapter recommendation.

Exit checks:

- A live authenticated response succeeds through each requested subscription.
- Schema errors and runtime failures are surfaced; cancellation permits a subsequent call.
- Restart behavior and actual tool-profile behavior are recorded.
- Record model IDs and available usage metadata without recording secrets.
- Missing credentials may block a live check; report it as blocked, never as a pass
  based on a fixture. Continue independent implementation work where possible.

Deliverables: runnable spike, versioned runtime notes, capability report, and updated
technical decisions. Do not commit to full UI infrastructure before reviewing the result.

## M2 — Shared engine and terminal vertical slice

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

## M3 — Desktop client and cross-client continuity

Dependencies: M2. Covers RW-002–003 and desktop access to M2 behavior.

Work:

- M3.1 Add Electron shell and React interface using the shared local service.
- M3.2 Add project/model selection, interview cards, explanations, and specification panel.
- M3.3 Add proposed-change review and visible pending/interrupted work states.
- M3.4 Verify cross-client continuity, stale-edit handling, and keyboard access.
- M3.5 Document a Windows development/run path and verify a packaged desktop launch.

Exit checks:

- Start an interview in either client and continue in the other.
- Simultaneous edits receive a conflict response rather than silently losing an answer.
- Both clients support the same persisted decisions and review actions.

## M4 — Research, scenario review, and readiness

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

## Immediate next work package

Finish the outstanding M1 checks documented in [runtime-spike.md](runtime-spike.md).
In parallel with resolving external quota/compatibility limits, M2 schema and storage
work can use explicit JSON text with local validation as the demonstrated adapter path.
