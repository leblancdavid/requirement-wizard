# Architecture outline

Status: proposed technical design. Validate the runtime boundary in milestone 1
before building the full clients. See [decisions.md](decisions.md).

## Components

```text
Electron / React desktop       Ink / React terminal
             \                    /
               Local service API
                       |
              Requirements engine
             /         |          \
       SQLite       Job runner    Exporter
                       |
                 Runtime adapter
                       |
              OpenCode server / SDK
                       |
                Copilot / ChatGPT
```

TypeScript is shared across the service, schemas, and clients. Neither client owns
requirements logic or writes directly to SQLite. A local service serializes writes
and streams job events. Desktop and terminal attach to the same user-local service;
startup discovers an existing compatible instance or starts one.

Use a loopback-only endpoint with a per-installation access token (or an equivalent
authenticated local transport). Establish the exact transport and lifecycle in
milestone 2. Do not expose the local service as a public server.

## Engine workflow

```text
Analyze → Identify gaps → Research when needed → Propose questions
    → Await answers → Propose record changes → Review → Repeat
    → Assess selected release → Human baseline review → Plan → Export
```

These are durable job/interaction states, not one endless model conversation.
Human answers are persisted before follow-up model work begins. The engine assembles
context from relevant project records and sources; the transcript is retained as
evidence rather than being the only source of truth.

Question selection combines applicable coverage templates, model gap analysis, and
research findings. Start with a simple impact/uncertainty/dependency rubric. Store
why questions were asked, resolved, deferred, or retired.

## Runtime adapter

Expose application-level operations for:

- Runtime discovery, compatibility, and connection status.
- Provider/model listing and supported authentication handoff.
- Structured requests with explicit context, schema, model, and tool profile.
- Streaming progress, results, errors, and available usage metadata.
- Cancellation, session lookup, and reconciliation after interruption.

OpenCode sessions execute model/tool work. Application IDs and specification revisions
remain independent of runtime session IDs. Store mappings for diagnostics and recovery.

Pin and document the SDK/runtime versions used in the spike. Check capabilities rather
than assuming every documented endpoint works on the installed version. The documentation
review establishes a plausible path, not verified compatibility.

Provider connection flows should use supported OpenCode interfaces. Do not parse or
copy its credential file. If embedded auth cannot be supported through the selected
API, launch the supported connection flow and refresh provider status afterward.

Discovery uses a restricted tool profile: source retrieval and application-controlled
project operations. The later coding adapter operates against an explicitly selected
target workspace. Verify how OpenCode configuration and inherited instructions affect
these profiles during the spike.

Search is a separately configured capability. Establish a search/fetch integration
with source capture; do not assume that subscription access includes web research.

## Storage and revisions

Initial record families:

| Family | Examples |
| --- | --- |
| Project and release | Project, scope selection, baseline review |
| Evidence | Human message, answer, source document, research finding |
| Specification | Goal, actor, workflow, requirement, acceptance scenario |
| Discovery | Question, option, assumption, decision, conflict, coverage item |
| Execution | Job, model call, runtime session mapping, usage |
| Planning | Readiness assessment, phase, work package, export manifest |

Use stable logical IDs with versioned content and typed relationships. Records have
type-specific statuses; a proposed requirement and a running job do not share one
generic status vocabulary. Start with relational metadata/links and schema-validated
JSON payloads for evolving content.

Write record changes, revision metadata, and job checkpoints transactionally. Apply
model proposals only after schema/reference validation and expected-revision checks.
Keep a reviewable change set rather than granting the model unrestricted database writes.

If a user changes an answer while analysis runs, mark the result stale and regenerate
or explicitly reconcile it. Never apply it automatically to a newer revision.

On restart, reconcile pending/running jobs with runtime state. Preserve completed
results, mark unrecoverable interruptions, and offer an explicit retry. Use operation
IDs to avoid duplicate local updates; do not assume remote calls execute exactly once.

## Change impact

Relationships connect decisions to workflows, requirements, scenarios, and work
packages. Revision invalidation marks dependent assessments and plans for review.
Dependency traversal can identify candidates for review; it does not prove semantic
impact completeness. Model analysis may propose additional affected records.

## Export boundary

Export one versioned manifest plus Markdown and JSON artifacts. The manifest records
the project, selected release, baseline revision, and included record IDs. Every work
package references this manifest and includes enough context to stand alone in a fresh
coding session. Omit credentials and unrelated interview content.

## Suggested source layout

```text
apps/desktop/          Electron shell and React interface
apps/terminal/         Ink interface
packages/core/         Schemas, discovery, review, planning
packages/service/      Local API, persistence, durable jobs
packages/runtime/      Runtime contract and OpenCode adapter
packages/export/       Markdown/JSON handoffs
fixtures/              Synthetic interviews and runtime responses
```

Create packages as milestones require them; avoid empty scaffolding in advance.

## Verification strategy

- Engine checks: revisions, stale results, provenance, dependency cycles, readiness rules.
- Workflow checks: interruption, resumption, changed answers, contradictory inputs.
- Client checks: keyboard operation and the same project continued across clients.
- Live compatibility checks: both requested subscriptions, structured output, cancellation,
  restart, available research tools, and tool profile behavior.
- Product evaluation: a fresh builder consumes an export and executes acceptance scenarios.

## Documentation consulted

Reviewed October 15, 2026; implementation must verify installed-version behavior.

- https://opencode.ai/docs/sdk/
- https://opencode.ai/docs/providers/

Prior Lykoi work in `D:\Dev\axiom` informs provenance and behavioral decision discovery.
This application does not depend on its compiler or experimental runtime.
