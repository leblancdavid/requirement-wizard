# Explicit scoped-review execution pilot

Status, 2026-10-30: **explicit engine/provider/browser pilot implemented**. It executes the
[complete-evidence scope contract](definition-review-scope.md) with a durable one-request
ledger and explicit saved-result/reply recovery. A later [explicit provider bridge](definition-scope-providers.md)
now supports existing OpenCode/direct adapters with separate browser controls, but no ordinary
CLI start or coordinator registration. Alongside deterministic transports, a separate
qualification runner completed [three bounded live OpenCode scenarios](definition-scope-live-check.md).
Broader live behavior, human semantic sign-off and effective tool enforcement remain unqualified.
No scoped finding is published into the specification or used for automatic skips.

## Explicit boundary

`DefinitionScopeReviewService.review(projectID, { request, confirmAIUsage: true }, options)`
requires a strict separate authorization. Ordinary specification continuation, mode changes,
queue polling, startup and workspace reads never invoke it. Duration defaults to two
minutes and is capped at three. One new task reserves at most one adapter invocation;
reservation is an app attempt, **not** provider acceptance, billing or proof of inference.
There is no retry loop, model fallback, tool/session API, research dispatch or new grant.
The duration clock starts after admission; initial preparation is bounded by bytes/
records rather than a whole-call wall-clock deadline. Large-project preparation latency
has not been qualified.

The injected adapter receives the complete packet, an abort signal, the exact project
model/account selection, `research: false` and `tools: false`. These interface constraints
are not qualification of a future provider permission profile. An adapter must not treat
them as permission to run coding/tools or choose a different provider. No credentials are
loaded/copied by this service. The provider bridge is constructed separately and is not
implicitly enabled by creating the service or opening a project.

Admission uses existing job/execution/workflow coordination plus paused workflow/maintenance
and resolved saved input. Active/expired execution leases, other live discovery and
unfinished input block new work without spending requests. Existing completed-result
reads can still reuse exact same-input evidence without a new task or grant. Completion
itself starts no response processing, ordinary discovery, research, planning or coding.

## Original witnesses and durable recovery

SQLite 19→20 adds local `definition_scope_reviews` and recognizes job kind
`definition-scope-review` with a strict `definitionScopeReview` context marker.
Run policy `definition-scope-run-v1` records:

- Exact request/project/revision/snapshot, scope/context keys and explicit authorization.
- One-request reservation, original job/model/context manifest, original revision snapshot.
- A separately saved validated response and its original observation date.
- A validated output-only result and completion date, or a root-job link for no-call recovery.

The original project snapshot already exists in revisions; no present-day inputs are
rebased onto old evidence. Before dispatch, response save, finish or reuse, the engine
rebuilds the exact v1 packet from bounded authoritative snapshots and verifies its saved
job/model/context witnesses. This v1 builder/document/instruction must remain reproducible
across future compatible upgrades. Equivalent representation changes need an explicit
migration/compatibility solution, not fresh model calls to replace original evidence.
Hashes bind local content; they are not signatures or independent provider authentication.

A request is reserved atomically **before** invoking the adapter. A returned valid reply
is saved before completion, so failed completion can be retried explicitly without another
request. Finish re-verifies current content, citations/dimensions/concerns, root witness,
lease and deadline, then commits result and completed job together. Failure rolls back
both; the prior returned reply remains durable. No project revision, finding, confidence,
approval, plan/check/run/delivery evidence or implementation compatibility certificate is
rewritten. Results retain `validated-output-only` authority and cannot publish/authorize
skips or further requests.

Repeating the confirmed exact request returns a completed task unchanged. If a valid reply
survived failed/cancelled/interrupted completion, a new local task links the original root
reply/date with **zero adapter invocations**. The earlier reserved attempt stays spent.
The latest exact task is checked; missing, changed, unsupported or forged original/root
witnesses block without choosing an older substitute or silently requesting again.

Cancellation/deadline races settle even adapters that ignore the signal; late replies
cannot mutate saved state. A task without a saved reply needs a new explicit authorization
for another one-request attempt. An expired task with a valid saved reply can recover
explicitly; live original workers cannot be stolen, and other workers' live leases are
preserved. Startup itself does not resume/claim work or repeat inference. Provider-side
cancellation remains unqualified.

## Storage and application boundaries

Each checkpoint is bounded to **192 KiB**, including response/result. Source snapshots
keep the 16 MiB limit; core envelope/packet/reply limits remain unchanged. No evidence is
truncated to obtain a successful scope. Startup validates supported run/marker shapes,
job/project/revision/key identities and missing checkpoints, without whole-history replay.
Explicit operations re-verify original snapshots and full root/context witnesses.

The additive ordered migration rewrites no old row, project/execution counter, semantic
key, grant, original review, completed plan or existing job. Execution schema remains 2;
portable and usage-report formats are unchanged. No backup/backfill or model call is needed
for unchanged old payloads. Older apps reject SQLite 20 before consuming the new job kind.
Transactional migration/startup failure rolls back schema/ledger advancement; unknown future
run/marker formats reject without overwrite and can retry after supported data is restored.

Raw scoped jobs/checkpoints are local-only and excluded from portable continuation. The
later mixed-assessment reader can retain bounded original source observations inside a
format-3 assessment declaration, not as raw jobs, sessions or publication authority.
Complete evidence means available captured project state, not exhaustive knowledge of
the external product/codebase. This pilot does not initialize folders or prove missing
external evidence absent, and cannot override existing initialization/publication gates.
Adoption rejects a scoped marker disguised as ordinary discovery. Generic discovery finish
and resume cannot consume scoped work. Browser snapshots keep the previous ordinary
discovery coverage baseline; Logs label these jobs **Scoped finding review**, not discovery
rounds. Existing usage export does not count this new task family or invent savings from it.

## Browser authorization and readonly status

Overall progress exposes explicit output selection, exact-selection status inspection,
fresh consent, start, dated results and owned Stop. Strict authenticated POST routes are
`definition-scope-start`, `definition-scope-status` and `definition-scope-stop`; start/status
use app-owned strict contracts, and Stop requires the exact job UUID owned by this queue.
The queue serializes against other active work and pauses automatic saved-response processing;
completion never chains further work. Server startup constructs the provider bridge but
construction, snapshots and status reads dispatch no requests.

Status projects bounded run fields plus a small job marker without reading source/revision
history, checking semantic freshness, claiming a lease or invoking a model. Invalid/oversized
checkpoints, inconsistent completion or identity mismatch return unavailable rather than
falling back to older evidence. Non-exact reads conservatively fail if any project checkpoint
is unreadable. Expired live status is displayed as interrupted without rewriting the job.
Browser ownership is ephemeral queue state, never saved provenance.

Only acknowledged/explicitly loaded live tasks poll while controls remain open. Reload needs
explicit loading; closing controls does not stop the worker. Ambiguous start acknowledgement
retains the attempted exact request, blocks starts/latest-task substitution, and permits only
explicit status inspection before fresh consent. No automatic write replay occurs. Results
remain escaped dated output, never an assessment/implementation compatibility certificate.
See [browser workflow](browser-workspace.md#scoped-review-browser-pilot-2026-10-30).

Browser exposure changes no persisted payload, semantic key or version: SQLite **20**,
execution **2**, usage export **2**, portable formats unchanged. Existing completed results
and original reply dates survive unchanged; no backfill, reset or requalification call is needed.

## Remaining gates

- An [offline/opt-in qualification harness](definition-scope-qualification.md) is implemented;
  its structural checks are not semantic-quality qualification. One live retention-choice
  observation plus privacy/quoted-instruction runs are recorded, with human sign-off still pending.
- The provider/runtime bridge is implemented with fixture-checked no-tools/research
  restrictions; effective live permission/profile and subscription behavior remain unqualified.
- Human-reviewed live semantic quality and bounded larger-project behavior.
- An [original-finding provenance foundation](definition-scope-provenance.md) now verifies
  completed/root witnesses readonly, without new saved metadata. Persisted assessment
  reader representation and a pure consistency contract now exist in the
  [mixed reader foundation](definition-mixed-assessment.md); durable source/task verification
  and actual preview/apply remain separate.
- A sound narrower evidence contract before automatic finding-level reuse. Keeping complete
  evidence and selecting outputs does **not** establish independence or request reduction.

```powershell
npx tsx --test src/service/definition-scope-review.test.ts src/core/definition-review-scope.test.ts
```

Earlier engine-only verification, 2026-10-30: type check, **1,309** deterministic tests (605 pretests +
704 main), focused scope/joint/migration/portable checks, UI build, all thirteen default
browser runs and diff check passed. Pilot-specific checks cover explicit consent/model
binding, completed reuse/reopen, saved-reply recovery, cancellation/timeout/late output,
malformed/stale replies, atomic completion failure, changed/orphan witnesses, live/expired
workers, preserved other leases, paused automation/unfinished-input admission, portable/
ordinary-resume/publication exclusion, unchanged browser coverage baseline and 19→20
preservation/failure/retry/future-format rejection. The browser aggregate protects existing
workflows; it does not qualify a new scoped-review UI or default provider. No live calls,
commits or pushes. Existing bundle-size warning and live/semantic/performance gates remain.

Browser slice verification, 2026-10-30: type check, **1,334** deterministic tests
(630 pretests + 704 main), UI build, all **fourteen** default browser runners, the focused
scoped browser runner and diff check passed. New checks cover strict auth/origin/consent,
exact project/job/request isolation, no-call reuse/recovery/restart, foreign Stop rejection,
expired readonly status, coordinator exclusion, damaged/oversized/future checkpoints and
completion consistency without history replay. Browser checks exercise status-first consent,
escaped output, running reload/owned Stop, explicit cancelled retry, cross-dimensional
concerns, lost start acknowledgement without write replay, stale evidence and keyboard/mobile
layout, with unchanged decisions, assessments, automation settings and implementation state.
The first aggregate attempt exceeded its two-minute command timeout; the complete rerun
passed. No live inference/authentication/tool probe, commit or push. Existing bundle-size
warning and live semantic/provider/performance gates remain.
