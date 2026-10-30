# Data migrations and upgrade compatibility

## Definition storage-order compatibility (2026-10-29)

**Implemented forward migration:** SQLite **12 → 13**, named
`definition-persistence-order-v1`. Execution remains schema 2; project/portable,
assessment and exact-stage formats are unchanged. The v1 definition digest algorithm
is byte-compatible. Previously, new requirement/question/research object property
ordering could produce a review key that disagreed with the schema reader immediately
after saving, falsely dating a review at its own revision.

New rounds normalize evidence property order before stamping assessments, rejecting
any field, value or array-order conversion. Upgrade repairs only existing
`inputBasis.key` values when the exact raw original revision reproduces the old hash,
the original finding and identities match, and the raw/parsed digest documents differ
only in object-property ordering. It does not hash today's decisions as old evidence.
Real input changes remain outdated; this is not finding-level semantic reuse.

Each changed current project payload is backed up byte-for-byte in
`project_migration_backups` (migration 13). Only key metadata is changed in the decoded
current row; immutable revision history stays byte-for-byte unchanged. Project revision
counters, approvals, plans, jobs, exact-stage contexts/receipts, attempts, grants and
execution leases/evidence are not rewritten or reset. Repaired workspace bindings are
marked dirty for normal publication. Unknown fields/default/value conversions in a
current row prevent its rewrite. Missing, ambiguous, mismatched or oversized original
data remains unproved, with no truncation or substitute snapshot. Current/original
snapshots are capped at **32 MiB** each; at most two prepared sources are cached per
project. Large-project startup performance remains unqualified.

Migration runs in the ordered upgrade transaction: failure rolls back payload changes,
backups and schema/ledger advancement; reopening retries safely. Unsupported current
formats reject instead of being overwritten. Live non-help discovery jobs and workflow
owners block upgrade without stealing leases. Stop/finish them in the existing app or
wait for lease expiry, then reopen; upgrade never repeats model calls. Execution leases
remain untouched. Reopening after success does not repair again or duplicate backups.

Impact inspection projects a proved original key only in memory, within its existing
16 MiB bound. Explicit historical recovery labels that projection `derived`; restoration
retains original findings and uses its normal revision/consent gates. Original history
is never rewritten. Older portable exports whose raw original ordering witness was
already lost remain unproved; current parsed inputs cannot manufacture that provenance.
New exports from repaired projects retain compatible current evidence.

Verification: type check, all **1,115 deterministic tests** (416 pretests + 699 main),
UI build, default seven-runner browser aggregate, focused ordering-upgrade, finding-impact,
definition-refresh allowance and coordinated-workflow browsers, and diff check passed.
One repeat aggregate exceeded the 120-second command limit; its full retry with a
300-second limit passed all seven browser runners.
The 16 new ordering tests cover immediate/reopened freshness, frozen v1 hashing,
ordering proof rejection, exact backups, genuine staleness, missing/unmodeled/ambiguous
current data, oversized originals, rollback/retry, approved-plan and portable preservation,
exact-stage replay with spent attempts, historical recovery and live-worker preflight.
The ordering browser uses real v12-shaped data and verifies unchanged evidence/revision,
explicit comparison, genuine-change invalidation, reopen/mobile and zero inference.
Screenshot: `.reqwizit-state/browser-definition-order-upgrade-mobile.png`.
No live model calls, personal-project migration, commits/pushes or desktop packaging
were performed. `test:browser:all` was not run. The existing UI bundle-size warning,
missing older-portable witnesses, fine-grained semantic reuse and live large-project
upgrade performance remain unresolved or unqualified.

## Finding-level impact inspection (2026-10-29)

**View-only addition; no forward data conversion.** Source/target SQLite remains
**12**, project/portable formats remain unchanged, execution stays schema 2, policy
stays format 1 and assessment/checkpoint fingerprints and CAS counters are unchanged.
No existing row, original evidence, approval, history, grant or spent attempt is
rewritten. The new format-1 `definition-finding-impact-v1` response is not persisted,
exported as authority or used to determine freshness/readiness. Upgrade requires no
reset, new assessment or repeated model call. Existing get() legacy basis projection
is unchanged; the inspector intentionally reads raw bounded current/original snapshots
without invoking that projection or persisting another representation.

The explicit authenticated/revision-checked read compares one original review snapshot,
not an unbounded archive. It verifies exact finding provenance and retained bases,
enforces 16 MiB snapshot / 8,000 record / 64,000 reference bounds, and leaves unknown
or ambiguous dependencies unknown. No earlier candidate substitutes for an invalid
source, and no evidence is shortened. Unchanged cited links with changed full context
do not become reusable independent findings. No workers, leases, model calls, settings
or publication operations start during inspection. Missing imported history remains
missing; original dated evidence and existing current/outdated statuses are preserved.

The UI binds results to the inspected version and a view-only content digest, so
equal-numbered adoption/replacement dates an earlier result too. Optional lazy legacy
input-basis representation is handled separately; these tokens are not new review
identities. The loopback snapshot cache now validates projected project content as
well as revision before reusing coverage/project objects. This fixes stale browser
evidence after equal-numbered replacement without changing the underlying saved
assessment rule. Unchanged content still reuses encoded sections. Content validation
adds a per-read fingerprint; live large-project performance is not qualified here.

Automatic finding-level dependency certificates/reuse and delta-only reviews remain
unfinished; the current fallback is the existing complete-area review. This is not a
claim of calls saved, semantic equivalence or completeness. See [finding impact](definition-finding-impact.md).

Verification on Node 22.23.4: type check, all **1,099 deterministic tests** (400
pretests + 699 main), UI build, focused finding-impact, workflow and both Manual/
Guided browser checks and diff check passed. New tests cover uncited area/dependency/
project-wide additions, unrelated edits, changed answers/reviews, superseding cycles,
missing/ambiguous findings, current/original byte and graph bounds, legacy raw-byte
preservation/reopen, active-worker reads, authorization/stale requests and same-numbered
snapshot/coverage invalidation with unchanged-section reuse. The finding browser covers
explicit/keyboard inspection, no request on selection/open/poll/reload, changed links
versus unchanged citations, same-version replacement, stale concurrent requests,
unavailable origin and mobile (`.reqwizit-state/browser-definition-impact-mobile.png`).
The default browser aggregate initially stopped at its old eight-panel progress count;
the assertion now includes the ninth read-only inspector and checks it starts closed.
The final default seven-runner aggregate passed. No live inference, personal-project writes, application-
repository commits/pushes or desktop packaging were performed; `test:browser:all` was
not run. Existing bundle warning remains, and automatic fine-grained reuse plus live
large-project performance remain unqualified.

## Guided processing consent (2026-10-29)

**Implemented forward migration:** SQLite **11 → 12**, named
`guided-processing-consent-v1`, establishes the compatibility boundary for the explicit
`guided` value in the existing strict format-1 processing policy. Source rows must be
supported format-1 `legacy`/`manual`; an unsupported source value cannot manufacture
opt-in to a mode the older app never offered. No tables/columns/payloads are rewritten,
no schema fields/defaults change, and absent policy remains legacy compatibility.
Old policy/settings CAS values, grants, attempt ledgers, sessions, evidence/history,
approvals, readiness, plans and freshness identities remain exactly as saved. Project,
execution and portable formats are unchanged. No reset or repeated model call is needed.

The boundary/ledger and validation run transactionally. Unsupported source/future
formats reject without overwrite and roll back user_version/ledger changes; reopening
retries after the specific incompatibility is resolved. Repeated success does nothing
more. Upgrade is compatible with retained live execution leases because it converts
no worker-owned state; owners, expiry and spend stay untouched. Older apps reject
SQLite 12/new Guided values rather than silently stripping consent. Guided is selected
only by the authenticated revision/policy/settings-CAS-checked settings action after
upgrade, never inferred from old preferences or switched on during startup.

Selecting Guided starts/arms no work and renews no allowance. Every actual mode switch
now pauses input queue/coordinator/maintenance and advances their settings counters
atomically, retaining original enabled flags, queued tasks, grants and spend. Active
work/pending jobs and live or expired execution leases still block changes without
being stopped/stolen. Merely selecting Guided does not rewrite the coordinator's
saved enabled flag; the view projects effective coordination to expose its explicit
Continue action. Continue remains the existing independent coordinator opt-in/grant.

New browser responses in Guided are eligible for that coordinator even if the separate
browser preference is off; original saved flags are never rewritten or reinterpreted.
Eligible responses can resume only remaining live-session allowance. Saved-only input
requires explicit continuation, and Stop/limits/failure/restart never renew authority.
SQL wake selection, queue/maintenance guards and atomic automatic-job creation prevent
independent workers from bypassing Guided, including in other processes. Separate
maintenance resume or disabling only the coordinator rejects while Guided is selected.
Explicit scoped tasks retain their own established permission and limits; narrow
saved-response processing captures a finite selected-feature set under Manual/Guided.
Research, scans, planning, coding, commands and delivery remain separately authorized.
Policy remains machine-local/nonportable; original browser preferences and other
projects are unchanged. See [mode guidance](processing-permissions.md).

Verification on Node 22.23.4: type check, all **1,085 deterministic tests** (386
pretests + 699 main), UI build, default seven-runner `npm run test:browser`, both
Manual/Guided processing browsers, focused workflow/maintenance browsers and diff
check passed. A final migration/workflow/API rerun passed after tightening rejection
of pre-boundary Guided rows. Guided browser checks cover keyboard selection versus
explicit save, no work before continuation, a live decision wake-up using the same
grant, retained browser opt-out/spend, mode switches, restart and 44px mobile labels
(`.reqwizit-state/browser-guided-processing-mobile.png`). Its settings switch waits
for the displayed current revision; no stale-write check was weakened to bypass
concurrent completion. Service tests allow active time spent checking saved-only
permission to decrease remaining time, but never renew it or spend model requests.
Upgrade tests compare original policy/settings/evidence/receipt/lease rows byte-for-
byte across 11→12 and repeated startup, cover unsupported-source/future rejection and
rollback/retry, and exercise stale cross-process settings/atomic dispatch. Exact
finding-level reuse and broader cross-operation reports remain unfinished. Existing
bundle warning remains. No live inference, personal-project writes, application-
repository commits/pushes or desktop packaging were performed; `test:browser:all`
was not run.

## Bounded specification run receipts (2026-10-29)

**Implemented forward migration:** SQLite **10 → 11**, named
`bounded-specification-run-receipts-v1`, adds indexed machine-local `workflow_runs`
records keyed by project/worker UUID. Strict format-1 payloads hold grant identity,
starting revision/snapshot digest/time, initial spent allowance, reserved attempts,
job references and an optional observed ending summary. Workflow JSON remains format
1; project/execution/portable formats, assessment fingerprints and existing CAS
counters are unchanged. Upgrade rewrites no grants, history, checks, plans, sessions,
approvals or attempts. It creates no historical receipts and triggers no inference.
No reset, reassessment or repeated provider call is required.

Migration/table/index/ledger changes are transactional. Validation of incompatible
saved data rolls back the upgrade; reopening retries after that specific issue is
resolved. Unsupported future receipt formats/identity mismatches reject without
overwriting their payloads. Repeated startup preserves original receipts and spend.

A worker claim and receipt start commit atomically. Every request reservation is
recorded in the same transaction as its existing allowance CAS, before model dispatch;
missing/conflicting/foreign receipts reject without spending or dispatch. Normal owned
release captures final phase, revision, outcomes for attempted jobs and net record
counts between exact snapshots, then releases the worker in the same transaction.
An expired/lost owner, missing/replaced starting snapshot or inconsistent grant cannot
fabricate a successful ending observation. Incomplete runs retain known attempts and
show an explicitly incomplete summary on read. Neither startup nor receipt inspection
repeats calls, changes permissions or claims readiness. Recorded endings stay immutable
through later human edits, repeated release and reopen.

Counts are observable net changes, including proposals and any human edits—not AI
attribution, approvals, cumulative intermediate edits or measured requests saved.
Current pending work is separately revision-labelled. A worker pass may stop for a
decision and later resume the same remaining grant as a new pass; its receipt counts
only its own reservations. Reservations are not provider billing totals. Receipts do
not cover manual tasks, multiple passes or implementation/delivery, and are not exported
as portable authority. All rows are retained; only the indexed latest is currently
presented. Existing job/evidence ledgers remain authoritative for recovery and reuse.

Verification on Node 22.23.4: type check, all **1,075 deterministic tests** (380
pretests + 695 main), UI build, focused workflow/Manual/maintenance browser checks,
CLI/spike help smoke checks and diff check passed. The workflow browser covers
multi-step summaries, keyboard-opened record details, zero-call inspection,
restart retention, separate current follow-through and an explicitly incomplete
expired-worker summary on mobile (`.reqwizit-state/browser-workflow-incomplete-run-mobile.png`).
Deterministic tests cover multiple jobs per pass, later wake-ups within the same
grant, net versus intermediate edits, no invented reuse/success, Stop/failure,
reserved-attempt atomicity, foreign/missing receipts, lost/expired owners, exact
starting-snapshot mismatch, unmatched spend, immutable endings through later edits/
release/reopen, source-10 upgrade without backfill, future-format rejection and
transactional rollback/retry. The default seven-runner browser aggregate also passed
on its final presentation rerun. The existing bundle-size warning remains. Broader automatic modes,
multi-pass/cross-operation receipts and explicit reused-check provenance remain
unfinished. No live inference, personal-project writes, application-repository
commits/pushes or desktop packaging were performed; `test:browser:all` was not run.

## Project-local Manual processing (2026-10-29)

**Implemented forward migration:** SQLite **9 → 10**, named
`project-manual-processing-policy-v1`, adds `processing_policy(project_id, payload)`.
Format-1 JSON contains independent CAS `version` and `mode: legacy | manual`.
Absent rows mean legacy compatibility, not newly granted automation. Upgrade creates
no policy rows and rewrites no project revisions, preferences, grants, attempts,
jobs, assessments, execution state, workspace or portable artifacts. Execution schema
remains v2. Existing evidence/fingerprints stay valid without repeated model calls.

Migration and ledger/schema updates run in the existing immediate transaction.
Validation failure rolls back the new table/ledger; reopening retries after the
specific incompatible data is resolved. Unsupported future policy formats reject
without overwriting the payload. Successful reopening does not repeat conversion.
Policy remains machine-local and per-project, outside versioned project snapshots/portable exports;
browser-wide saved-input preference remains unchanged.

Entering Manual is an explicit authenticated settings write, checking project revision,
policy CAS and workflow/maintenance settings versions together. Active queue/workflow/
implementation work, pending/running non-help jobs and live or expired execution
leases block the change without stealing workers or changing their allowance.
The transaction pauses saved-input dispatch, coordinator and maintenance, retaining
original enabled flags, grants, tasks and response permissions. Atomic automatic-job
creation rejects under Manual. Explicit tasks still use their existing safety gates;
explicit saved-input runs capture a finite starting set, restore queue pause afterward,
and Manual coordination disarms at its next decision/pause. Plain approvals need no AI.
Returning to legacy keeps work paused and starts no requests or renewed allowance.

This qualifies only the Manual narrowing slice, not unified automatic modes, safe
finding-level incremental rechecks, whole-operation receipts or live coding/delivery.
Verification on Node 22.23.4: type check, all **1,065 deterministic tests** (375
pretests + 690 main), UI build, default seven-runner `npm run test:browser`, focused
Manual/workflow/maintenance browser checks and diff check passed. Final targeted
workflow/migration rerun also passed after tightening the selected-feature finite
scope. Tests cover unchanged legacy routing, preserved original opt-ins/evidence/
grants/spend, stale project and independent settings versions, other projects,
pending workers, live/expired execution leases, cross-process atomic dispatch,
finite explicit input sets, no Manual coordinator wake after decisions, explicit
continuation, no restart on returning to legacy, repeated startup, future policy
rejection and migration rollback/retry. Browser checks cover inspection/radio versus
explicit save, concurrent settings conflict, retained browser preference, reload,
save-only response routing and mobile layout; the new screenshot is
`.reqwizit-state/browser-manual-processing-mobile.png`. Existing bundle warning
remains. No live inference, personal-project writes, application-repository commits/
pushes or desktop packaging were performed; `test:browser:all` was not run.

## Implementation reuse across assessment recovery (2026-10-29)

**Implemented forward migration:** SQLite **8 → 9**, named
`implementation-recovery-revisions-v1`; execution JSON **schemaVersion 1 → 2**.
Schema versions remain separate from project revisions and execution CAS `version`.
Migration backs up each old execution payload once in `execution_migration_backups`
with migration 9, validates all rows before replacing any, and commits payloads, CAS
increments, dirty-workspace flags and the migration ledger transactionally. Failure
rolls back; reopening retries. A repeated successful startup does not migrate again.
Live execution leases block the conversion without changing their owners/allowance;
expired leases are retained. Unsupported future formats reject without overwrite.

The v1-to-v2 representation change preserves all original assessment/plan/run/delivery
records, settings, histories, semantic hashes, dates, approvals, sessions, completed
steps and spent attempts. No specification revision, human source or model call is
created by migration. Each changed execution row's CAS counter advances once to reject
old readers, independently of its new schema version. Older databases upgrading through
the existing original assessment-identity migration also reach v2 while preserving its
historical source backup and compatibility rules. No reset or reassessment is required.

**New optional field:** `execution.recoveryRevision`, format 1, policy
`assessment-recovery-only-v1`, with `fromRevision`, `throughRevision` and SHA-256
`inputKey`. Upgrade alone adds no certificate or invented ancestry. An explicit missing-
assessment restore issues/extends it only after proving that the full project inputs
are unchanged except assessment history, revision, receipt prose and local discovery
routing; routing is additionally checked unchanged during the restore operation.
All other product fields remain in the frozen `assessment-recovery-inputs-v1` digest.
Configuration/workspace/model/code/manual-recheck gates remain independent.

Restoration atomically commits the certificate/execution CAS update with its ordinary
project revision and Activity receipt. It does not rebase the original evidence or
edit immutable historical snapshots. Contiguous recovery-only revisions preserve
otherwise-current plans, paused-run revision matching and legacy code-assessment
revision fallback. Modern assessment/delivery identities are unchanged. An ordinary
revision ends the interval; later recovery cannot bridge across it or revive already
stale evidence. Runtime publication/CAS checks still require the actual current revision.

**Portable compatibility:** wrapper versions and definition-assessment formats stay
unchanged. `execution.json` emits execution schema v2; the reader accepts old schema v1
and projects it forward without inference or fabricated certificates. Certificates
survive export/adoption, with strict format/range/current-input validation. Local
discovery routing may differ on adoption; implementation configuration/evidence remain
original. Sessions retain their existing machine-local boundary. Older apps reject
database v9/new portable execution v2 rather than silently stripping the certificate.

The old blanket saved-implementation blocker is removed. Active/pending jobs, live or
expired execution leases, busy workflows, unpaused automatic settings and unresolved
saved input still block apply without stopping work, releasing leases or granting
calls. This qualifies local recovery/reuse, not new live coding, provider subscription
compatibility, in-flight session recovery or GitHub delivery. See
[recovery guidance](assessment-history-recovery.md).

Verification on Node 22.23.4: type check, all **1,054 deterministic tests** (368
pretests + 686 main), UI build, default seven-runner `npm run test:browser` and diff
whitespace check passed. New tests cover approved/proposed/interrupted work, consecutive
recovery, already-stale work, exact-stage receipt/attempt preservation, frozen-run
continuation with fixture Git responses and zero coding requests, actual-decision
invalidation, transactional restore/upgrade failure and retry, repeated startup,
source-payload backups, lease preservation, portable adoption and invalid/future
certificates. Browser recovery now includes an existing approved plan and a legacy
code assessment, checking retained reuse after restoration/reload on mobile without
model calls. Legacy planning-cache upgrade fixtures now rewind newer ledger entries
and accept future-format rejection at the new migration boundary; their rollback and
evidence-preservation assertions remain. Existing bundle warning remains. No live
inference, personal-project writes, application-repository commits/pushes or desktop
packaging were performed; the separate `test:browser:all` command was not run.

## Preserve active review drafts and disabled-control identity (2026-10-29)

**UI-only fixes; no forward data conversion.** Source and target SQLite/JSON/portable
formats, optimistic revisions, semantic assessment/checkpoint identities and saved
permissions remain unchanged. The review view now makes its implicitly selected card
explicit when someone edits its note/change request or opens Request changes. Polling
can still display updated evidence and stale-review warnings but no longer hides the
edited card by automatically choosing a different ready item. Explicit navigation and
successful submission retain their normal advance behavior. Drafts stay browser-local;
this change introduces no persistence, startup rewrite or reset requirement.

The shared disabled-button wrapper now preserves a missing React key as `undefined`
instead of explicitly passing `null` (which React stringifies to `"null"`). Sibling
controls no longer collide during busy/ready reconciliation or leave stale disabled
DOM controls alongside enabled ones. Original explicit keys, focusable disabled
explanations and action guards remain. No requests, saved evidence, completed work or
leases are reinterpreted. Reopening the application needs no reassessment/model calls.

The browser test migration follows existing responsibilities rather than adding a
second editor or diagnostics view. Removed reports are checked at their current UI
destination; original receipt preservation is verified separately in storage when Logs
intentionally exposes only bounded metadata. The explicit saved-response size-block
retry now exercises the existing exact-batch continuation instead of asserting that
supported legacy blockers can never be retried. No retry budget is reset.

Verification on Node 22.23.4: type check, all 1,044 deterministic tests (358 pretests +
686 main), UI build, default seven-runner aggregate `npm run test:browser`, focused
reliability/workflow/planning browsers and diff check passed. The new focused draft
runner checks notes, change-request-only drafts and newly opened forms through actual
poll updates, mobile editing, unchanged decisions and zero inference. Portable checks
hold each of three checkpoint responses to verify one disabled control per action,
then exactly one enabled control after completion, retaining the project unchanged.
The former Project map aggregate blocker is resolved for this command. The separate
broader `test:browser:all` command was not run; no live inference, personal-project
writes, desktop packaging, commits or pushes were performed. Existing bundle-size
warning remains. Protected implementation-state history recovery was still unqualified
at that checkpoint; the recovery-certificate entry above records its later local checks.

## Explicit missing-assessment history recovery (2026-10-29)

Historical first-slice contract. The later recovery-certificate entry above supersedes
its blanket implementation blocker and records the execution/SQLite forward migration.

**Opt-in additive recovery, not a startup migration.** Source: existing saved revision
assessment arrays (including legacy records without `inputBasis`). Target: the same
assessment format in a new ordinary project revision. SQLite/schema versions,
portable formats, semantic fingerprints and concurrency rules are unchanged. No reset
or repeated model calls are required. Original assessment IDs/area, checks, revision,
answer versions, staged provenance and modern evidence keys remain intact; history is
not rewritten. Legacy keys are derived only from matching original snapshots; absent
original provenance remains stale rather than manufactured.

The explicit authenticated preview/apply flow restores only missing results in their
original active area. It never overwrites existing stale/current results. Preview is
bounded and paged manually; unsupported, oversized or ambiguous candidates block rather
than fall back. Apply revalidates revision, selected content and worker/input gates
transactionally. Failure rolls back; explicit retry is safe. Activity distinguishes
restoration from new product decisions. No model calls or permissions are granted.

**Compatibility limitation:** saved plans, runs, code assessment/delivery evidence or
their histories block restoration because a new revision could invalidate their reuse.
Users must not discard that work or repeat assessment calls to bypass the gate.
Configuration alone is preserved and allowed. Active/pending jobs, workflow/execution
leases, unresolved input and unpaused authorized coordination/maintenance also block
apply without changing leases, pauses or budgets. See
[recovery controls and bounds](assessment-history-recovery.md).

Verification uses curated older-state SQLite fixtures, not personal projects: modern,
legacy, changed-input and missing-origin recovery, repeated reopen, immutable history,
portable round trip, stale revision/content rejection, invalid/oversized candidates,
explicit paging, transactional rollback/retry, worker/lease preservation, authorization
gates, and strict authenticated API validation. Focused browser coverage exercises no
history request on opening, explicit preview/apply, workflow blockers, original-result
preservation, reload and mobile with zero inference. General restoration into protected
implementation projects is not qualified; no live provider or desktop claims are made.

Checks actually run on Node 22.23.4: type check, all 1,044 deterministic tests (358
pretests + 686 main), UI build, focused assessment-history/workflow/Specification
browser runners and diff whitespace check passed. The UI build retains its existing
chunk-size warning. The aggregate browser runner was not rerun in this slice; its
previously observed obsolete Project map selector blocker remains unresolved. No live
inference, personal-project writes, commits, pushes or desktop packaging were performed.

## Separate implementation preparation from build/delivery (2026-10-29)

**Presentation-only grouping; no schema, fingerprint, permission or saved-format
migration.** Implement now groups Check progress, Prepare plan, Check options, plan
review and implementation settings under **Prepare implementation**. **Build and verify**
separately holds Start/Resume implementation, Verify delivery and active Stop controls.
Guidance distinguishes new repositories, applicable existing-code checks, current
approved-plan reuse, proposed/stale/interrupted plans and frozen coding runs.

The groups are not a new composite operation. Existing endpoints/action values,
revision/settings gates, verification commands, model selection, task scopes and
staged-planning checkpoints are unchanged. Check progress retains feature scope;
planning covers all approved requirements. Resume and Verify retain the saved run's
scope, not the current feature/search filter. Planning never gains code-capture,
verification-command or coding authority. Existing manual planning/dismissed-plan
paths remain available; this upgrade imposes no extra approval or model call.

Project/SQLite/portable schemas and semantic identities remain unchanged. Moving the
settings/review views does not rewrite plans, approvals, attempts, sessions, assessments
or delivery evidence. Existing exact-stage continuation and optimistic-version rules
still apply. Opening Implement performs its existing metadata inspection only; it
does not start a new check, plan or coding run (already authorized work may continue).
No startup rewrite, reset or forward-data conversion is needed.

Verification on Node 22.23.4: type check, all 1,031 tests (345 pretests + 686 main), UI
build and focused preparation/staged-planning, workflow, Specification and reliability
browser checks passed. Check/preview/force and resume/verify routes were intercepted
to validate exact bodies and separate permissions without executing them. Real fixture
planning verified read/check continuation, Stop/reload, retained history and review
gates; initial inspection left execution state unchanged. Mobile layout
and disabled-control keyboard/touch checks passed. Reliability first stopped at an
obsolete raw-error-in-alert assertion; it now checks the plain alert and original
detail in Logs before exercising controls. Aggregate browser checks passed layout/
model selection, then stopped at the known Project map selector in
`src/web/browser-check.ts:707`; later aggregate runners were not reached. Existing
bundle warning remains. No live inference, GitHub delivery, personal-project writes
or desktop packaging were performed. This is not new live execution qualification.

## Specification controls and processing-permission grouping (2026-10-29)

**Presentation-only authority clarification; no saved-format or semantic migration.**
Continue project is now **Continue specification**; Advanced actions becomes **More
actions**; Refine requirements becomes **Improve requirements**, under Specification's
More actions. Design's scoped discovery/question-target controls also live under More
actions. Native disclosures retain keyboard access and do not dispatch on opening.
Handlers, selected scope, endpoints and action values are unchanged. Existing narrow
response/clarification/refinement continuations keep their dedicated routing.

Settings groups existing controls under **Processing permissions** rather than adding
a combined automatic mode. `reqwizit-auto` keeps its existing browser-wide key, default
and on/off values. Each saved input retains its original `auto` flag. Workflow and
maintenance retain their project-local machine-local settings, distinct grants,
debounce, pause/restart and failed-attempt rules. In coordinated mode, retained
separate-task preferences are shown as inactive; returning to separate settings does
not mean they were turned off or that suspended work was rearmed. Existing opt-outs
are not upgraded into opt-ins. Research and execution/planning permissions remain
separate. No new task starts from rendering Settings or opening a disclosure, though
already authorized background work may continue.

No SQLite/payload/browser-key migration, fingerprint change, schema bump, model replay
or data reset is needed. Original messages/history can retain the old labels; only new
guidance uses the new names. Saved checkpoints, assessment evidence, plans, grants,
optimistic versions and portable state keep their existing identities and continuation.
Underlying browser/SQLite settings must not be consolidated by rewriting saved flags.

Verification on Node 22.23.4: type check, 1,031 tests (345 pretests + 686 main), UI build,
focused workflow/maintenance/Specification browser checks and diff check passed. Static
checks cover both old on/off browser and maintenance preferences without mutation or
dispatch. Browser checks cover keyboard and mobile More actions, inactive preferences,
restored opt-outs after leaving coordination, restart consent and explicit scoped
refinement. Aggregate browser checks passed layout/model selection, then stopped at
the known obsolete Project map selector (`src/web/browser-check.ts:707`). Later aggregate
runners were not reached; Specification passed separately. Existing bundle warning
remains. No live inference, personal-project writes or desktop packaging was performed.
Full merged-consent policy, implementation-preparation grouping and historical recovery
remain in the [consolidation plan](workflow-consolidation.md).

## Revision-labelled saved outcome summaries (2026-10-29)

**Read-only additive API/UI projection; no persisted-data migration.** The workflow
view adds an outcome combining latest locally recorded specification-change counts
with current pending input, decisions, reusable/outdated/missing definition reviews,
and refinement/plan follow-through. The UI tolerates a missing outcome during a
mixed-version refresh. Existing project/activity/workflow schemas, fingerprints,
receipt identities, optimistic versions, permissions and usage ledgers are unchanged.

`latestSpecificationChange` counts one existing indexed decision/discovery revision
entry, bounded at the viewed project revision. It returns labels and added/updated/
removed counts, not original prose, new timestamps or reconstructed human authority.
An assessment-only revision does not become the origin of earlier requirement changes.
The receipt's revision and the current follow-through revision are displayed separately.
No local change receipt remains explicitly unknown; imported projects do not gain a
manufactured activity archive. Older backfilled bookkeeping-only activity also yields
no change receipt. Neither activity payloads nor historical snapshots are rewritten.

Current definition-review counts mean saved evidence matches the existing freshness
rules and is available for reuse, not that particular requests were actually skipped,
the findings are resolved, or a whole operation is complete. Next-step text grants
no authority: saved-only input, Stop/restart, blockers, failed ledgers, planning approval
and coding/delivery remain governed by their existing explicit controls. Summaries
reconstruct from durable evidence without startup model calls or a new summary format.

Verification on Node 22.23.4: type check, all 1,031 tests (345 pretests + 686 main), UI
build, focused workflow/maintenance browser runners and diff check passed. Tests cover
receipt origin/counts without prose exposure, assessment-only changes, concurrent
revision bounds, existing legacy backfill/retry, repeated reopen, pending work and
projection purity. Browser checks verify distinct revision labels, expandable counts,
restart, mobile and plan updates without new calls. Aggregate browser checks passed
layout/model selection, then stopped at the known obsolete Project map selector in
`src/web/browser-check.ts:706`; later aggregate runners were not reached. Existing
bundle-size warning remains. No live calls, personal-data recovery or desktop packaging
were performed. Historical assessment recovery and full operation-wide receipts remain
in the [consolidation plan](workflow-consolidation.md).

## Organization assessment retention and related-artifact explanations (2026-10-29)

**Compatible mutation-policy correction and additive view fields; no schema or
fingerprint migration.** Merge, split, organization restoration and authorized feature
archival retain existing definition assessments under their original area IDs. Archived
areas are already excluded from active coverage; their assessments remain dated
evidence in the current SQLite/portable payload, not transferred readiness credit.
New split areas do not inherit source findings. Existing destination and dependency
reviews use unchanged exact-input freshness. Restoring an exact old organization may
reuse findings only if its evidence matches; intervening human decisions are retained
and continue to invalidate affected reviews.

Source/target project schema and portable format versions are unchanged. No startup
rewrite, model replay, allowance reset or optimistic-version migration is needed.
Normal expected-revision transactions save the retained assessments with organization
changes. Failure after an earlier operation in a multi-operation batch still rolls
back atomically. Original history is unchanged. Existing lazy legacy-input enrichment
still uses only exact matching original snapshots; missing history remains governed
by the conservative existing rule. This prevents future loss but does not restore
assessments already removed by an earlier app version.

The API adds read-only related-artifact notices for pending refinements and saved
implementation plans. The UI tolerates the field being absent during mixed-version
reload. Notices use existing stale-reason, plan-revision, workspace and settings gates;
they do not alter those gates, regenerate/approve plans, rewrite failed/unfinished
receipts or certify coding readiness. Dismissed plans/refinements stay history, not
new pending work. Planning remains conservatively revision-bound, including after
bookkeeping-only revisions. No new persisted state, credential fields or machine-local
execution data enters portable exports.
Current refinement decisions already present in the inbox are not duplicated in
Related saved work; outdated suggestions can still explain why a recheck is needed.

Verification on Node 22.23.4: type check, all 1,028 tests (344 pretests + 684 main), UI
build and the focused workflow browser passed. Organization tests cover rename/move,
merge, split into new/existing destinations, exact restoration, later human decisions,
archival, stale/failed transactions, older saved provenance, repeated reopen and
portable round trips preserving archived findings. Artifact tests cover input/settings/
binding mismatches, current versus unapproved/unfinished/dismissed work and projection
purity. The workflow browser verifies mobile plan-impact explanations without inference,
replanning or coding. The aggregate browser runner passed layout/model selection,
then hit its known obsolete Project map selector at `src/web/browser-check.ts:706`;
later aggregate scripts did not run. Existing bundle-size warning remains. No personal
data recovery, live model calls or desktop packaging were performed.

## Definition follow-through projection and repair-first coordination (2026-10-29)

**No saved-format, identity or schema change.** The API/UI adds definition review
status derived from existing current specification/assessment evidence. It distinguishes
current, outdated and never assessed, including when coordination is off or paused.
Original assessments, readiness receipts, exact-stage attempts and model results are
not rewritten. Older clients can ignore the additive view field; new controls tolerate
its absence during a mixed-version UI/server transition.

The enabled coordinator now updates outdated existing definition reviews before broad
gap discovery, after authorized input, decisions, stale proposals and pair checks.
Never-assessed baselines keep the original discovery-first order. Existing readiness
and publication checks remain unchanged: reordered scheduling does not establish any
new semantic compatibility or retroactively make old findings current. A paused
coordinator's controls stay visible in the drawer even when scoped saved-response
processing occupies the header; either action still requires explicit invocation.

Pending review status reconstructs from existing durable evidence, so repeated changes
coalesce without a new queue migration. Maintenance consumes the same status labels
but keeps its narrower decision-trigger projection, settings, debounce, CAS tasks and
usage limits. No opt-in/backlog sweep, consent widening, automatic retry or startup
dispatch is introduced. Failure preserves dated findings and blocks exploration;
completed exact stages and spent attempts retain their existing continuation rules.
Historical missing assessment recovery and organization-retention gaps remain in the
[consolidation plan](workflow-consolidation.md).

Verification: type check, 1,018 tests (343 pretests + 675 main), UI build and focused
workflow/maintenance browser runners passed on Node 22.23.4. Coverage includes
projection purity, current-but-unresolved findings, changed-area priority, unaffected
reuse, failure without automatic retry, coalescing, SQLite reopen and no renewed
authority on view/startup. Browser checks cover paused retained-input coordinator
continuation, pending evidence explanations, mobile and explicit repair-first restart.
The workflow runner initially assumed its Continue button was always in the header;
it now exercises the drawer path, also exposing/fixing the hidden-controls issue.
Aggregate browser checks still stop at the known Project map selector at
`src/web/browser-check.ts:706` after layout/model selection pass. Existing bundle-size
warning remains. No live inference, personal-data writes or desktop packaging ran.

## Preserve definition assessments through requirement cleanup (2026-10-29)

**Compatible mutation-policy correction; no schema or fingerprint change.** Wording
refinement approval, pair resolution approval and human duplicate removal previously
removed entire current definition assessments citing changed requirements. They now
retain the original records, input basis, revision, checks and evidence. Existing
coverage freshness marks affected areas/dependencies outdated; unchanged unrelated
areas remain current unless a project-wide decision changed. Findings are not
reclassified as current merely because a human approved replacement wording.

Source/target SQLite and portable formats are unchanged. No startup rewrite, model
replay, reset or concurrency-version migration is needed. Existing lazy projection
for older assessments without input keys still derives a basis only from an exact
matching original revision. Missing origin history retains conservative revision-bound
freshness. The ordinary expected-revision transaction saves the changed requirement
and retained assessments together; stale writes still reject atomically.

This prevents future removal; it does **not** restore assessments already absent
from current state. Original revision history is retained where available. A safe
historical recovery workflow remains planned in [workflow consolidation](workflow-consolidation.md);
do not manufacture provenance, restore old scores as current, or require a data reset.
Full-area rechecks and their unchanged exact-evidence continuation rules remain;
this is not incremental semantic reassessment or automatic follow-through.

Regression tests reproduce the original removal and cover proposal/dismissal,
wording approval, consolidation, coordinated two-requirement revision, duplicate
removal, dependency/unrelated freshness, stale writes and repeated SQLite reopen.
Older-shape fixtures cover both available and missing original history, preserving
existing exact-history enrichment without manufacturing current-input evidence.
Verification: type check, 1,014 tests (339 pretests + 675 main), focused 42-test
refinement suite, UI build and diff check passed on Node 22.23.4. Existing UI chunk-size
warning remains. No browser runner, desktop rebuild or personal-project/live-model
recovery was performed. The initial suite run exposed an incorrect test expectation
about existing legacy-key enrichment; the corrected fixture covers both history paths.

## Reveal the explicit Design clarification outcome (2026-10-28)

**Renderer-only, no persisted-data migration.** Preparing questions switched to
Design but left keyboard focus and page scroll at the initiating Specification
card. Reusing an identical saved no-question result could therefore appear inert,
especially from a deep page. Each successful explicit prepare/continue action now
focuses and scrolls its labelled clarification status into view, including repeated
actions for the same saved task. Polling does not move focus. Errors are also
surfaced globally because the initiating card can be hidden after navigation.

No task identity, completed model receipt, failed attempt, authorization, score,
workflow allowance or publication rule changes. Reuse still requires the existing
exact-task checks; this does not force another AI call or manufacture questions.
The focus/action counter is ephemeral and is not restored as a new action on reload.

The Specification browser regression first failed its new focus assertion against
the previous UI. With the correction it passes focused/visible status checks for
new questions, no-question outcomes and repeated reuse from a deep initiating card.
It also checks an API refusal stays visible, no navigation occurs on refusal, and
reuse/refusal adds no model calls or jobs. Type check and UI build passed.
All 11 queue-activity unit tests and the diff check passed. The full browser
command passed layout/model-selection checks, then stopped at the known obsolete
`Project map` selector in `src/web/browser-check.ts:706`; later scripts were not
reached by that command. The Specification script was run separately and passed.

## Questions-only exact-record workflow fallback (2026-10-28)

**Implemented policy extension, not a SQLite schema migration.** Workflow contexts,
staged ledgers and disposable CPU receipts now recognize `staged-records-v4`.
Existing v1/v2/v3 model receipts, completed checks, failed attempts and portable
continuation remain in their original protocol; none are relabelled as v4.
The fallback is attempted only for otherwise unsplittable leaves after earlier
policies cannot fit. Safe compatible reviews retain their existing path. Exhausted
compatible work does not receive fresh model attempts.

V4 starts from the current-spec mandatory union, restores exact projected human
review/receipt sources and closes human evidence links. Existing explicit static
workspace-file deferral remains. Missing references reject preparation. Exact
targets and original human input repeat; remaining exact records are distributed
deterministically, grouped near 50,000 raw characters and split further as needed.
Lossless encoding remains available; no record is sliced, summarized or substituted.
Every batch plus its full 8,000-character accumulated-draft reserve and stage
envelope must fit 96,000 characters; sixteen batches remains the limit. Individually
oversized records/pins still block with section/record diagnostics. Unsafe
comparisons can return `reviewBlocked`; this is not exhaustive cross-record coverage.

This protocol authorizes **questions only**, never requirements, edits or approvals.
Runtime output schema and independent saved-response replay both enforce this.
Every discovery batch and every validation batch must complete before publication.
Partial drafts, attempts and receipts survive failures, SQLite reopen and portable
continuation through the existing format-1 staged ledger. Canonical plan/evidence
replay and expected-revision checks still guard publication. Extra loads are forbidden.

Derived CPU skip receipts use `planningPolicy: staged-records-v4`. Earlier local
size/unknown blockers are reconsidered lazily with the same exact-input identity;
non-size reviewed/waiting/attempt-limit work remains reusable. Transactional cache
adoption is unchanged. Interrupted preparation can retry without rewriting model
history or resetting project data. Future policies still reject before replacement.
No database version bump, assessment-key change or automatic inference on upgrade.
Older apps cannot understand v4 ledgers; do not downgrade an active v4 workspace.

Deterministic tests cover exact human text/union preservation, repeated pins, missing
references, individual overflow, requirement rejection, all-batch publication, unsafe
comparison blocking, interrupted validation, spent-attempt preservation, completed
read reuse after reopen, portable round trips and completed/old/exhausted work.
Existing future-policy and transactional recovery tests also pass. `npm test` passed
339 pretests and 668 main tests.

A read-only preflight of the reported project at revision 2664, with saved CPU
contexts/receipts and epic-review history, selected the first eligible v4 package in
about 10 seconds (latest run 10.1): six batches, one examined package, zero blockers and zero model requests.
This is a prefix result, not a whole-project check. No user-project data was written.
Three representative old seed/target/batch-limit blockers also fit in 9/6/6
batches during implementation preflight. Live provider
acceptance and complete-project discovery remain unverified.

Type check, UI build, diff check and the focused Specification browser regression
passed. The separate epic-review browser script stops at its obsolete **Project map**
selector (`src/web/epic-review-browser-check.ts:122`), before workflow assertions.
The previously reported full-browser **Project map** blocker also remains; neither
browser script is claimed fully qualified by deterministic engine tests.

## Reused clarification UI outcome attribution (2026-10-28)

**UI-only; no persisted format, schema, freshness or fingerprint change.** A completed
clarification can be returned by `clarify-definition` with `reused:true`, without a
new job or model request. The newest database job can therefore remain an unrelated
failed general-discovery planning attempt. The UI previously kept presenting that
failure as its current outcome after the successful no-call clarification action.

The renderer now retains the explicit clarification action's project/revision and
latest-job baseline in memory. When unchanged, Design and Processing & queue show
the reused result and explain that no AI request was made. An earlier job diagnostic
is labelled as a separate historical task, with its existing logs link retained.
A new job/revision/project invalidates the local notice; active tasks and unfinished
saved input keep their ordinary status priority. Reload does not manufacture a new
durable success record or erase the old failure. Reusing the result again requires
only the same existing exact-task compatibility checks, not inference.

All job payloads, successful clarification receipts, local package-planning caches,
failure diagnostics, assessed findings and package size/dependency blockers remain
unchanged. The two-minute planner bound and exact-evidence limits are not relaxed.
No general-discovery job is started or approved by the clarification action.

Unit coverage checks project/revision/job baseline changes. A browser regression
completes a no-question clarification, records an unrelated planner failure,
reloads, then invokes Clarify in Design again. The reused result is clearly shown,
no model call or job is added, and the earlier job and pending saved response remain
byte-equivalent in the store. The separate historical diagnostic remains accessible
through its labelled section and Logs.

Read-only inspection of the reported Skating area confirms its completed 50-step
no-question result still matches the current task at revision 2664. The reported
two-minute timeout belongs to a separate general workflow-planning run with no
clarification context and zero model requests. No user-project writes or live model
calls were performed. This display fix does not resolve that planner's real size
blockers or declare the definition finding/product complete.

## Non-retroactive saved-draft authoring guidance (2026-10-28)

SQLite remains **schema 8**; submission/portable continuation remain **format 1**.
Newly authored analysis receipts now carry optional `draftPolicy:"product-rationale-v1"`.
Checks use `checkPolicy:"staged-check-scope-v2"`; v1 receipts remain supported.
The optional manifest `submissionDraftPolicy` distinguishes an unmarked legacy
producing read from a new one. Retention/evidence/check responses do not turn a
legacy draft into a newly authored one. These additions do not change working data,
context hashes, material/plan keys, completed jobs or assessment freshness.

Check-scope v1 introduced product-focused rationale guidance but failed to separate
new authoring from verification of existing frozen wording. That could reject a
semantically valid older draft solely for retained workflow commentary, after
forbidding any check-stage rewrite. V2 explicitly limits the writing convention to
new reads/correction. Legacy workflow prose remains dated AI explanation, not
human authority or product behavior. Factual claims still require exact evidence;
product contradictions, unsupported claims and unauthorized changes still reject.
The original rationale is not silently removed, rewritten or labelled human intent.

Optional `legacyStyleRecovery:{format:1,receiptIndex}` permits one explicit recheck
only when replay finds an old unmarked producing draft and a terminal failed v1
check. This structural condition is not proof that the rejection was stylistic:
the independent v2 check must decide whether a genuine factual/product conflict
remains. The rejected receipt, frozen draft and absolute attempt count are kept.
No new corrective draft, question sweep or allowance is granted. The next request
uses the next existing attempt; exhaustion still prevents dispatch. V2 rejections,
newly authored drafts and an existing style-recovery boundary cannot gain another
style recovery. Publication replays both earlier recovery boundaries and all
remaining checks before applying ordinary transaction/authorization/staleness gates.

No startup migration or history rewrite is required. Future policy/marker formats
fail closed. File-backed tests reopen twice without changing the source job, then
verify both independent outcomes: compatible legacy wording publishes unchanged
after all checks; unsupported facts still block and cannot be retried automatically.
Tests retain two spent requests, dispatch attempt three, preserve exhausted counts,
reject future formats, exclude new drafts and round-trip the portable marker.

Reported-state read-only preflight preserves 11/21 steps, every receipt, the frozen
draft and attempts=2; continuation would dispatch attempt 3. It supplies both the
non-retroactive instruction and original rejection context. No user-project writes
or live model requests were made. Verification: 67 focused tests, full `npm test`
(337 pretests + 666 main tests), type check and focused Specification browser check
passed. Live semantic completion is unverified; the known full-browser selector
blocker was not rerun for this backend-only correction.

## Staged verification scope and dated rejection context (2026-10-28)

SQLite remains **schema 8**; submission ledger/portable continuation stay **format 1**.
New check receipts carry optional `checkPolicy:"staged-check-scope-v1"`. Optional
`checkScopeRecovery:{format:1,receiptIndex}` retains one older rejected check while
allowing its unfinished check to be independently repeated under corrected prompt
instructions. New-policy rejections and ledgers already containing this boundary
cannot receive another recovery. Unsupported marker/policy formats reject.

The previous prompt computed check eligibility only from this batch's detailed
targets. That could incorrectly revoke an unchanged draft target's eligibility
when moving to another batch. Check prompts now distinguish structural candidates
across the original staged evidence union from records detailed in this request.
Candidates still do not prove human authorization. Exact comparisons must load
missing indispensable evidence; neither omission nor a candidate ID establishes
semantic correctness. Read-stage loading and publication permissions are unchanged.
Corrective checks also receive the exact original rejected verdict through optional
manifest `submissionPriorRejection`, explicitly labelled a dated AI hypothesis, not
human input or approval. New read/correction instructions prohibit workflow disputes
and request/eligibility commentary in product rationale/reason.

Explicit continuation may add the recovery marker only after valid replay of an
unmarked terminal failed check whose frozen specification update target is a valid
structural candidate in the original evidence union but absent from that batch's
local candidate list. This structural test does not interpret rejection prose or
declare a semantic rejection false. It grants **reverification only**, not approval,
new draft wording, another corrective draft pass, a question sweep or more allowance.
The rejected receipt, frozen draft, material/plan keys, context hashes, source jobs
and all spent attempts remain unchanged. The repeated check consumes the next
attempt in the existing finite allowance; a further rejection remains terminal.
Every remaining original batch must pass, and publication replays this boundary
and runs ordinary authorization/target/staleness checks transactionally.

No startup migration or existing completed-job rewrite is needed. The new manifest
context is reconstructed without changing hashed working-context data. Portable
continuation retains the versioned marker alongside identical historical receipts.
File-backed regression reopens twice and verifies both outcomes: independent valid
checks finish the unchanged draft without repeating reads; a new invalid check
preserves the product state and cannot repeat on retry. Tests also reject future
formats and supply original corrective rejection context on subsequent checks.

Read-only preflight of the reported ledger preserves 11/21 steps, all receipts,
the frozen draft and attempts=1; it resumes at the same failed check with a valid
global target list and original rejection text supplied. No user-project writes
or live calls were performed. Verification: 65 focused tests, full `npm test`
(335 pretests + 666 main tests), type check and focused Specification browser check
passed. Live semantic acceptance is unverified; the prior full-browser selector
blocker was not rerun for this backend-only correction.

## Clarification evidence-progress accounting (2026-10-28)

SQLite remains **schema 8** and staged clarification/portable continuation remain
**format 1**. Optional `readinessWork.evidenceProgress:{format:1}` distinguishes
successful exact evidence loading from failed output requests. Explicit dispatch
or continuation first replays the saved ledger under its original representation,
then adds this marker to unfinished work only. No startup writes, completed-job
rewrites, material/plan-key changes, context hash changes or assessment invalidations
are introduced. Unsupported future evidence-progress formats fail closed.

Previously the indexed step allowance of four total requests could be consumed by
four valid retrievals, leaving no request for the actual question draft/verdict.
Marked work retains the absolute `attempts` and receipt `attempt` numbers, but its
dispatch ceiling is four (three before an indexed-read boundary) plus the number
of validated successful evidence receipts at that step. Every retrieval must add
known distinct records not already detailed; duplicates, unknown IDs, malformed
output, timeouts and provider failures do not earn progress credit. Replay verifies
each original context/response before credit is used. A blocked semantic response
remains terminal. Genuine spent failures survive reopen and cannot reset on retry.

Numeric attempt fields now support up to 260 only with the marker; unmarked legacy
work retains its original three/four-request bound. The existing 256-receipt bound
remains, with a pre-dispatch safety stop rather than overflowing the ledger. Exact
record sets, eight-record retrieval responses, 96,000-character context bounds,
Stop, request timeouts and all-batch verification/publication gates remain intact.
Completion reconstructs its final pre-verdict context with the actual saved attempt
number, including when successful retrievals put the final verdict above attempt 4.

File-backed upgrade regression saves an older exhausted four-retrieval ledger,
reopens twice without mutation, continues with attempt 5 without repeating those
reads, completes a final check after four more exact retrievals, and round-trips
portable state with identical receipt prefixes. Negative tests preserve four failed
attempts after successful retrieval, reject duplicate evidence and future formats,
and prevent allowance renewal on explicit retry. Completed legacy jobs still publish
without adding the marker or changing saved evidence.

Read-only preflight of the reported application state retains 13/36 completed steps,
all four current-step retrievals and absolute attempts=4. The reconstructed context
is 76,201/96,000 characters; there are no failed calls at that step to exhaust the
four-failure allowance. No user-project writes or live model calls were made.
Verification: `npm test` passed (333 pretests + 666 main tests), type check and focused
Specification browser check passed. Live completion remains unqualified; the earlier
full-browser Project map selector blocker was not rerun for this backend change.

## Separate staged evidence pins from input authorization (2026-10-28)

SQLite remains **schema 8**; continuation and staged ledgers remain **format 1**.
The optional context-manifest `submissionAuthorizationSourceIDs` is derived from
the original saved submission using the same concrete-input eligibility function
as publication. It does not change working-context data, material/plan keys or
receipt hashes. Reconstructed manifests gain this field on dispatch, not startup;
older saved manifests, jobs, inputs, reconciliations and spent attempts stay intact.
No new permission, model-call grant, assessment invalidation or history rewrite is
introduced. Reopen/retry keeps the original finite allowance and exact saved reads.

The staged prompt previously mistook all `taskRecordIDs` source pins for current
input authority. A reconciliation adds its later answer to those pins as evidence,
but that answer still has its own submission and is not in the original batch.
The prompt now uses only the explicit derived authority list; the advertised
activation/revision schema restricts every authorization source ID to that list.
Missing authority metadata fails closed. Pins and later clarification answers stay
available as evidence, not permission to edit unrelated behavior. All publication
checks and the separate clarification submission's own follow-up remain unchanged.

Regression verifies a pinned concrete reconciliation answer remains detailed while
excluded from both prompt authority and schema enums; an adapter ignoring the
schema still cannot save the unauthorized draft. Existing file-backed reopen,
reconciliation and receipt tests continue passing. Read-only preflight of the
reported state replays its single completed evidence receipt, retains three spent
attempts, and produces a schema authorizing only the original answer. Rejected
draft bodies are not saved, so their exact offending citation cannot be recovered
from this ledger. The prompt/validator mismatch is reproduced independently.
There is no completed draft to publish without inference in this case; explicit
continuation needs a new draft request, not another clarification sweep or reset.
No user-project writes or live calls were performed during inspection.
Verification: full `npm test` passed (329 pretests + 666 main tests), type check
and focused Specification browser check passed. After adding a final file-backed
legacy-manifest regression, the 50-test staged/specification suite and type check
passed again. That regression reopens twice, preserves the older manifest and
receipt, and dispatches attempt four rather than resetting three spent requests.
Live semantic completion remains unverified; the existing full-browser selector
blocker was not rerun as part of this backend-only correction.

## Checked saved-response authorization citation projection (2026-10-28)

SQLite remains **schema 8**; portable continuation and `submissionWork` remain
**format 1**. No startup migration or fingerprint change is required. New staged
draft acceptance validates authorization citations using the same concrete-input
source selection as publication, before saving a draft or spending batch-check
requests. Historical supporting citations are not current-input authorization.

An explicit retry of a fully checked, unpublished legacy ledger may project its
publication citations without changing any checked wording: for an existing
`revise` target only, remove redundant confirmation IDs already in that target's
retained `sourceIDs` and the exact reviewed evidence union. At least one current
concrete input citation must already exist. Unknown/unrelated sources, duplicate
citations, historical-only authority, non-confirmation extras and activation are
not repaired. The ordinary authorization, target/scope, conflicting-change,
stale-revision and transactional publication checks still apply unchanged.

The original wire receipts, context hashes, source jobs and historical support
remain unchanged. The published job result records the projected citations and
the requirement's answer-derived authority cites only current input. Publication
independently reconstructs this exact projection from replay; arbitrary edits to
wording or citation sets are not accepted. Existing completed jobs are not rewritten.
Retry after failure/reopen reuses completed checks without further inference.
No model output or missing human authority is manufactured.

File-backed upgrade regression constructs older mixed answer/confirmation receipts,
reopens twice, then publishes with zero adapter requests while preserving source
jobs, receipts, historical confirmation and checked wording. Negative cases cover
historical-only, duplicate, unknown/non-confirmation citations and incomplete work.
New draft regression rejects the mixed array before any verification requests.
Read-only preflight of the reported application ledger passes replay, projected
publication validation and update authorization/target checks on an in-memory copy.
No user database writes or live model calls were performed. Checks: 328 pretests +
666 main tests, 61 focused tests, type check and Specification browser check passed.
The previously documented full-browser Project map selector blocker is unchanged.

## No-question clarification to bounded corrective draft review (2026-10-28)

SQLite remains **schema 8**, portable continuation and `submissionWork` remain
**format 1**. The optional version-1 `draftRepair` boundary binds a retained rejected
verification to its source job and an already completed format-3 no-question result.
It records the original receipt boundary, prior spent attempts and exact failed-check
evidence. Original material/plan keys and every earlier wire receipt/hash remain
unchanged. Earlier completed checks are retained historically; a revised draft must
pass every batch anew. Receipt step 64 is additionally supported for the final check
of a maximal 32-batch corrective run. Unsupported future repair formats fail closed.

This is a new **correction phase**, not resetting the failed verification allowance
or treating an AI conclusion as human input. It allows one complete corrective draft
with up to four requests (including exact-evidence retrieval), then freezes that draft
for all original batch checks. Those checks retain their finite per-step allowance.
Existing extra-request grants do not roll into correction, and correction cannot
receive automatic extra grants. A further semantic rejection stops without another
question sweep or another correction boundary on unchanged work. Missing/changed
evidence and stale results still reject; original target/input authority is unchanged.
Dispatch and publication independently validate the source ledger and completed
no-question outcome. The latter authorizes review only, never a product preference,
approval or proof that the old rejected draft was right. Speculative quoted IDs in
the old rejection must be checked against exact records too.

Already completed no-question clarification results are reusable on explicit saved-
response continuation; their model calls do not repeat. When new question preparation
finishes with no question, the manual queue can continue only that original response
into correction in the same action, leaving unrelated/new save-only input waiting.
No startup writes or model sweep are introduced. No data reset, duplicated original
answer, assessment invalidation or rewrite of old completed jobs is required.
Portable exports retain both referenced source jobs. Progress/diagnostics count the
additional correction step without counting obsolete checks as current verification.

Upgrade tests use an older file-backed rejected ledger plus completed no-question
result, pause after the corrective draft, reopen twice, finish only the remaining
checks and round-trip portable state. Original source/clarification jobs, receipt
prefixes and spent attempts remain unchanged. Tests also cover forged source/boundary
metadata, future formats, finite malformed-output attempts and semantic re-rejection.
The reported user state was inspected read-only: its existing clarification is
reusable and the corrective envelope fits the normal input limit. No live model call
or user-project mutation was performed; actual provider resolution is unqualified.

## Manual clarification with a stopped enabled coordinator (2026-10-28)

Behavior-only correction; SQLite remains schema 8 and all task/receipt formats,
material keys, completed checks and spent attempts are unchanged. An enabled workflow
setting is not a live worker. Explicit manual saved-response processing and definition
refresh can prepare their related Design questions even while the coordinator is
enabled but paused/blocked/suspended. The coordinator-owned queue still uses its own
bounded policy; live worker exclusion is still enforced by the normal job/workflow
leases. Manual work never enables/resumes the coordinator or changes its grant.

Existing blocked input needs one explicit manual continuation after upgrading; no
startup model sweep or saved-setting rewrite is required. Regression tests retain the
enabled/stopped settings throughout question generation and explicit-answer recovery.
The reported saved state was inspected read-only: its semantic blocker replay and
exact question-preparation plan both pass local validation, with no provider request.
This is local preflight evidence, not qualification of a live generated question.

## Saved-response conflict questions and explicit-answer recovery (2026-10-28)

Source/target: SQLite stays **schema 8**, portable continuation stays **format 1**.
Readiness task formats 1/2 are unchanged; additive **task format 3 /
saved-response-questions-v1** binds a terminal saved-response verdict to its original
job, submission, exact material/plan and current evidence. The existing format-1
readiness ledger also accepts this task; older contexts/receipt hashes are not
re-encoded or relabelled. `submissionWork` remains format 1 with optional version-1
`reconciliation` provenance (source job, published clarification job, permanent
question and explicit answer source). Future variants fail closed.

No startup migration, reset, automatic model sweep, assessment invalidation or lost
history is needed. An older retained semantic blocker is replayed on explicitly
resuming processing; no original model request is repeated. A separate exact,
questions-only task can establish a genuine unresolved choice, or explain that the
draft was wrong/intent settled without inventing a question. Its preparation follows
the continuous clarification policy. Unchanged failure/Stop/no-question outcomes
never automatically spend another clarification allowance. Permission-recovery and
exhausted-request errors do not become product questions based on diagnostic prose.

The original input/ledger is not completed by generating a question. Pending,
deferred or delegated linked questions prevent ordinary retries of that response.
An explicit concrete answer to its published clarification allows a **new-evidence
draft plan** on continuation, pinning the original input/target plus that question
and answer. This is reassessment of changed intent, not reuse of a rejected draft or
an allowance reset for identical evidence. Earlier exact reads, rejected checks and
spent attempts stay immutable in their original jobs; scoped authority is unchanged.
Publication independently validates the answered question and source lineage.
Portable projection retains those linked jobs even after the new question changes
area freshness. Other related unapplied/conflicting input still gates preparation;
the blocked submission does not block continuation of its own question task.

Tests cover older file-backed blocked data, repeated resume without paid replay,
explicit-answer recovery, Stop/task-only continuation, stale evidence, no-question
and failed triage, portable source/recovery preservation and future-format rejection.
Full real-project/live-provider recovery remains unqualified; no live calls were made.

## Automatic continuous Design clarification (2026-10-27)

Compatibility: no SQLite, portable or task/receipt format change. Existing format-1
and format-2 task identities and format-1 exact readiness ledgers remain unchanged.
Ordinary clarification now runs continuously; coordinated workflows and explicitly
bounded service callers retain their allowances. The existing checkpoint transaction
renews a finite lease before dispatch. Individual request timeouts, spent attempts,
exact evidence constraints, replay validation and publication CAS remain unchanged.

Definition reviews queue question preparation server-side. Completed area results
and older complete dimension-level no-question results are reused. Matching failed,
cancelled or interrupted attempts are not automatically retried; startup/reload never
starts inference. Exhausted definition-request allowance is not treated as a product
choice granting a separate automatic allowance. Related unfinished inputs take
precedence; input-only processing and coordinated budgets are not widened.

Forward recovery is behavioral, not a rewrite: explicitly continuing an older saved
clarification retains receipt hashes, original job history and spent attempts, then
finishes the remaining steps without the old per-action cutoff. No data reset,
reassessment, fabricated provenance or replay of successful requests is required.
Tests cover file-backed reopen/repeated refresh, no-question/failure/Stop reuse,
older paused receipts continued in continuous mode, >32 requests in one action and
late responses after per-request timeout. Future persisted formats still fail closed.

## Definition exact-wire evidence and continuous publication (2026-10-27)

Source/target: SQLite remains **schema 8**, `definitionWork` remains **format 1 /
exact-batches-v1**. The optional `exactWirePolicy:{format:1,fromStage}` is an ordered
wire/interpretation boundary, not a specification revision, new attempt allowance or
assessment freshness identity. No startup migration, model call, history rewrite or
forced reassessment occurs. Current assessments retain their existing freshness keys.

New plans start at boundary zero. Explicit continuation first replays old receipts
unchanged, then upgrades only future stages. A stage with an accepted supplemental
evidence request (including inherited split evidence) keeps its original contexts until
the next safe boundary. Original partitions, hashes before the boundary, receipts,
raw responses, IDs and spent attempts remain intact. Compatible old invalid-reference
failures may retry the unfinished request under their remaining allowance; unsupported
references, exhausted attempts and genuine human conflicts are not cleared or guessed.

Wire encoding can replace canonical plain review snapshots with exact loaded-requirement
references, or self-contained historical snapshots when wording differs. Canonically
serialized cleanup envelopes can expose their embedded original JSON to lossless text/
identifier/table sharing. Full original snapshots, unknown prose, addenda, decision
strings and line endings remain reconstructible. This is **not** omission of generated
history or projection of old evidence into current approvals. The candidate is used
only when its complete encoded request is smaller than the ordinary encoding for the
same policy. The 96k cap, draft reserve and every read/verification step remain.

New evidence receipts optionally retain `resolvedRecordIDs` alongside the original
`definitionEvidence` response. Only exact canonical IDs or the original request's
displayed labels resolve; no prefixes, other-request labels or fuzzy lookup. A mixed
request may mention already detailed records, but must add an unread saved record;
unknown references and duplicate aliases still reject. Replay reconstructs the original
label map and checks the resolved IDs independently. Future boundary formats and
unversioned/forged resolved evidence reject without overwriting saved work. Local and
portable jobs share the same schema; repeated startup and clone adoption need no
completed model calls repeated. Downgrading to an app without this boundary is unsupported.

New discovery metrics optionally record allowlisted `definitionLocalMs` phase durations;
older absent phases remain unknown. No prose or paths enter these measurements. New
whole-refresh progress counts only requests dispatched in that owned action, separately
from completed/reused/unfinished areas and reused receipts.

Continuous manual refresh now defers its own portable folder publication until finish,
failure or Pause/shutdown, avoiding a full continuation rebuild between each area.
**SQLite results and request checkpoints still commit immediately.** The deferral is
process-local, reference-counted and idempotently released; independent workspaces are
not deferred. Existing durable dirty/journal/conflict mechanisms recover pending exports
on reopen, respecting live worker leases. During a refresh, `.reqwizit/` may lag SQLite;
pause first before committing or sharing the latest portable state. There is no new
whole-refresh cap, recurring confirmation or startup inference. See
[definition refresh efficiency](definition-coverage.md#refresh-efficiency-and-evidence-references-2026-10-27)
for checks actually run and remaining qualification limits.

## No-change refinement completion and request visibility (2026-10-27)

Source/target: existing individual `refinementWork` **format 1** and pair **format 2**
remain unchanged. SQLite stays at schema 8; material/context/plan hashes, freshness
keys, evidence, original receipts, IDs and completed checks are preserved. There is
no startup rewrite or inference, and no project reset or reassessment requirement.

Individual wording work can finish after every exact evidence batch has been read
when its last explicit validated draft contains no refinements. Empty implicit
retention alone is insufficient. Pair outcomes still need the full check pass;
proposed wording still needs every frozen-draft check. An explicit blocked/negative
check cannot become a no-change completion. Publication replays the original ledger,
checks exact material/coverage and result equality, then enforces the usual revision
and target checks. No synthetic model-verification receipts are added.

Explicit continuation adopts compatible older reads, including a partial check pass,
without replaying them. If those reads already establish no changes, publication
uses zero new requests. Old complete 2-pass results remain reusable as-is. Interrupted
or failed requests retain their spent attempts; missing evidence still blocks.

New jobs add optional `refinementRequests`, a nonnegative per-job pre-dispatch counter
retained in local and portable jobs. It starts at zero for a new staged job, counts
failed/dispatched attempts and excludes inherited receipts. Historical jobs without
the counter stay unchanged: logs show only the job's own returned receipts as an
explicit **at least** count, or unknown if none exist, never fabricate an exact total.
Timeline projections expose counts and outcome metadata, not original response text.
The checkpoint envelope and prompts remain readable without a new format; older
apps do not implement the reduced no-change publication rule, so use the updated
app for continued work/portable adoption rather than relying on downgrade behavior.

Volatile sweep counters show requests, wording suggestions and unchanged requirements;
they describe the current process/run, not historical totals. There is no new shared
sweep allowance, periodic confirmation or automatic restart. Existing request/task
limits, cancellation, failures, and explicit continuation after restart remain.
Upgrade/recovery, late-proposal/full-verification, continuous-sweep, log projection
and browser checks are recorded in [browser workspace](browser-workspace.md#continuous-refinement-and-no-change-results-2026-10-27).

## Resumable workflow planning probes and bookkeeping revisions (2026-10-27)

The supplied metadata-only export contains two two-minute preparation failures at
revisions 2379/2380, each examining 34 blocked packages, resolving 61 local groups
and reusing **zero** groups. Neither made a model request. About 100 seconds per
run went into staging; 2 target-size, 17 indivisible-decision and 15 batch-limit
blockers were recorded. The export does not identify what changed between revisions
or establish blockers for the unexamined remainder.

Source/target: SQLite **7 → 8** adds only an expression index separating successful
wire contexts from failed local probes. The ordered startup migration is transactional
and leaves all existing payloads, specification/CAS revisions, evidence IDs, model
checks, stages and spent attempts unchanged. An interrupted migration rolls back the
index/history/version together and retries on reopen. Older apps refuse schema 8;
downgrade after upgrading is unsupported.

CPU input namespace `resolved-prefix-v2` binds all project material except the
revision number and known workflow-unread bookkeeping (`implementation`,
`reviewUpdates`, `roundChanges`, `assessments`, `scopeAssessment`). Revision **digit
width** remains bound because it affects exact encoded sizes. All sources, questions,
requirements, dependencies, organization records, generated interpretation,
analysis revision, scans, model selection, job history, submissions and selection
remain conservative inputs. This is not permission to reuse after arbitrary
unrelated evidence edits. Context-computation keys separately bind each immutable
project's material, so historical evidence cannot collide with current evidence.
Compatible cached contexts are cloned and rebound to the current revision; same-width
revision substitution leaves sizes, evidence hashes and partition identities intact.
Publication still requires the latest expected revision.

Existing format-1 root/subtree receipts and budget/context computations remain readable.
An exact matching `resolved-prefix-v1` generation is lazily adopted on explicit
preparation, without inference. Each storage write remains transactional/revision
checked; an interrupted adoption never grants model attempts or changes original
checks. Unmatched disposable CPU work may be recomputed, never model calls solely
because this CPU representation changed. No project reset or bulk reassessment is
needed. Original failed-job diagnostics are not rewritten.

The format-1 intermediate envelope adds `outcome: planning-failure`, a deterministic
failed candidate-policy result with kind `context`, `target`, `seed` or `stage-limit`,
original diagnostic and required size manifest where applicable. It is not model
evidence or a completed review. Successful contexts retain their 128-entry/16-MiB
pool; budget/failed-policy probes have a separate 4,096-entry/64-MiB pool. The index
avoids reparsing large wire payloads for pool selection on every checkpoint write.
Completed failed partitions and intermediate split probes survive explicit retry,
including inside a root without a completed group receipt. Bounded eviction or one
indivisible computation can still require recomputation/time out. Unknown formats
or outcome variants reject on load rather than being adopted; no startup model calls.

Tests cover exact cold/warm wire equivalence, metadata revision reuse, evidence and
wire-width invalidation, unfinished-root interruption/reopen, independent packages
past cached blockers, separate-pool eviction, legacy adoption, interrupted migration/
adoption and repeated startup. Verification results are recorded in
[discovery efficiency](discovery-efficiency.md#workflow-preparation-retry-fix-2026-10-27).

## Oversized pair-resolution refinement continuation (2026-10-26)

The later **148,329/144,000-character** failure was a two-requirement comparison,
not an individual wording task. Read-only saved-job metadata confirmed two task
targets and no staged ledger. Earlier failed pair preflights omitted `refinementPair`
from the error manifest; budget errors reaching the diagnostic handler now retain
that exact task metadata.
Original failed jobs are not rewritten, marked complete or discarded.

Source/target: existing individual `refinementWork` **format 1** and its
`exact-refinement-batches-v1` wire contexts/hashes remain unchanged. New oversized
pair tasks use **format 2**, policy `exact-resolution-batches-v1`, with the exact
ordered requirement pair, `includeUnapproved` authority and trigger-source IDs.
No SQLite/schema counter, project revision or completed-check freshness-key migration
is needed. Old valid ordinary pair checks and individual receipts remain reusable;
unknown formats, mixed individual/pair policies and mismatched task metadata reject
without overwriting stored work. Portable continuation preserves both ledger formats
and drops machine-local sessions as before. Downgrading to a reader that lacks the
pair format is unsupported.

Pair batching uses the same finite request/context/draft bounds, pre-dispatch attempt
accounting and all-batch store replay as the individual slice below. Both detailed
requirements, **all** supporting sources, trigger sources and linked pair questions
are pinned in every request. Supplemental citations must be loaded exactly before a
new/changed action can use them. A draft must retain an explicit resolution outcome:
distinct, one explicit resolution proposal, one question linked to both requirements,
or a concrete blocker. Source-only/basis-specific citation validation remains:
workspace facts cannot establish human preference. No direct specification changes,
approval, scope expansion or early question/proposal publication are authorized.

**Continue refinement** resumes only the latest exact saved individual/pair task;
pair identity, authority, triggers, complete evidence and spent attempts are rechecked.
Changed evidence rejects continuation; a separate explicit Refine action can review
genuinely changed material while retaining the dated ledger. Previous no-call size
failures can simply retry Refine; original answers/approvals need no resubmission.

A read-only local preflight of the exact failed snapshot prepared **9 batches / 18
read-and-check steps**, covering **193 mandatory records** with **11 pinned records**.
Its largest initial context was **57,995 characters**, plus an 18k draft reserve,
under the 96k batch limit. Its evidence set exactly matches all 193 records from
the failed manifest: zero omitted, extra or unbatched records. No personal data was
written and no live model call was made. This verifies preparation size/coverage,
not provider quality or completion.

Tests cover each explicit outcome, pair-only continuation, pinned support/triggers,
unapproved-target authority, source-only and exact-load citation checks, blocked
publication, stale/cancelled results, old no-call failures and repeated portable/
SQLite reopening alongside unchanged format-1 work. Oversized supplemental evidence
also carries its valid ledger to every failed continuation before preparing the next
context, so repeated size failures cannot silently reset completed steps or attempts.
The focused pair browser runner passed progress, Stop/reload, metadata-only polling,
exact-step reuse, mobile and proposal-only publication; the individual runner also
passed. Screenshot: `.reqwizit-state/browser-resolution-stages-mobile.png`.

Final verification: **951 tests passed** (`npm test`: 288 pretests + 663 main),
type check, UI build, individual/pair browser runners and diff whitespace check.
The saved-response overlap tests now verify exact batching, unchanged completed
discovery receipts and retained cross-feature human guardrails instead of expecting
the superseded 144k pre-inference blocker. An earlier full command hit its shell
timeout; another run exposed these two outdated expectations before correction.
`npm run test:browser` still passes workspace layout/model selection then stops at
the existing **Project map** tab locator (`src/web/browser-check.ts:706`); later
aggregate runners remain unexecuted. No live-provider completion is claimed.

## Oversized individual refinement continuation (2026-10-26)

Source/target: existing jobs without staged refinement remain unchanged. New
overflow-only jobs may carry `refinementWork` format 1, policy
`exact-refinement-batches-v1`, plus `context.refinementStage`. No SQLite schema
change, startup conversion, assessment/refinement freshness-key change, input
rewrite or reset is needed. Existing valid completed checks remain reusable.
The separate format version is not a project revision or concurrency counter.

The ledger stores exact material/plan hashes, original record IDs, bounded batches,
pre-dispatch attempts and model/job/revision-linked responses. Every request pins
the detailed target and all its supporting sources; the complete mandatory evidence
union is partitioned without truncation. Up to 32 batches receive reads followed by
frozen-draft checks, with four cumulative requests per step, a 96k request context
and 18k draft reserve. An explicit action permits up to 32 requests/15 minutes;
timeouts, Stop and shutdown retain spent attempts and completed receipts. Nothing
publishes until the store independently replays the entire ledger and verifies the
exact final draft and evidence union under ordinary refinement authorization.

Reopen/retry and portable continuation preserve receipt hashes, attempts, target
identity and compatible work; session IDs are not exported. The browser receives
progress counts, not full ledgers. Unknown future ledger/stage formats reject rather
than overwriting saved work. Completed staged checks retain their ledger in portable
projection instead of using the legacy compact completion receipt.

**Continue refinement** binds the current revision and latest saved job, reconstructs
its exact evidence, and resumes that requirement only. Changed evidence rejects
this continuation before inference. A separate explicit **Refine** action may start
a fresh plan for genuinely changed material, retaining the older dated ledger.
Unrelated revisions with equivalent material do not force repeated completed steps.
Indivisible target/support, excessive batches, failed verification, oversized exact
retrieval and exhausted attempts remain blockers; no automatic allowance reset or
research/pair-resolution fallback is introduced. No downgrade compatibility with
apps that do not understand these additive ledgers is promised.

Deterministic tests cover overflow and the unchanged small-task path, all-batch
publication, queue task isolation, malformed outputs/attempt retention, tampered work,
conflicts, exact retrieval, stale revisions, cancellation, repeated SQLite reopen,
portable adoption and future-format rejection. The focused browser check covers
progress, metadata-only polling, Stop/reload, explicit continuation, receipt reuse,
proposal-only publication and mobile layout. No personal-project writes or live
provider inference were used. Pair refinement was excluded from this first slice;
the follow-up above adds its separate format-2 protocol.

Verification: `npm test` passed 939 tests (276 pretests + 663 main); the final
local-repacking/schema changes additionally passed 70 targeted refinement,
portable and queue tests. Type check, UI build, focused refinement browser check
and diff whitespace check passed. `npm run test:browser` passed workspace layout
and model selection, then stopped at the existing obsolete **Project map** tab
locator in `src/web/browser-check.ts:706`; later aggregate runners did not execute.
Screenshot: `.reqwizit-state/browser-refinement-stages-mobile.png`. Actual provider
quality and the reported personal project's completion remain unverified.

## Explicit extra saved-response requests and isolated staged prompt (2026-10-26)

Source/target: existing exact-submission format-1 ledgers gain optional
`allowanceExtensions`, each naming a step, four additional requests, consent revision
and the exact stopped job. No SQLite schema/version, task/material/plan fingerprint,
project revision, input/source or existing receipt rewrite. Existing ledgers without
extensions retain four attempts per step. Receipt/attempt validation supports up to
eight **only** for a step with one validated extension; duplicate/out-of-range grants
reject. Up to 512 receipts cover the existing 64-step maximum at eight attempts.
Grant records survive reopen and portable projection. Unsupported future grant
values reject rather than resetting work; older apps cannot interpret extended
ledgers and should not be used to downgrade them.

`process-responses` accepts the optional exact `resumeJobID`,
`additionalRequests:4` and `confirmAdditionalRequests:true` together, for one saved
submission only with research disabled. Auth/origin/revision, selected-record and
worker guards still apply. The immediate transaction checks the latest exhausted
job, its submission link, current evidence and unresolved replay outcome, then
appends one extension without refunding any spent attempts. Concurrent/repeated
grants cannot extend the same step twice. If task startup fails after consent, the
saved grant remains available for ordinary explicit processing; it is not granted
again. Later steps retain their own original four-request limits. Eight attempts
is the hard extended limit, not an automatic repeating budget.

The queue exposes metadata-only attempt/limit/can-extend values and a **Review
additional allowance** action. Opening it makes no calls. **Allow 4 more requests**
explicitly consumes AI allowance for the named unfinished step while preserving
loaded records and completed reads/checks. Other submissions remain waiting and no
gap discovery or research starts. Nothing is granted on upgrade, render or reload.

The reported four spent attempts comprised exact retrieval, the older permission
blocker, more exact retrieval and a rejected out-of-authority draft. Staged prompts
no longer embed ordinary discovery's competing/global instructions and schema.
They use a dedicated bounded draft contract with empty global fields, no pair
resolution, organization, research or assessment, while retaining current-source
authority, exact support loading and all-batch checks. The persisted response parser
is unchanged so original wire receipts remain replayable. This prevents a contract
contradiction, not a guarantee of correct provider output or semantic completion.

Tests cover prompt/schema restrictions, older exhausted ledger reopen, failed
consent/auth/origin/revision/bulk/research requests without writes/calls, attempt 5
after explicit consent, original receipt/retrieval reuse, later-step limits,
selection isolation, duplicate grant rejection, portable preservation and future
grant rejection. Read-only inspection confirmed that the personal step remains at
four attempts with three saved receipts and is eligible to request this extension;
no grant, personal write or live-model call was performed by the agent.

Verification: **928 tests** passed (266 pretests + 662 main), the final 14 staged
tests, type check, UI/desktop builds, focused browser and diff check. The browser
regression opens the allowance review without requests, confirms the exact-job
four-call grant and finishes saved work without repeating its completed read. The
aggregate browser runner passed layout/model selection before the existing
Project-map locator failure (`src/web/browser-check.ts:706`); later aggregate checks
and Electron titlebar behavior remain unqualified. Actual personal-project provider
completion has not been exercised.

## Staged revision-permission evidence loading and blocker recovery (2026-10-26)

Source/target: unchanged SQLite and exact-submission format-1 task/material/plan
identities, with two additive, validated optional ledger fields. New receipts record
`permissionPolicy: staged-target-evidence-v1`; an explicit continuation of an affected
older ledger can add `permissionRecovery` (format 1, same policy, original receipt
index and recovery job/revision). These fields are retained in portable continuation.
Unknown future recovery formats/policies reject rather than replacing saved work.
No startup rewrite, database schema bump, project revision or automatic model call
is needed. Existing receipt response bytes, hashes, models, IDs and spent attempts
are never rewritten. Material/context/plan hashes are deliberately unchanged.

The ordinary prompt required the detailed target **and all its source records in
the same request** before listing it as revision-eligible. Reusing this rule inside
exact batches produced an empty permission list when a loaded accepted target had
support in another batch. Staged prompts now distinguish candidate eligibility from
evidence loading: target and support must belong to the complete mandatory material,
and missing support IDs are listed for explicit retrieval. Before a new/changed
specification update is accepted, all original target source records must actually
be loaded in that request. Normal input boundaries, pending replacements, semantic
conflicts, frozen-draft checks and atomic publication remain enforced. Ordinary
single-request permissions are unchanged; this is not broader product authority.

Explicit processing reconstructs and replays the old task first. Recovery applies
only to an unmarked legacy `submissionBlocked` read receipt with the structural
empty-permissions/missing-support gap. It records a one-time recovery marker and
allows the **unfinished** read to be re-evaluated under corrected prompts; the old
blocker remains in the receipt list and original job. It does not certify the draft
or ignore a failed verification. New-policy blockers, verification conflicts,
changed evidence/plans, malformed recovery markers and exhausted request allowances
remain blocked. Reopen/retry preserves the marker and prior attempts; completed
reads/checks and previous exact retrieval are reused. New-policy support validation
is applied only to marked receipts so previously valid completed work is not made
stale solely by this stronger per-request evidence rule. Original publication
validation still requires the full exact evidence union for older work.

Tests exercise the actual prompt builder with target support split across batches,
the unchanged ordinary permission list, missing-source rejection/retrieval, durable
legacy blocker recovery after reopen, preserved completed read and attempts 3/4,
portable round-trip, future-format rejection, corrected-prompt/verification blockers
and no allowance reset. A read-only replay of the reported personal ledger confirmed
the structural recovery match, both reported targets in the corrected permission
list, exact original receipts and two spent attempts preserved. No personal database
writes, credentials or live inference were used. Actual provider completion remains
unverified; recovery still needs an explicit processing action.

Verification: **927 tests** passed (265 pretests + 662 main), plus the final 13-test
staged-processing run with portable recovery/future-format assertions. Type check,
UI/desktop build, focused browser continuation and diff check passed. The broader
browser suite was not rerun for this prompt/ledger-only fix; its earlier Project-map
locator failure and Electron titlebar gap remain unqualified. No live-provider or
personal-project publication success is claimed.

## Broad concrete-answer staging and explicit processing-only selection (2026-10-26)

Source/target formats are unchanged: SQLite/job/submission JSON, format-1 exact
submission ledgers, workspace and portable continuation. No schema bump, startup
rewrite, fingerprint change or reset is needed. Overflow-only staging now accepts
concrete answers with **no `answerScope`**, including older reconciliation questions
that cite human sources/confirmations instead of direct requirement IDs. Missing
scope stays missing; original broad authority is neither narrowed nor expanded.
Original input, applied-source identity, completed receipts, attempts and dated
evidence remain intact. Deferred/delegated answers and notes remain ineligible for
this fallback. A new draft may reference its own declared `new:` IDs; undeclared IDs
still reject, and normal publication/authorization validators remain authoritative.
Old valid ledger/context identities are unchanged; no completed inference repeats.

`POST /api/projects/:id/process-responses` explicitly selects 1–128 distinct saved
submission UUIDs with expected revision and optional research (default false).
Authentication/origin/worker guards apply; foreign, conflicted, archived, completed
and resolved historical attempts reject before dispatch. The queue receives exact
IDs and `processOnly:true`, never a general discovery request. Unselected inputs stay
waiting. The primary browser action processes at most 128 eligible inputs without
new research; larger queues can be processed again. Saved inputs take priority over
question preparation; the paused clarification ledger is retained, not certified or
deleted. Processing may still return genuine semantic conflicts for human review.

Upgrade coverage uses a file-backed older unscoped preflight-blocked answer, reopen,
processing, and repeated reopen; input/source/scope preservation and approved-rule
revision are checked. API tests cover selection isolation, authentication/origin,
stale revision, malformed/duplicate/foreign IDs, conflicts, archives, active work,
completed records and no subsequent gap call. Existing staged review/answer
continuation tests remain in place. No user-database migration or inference was run.

Read-only pure planning against the two actual size-blocked saved answers reproduced
168,043/144,000 and 164,608/144,000 ordinary contexts. Both now plan 10 exact batches
(20 steps), retaining 221/230 mandatory records; largest planned request bodies were
49,126/48,575 characters plus an 18,000-character draft reserve, below 96,000. This is
preflight feasibility, not live-model or semantic-completion qualification. The
third unapplied answer was not simulated or written to the personal database.

Verification: **924 tests** passed (262 pretests + 662 main); the final activation
reference restriction and foreign-project API case also passed in a subsequent
35-test focused run. Type check, UI/desktop build, diff check and focused browser
continuation passed. The browser regression checks that retained input replaces the
clarification header action and disables Design continuation without making a call,
then verifies exact-ID processing-only dispatch and reuse of saved work. The full
browser runner passed layout/model selection but again stopped at the existing
Project-map locator (`src/web/browser-check.ts:706`); later aggregate runners and
Electron titlebar behavior remain unqualified. Personal-project processing itself
has not been run; all personal-state access was read-only and no live model was used.

## Clarification recovery controls and diagnostic projection (2026-10-26)

Source/target: unchanged SQLite, job, metric format-1, workspace/portable and exact
readiness/submission receipt formats. No schema/fingerprint bump, startup rewrite,
project revision or inference is needed. Existing original input, receipts, wire
hashes, model provenance and spent attempts remain exact. The action/request limits
and publication validators are unchanged.

The queue now exposes paused clarification progress and a dedicated **Continue
clarification** action even while browsing Specification. When no saved input needs
processing, its header prioritizes that action over general discovery. An optional
`resumeJobID` on the authenticated, consented clarification API binds continuation to
the latest stopped area task and its current evidence; obsolete/foreign IDs or changed
material reject without starting a new task. This request field is not persisted and
does not alter old task/receipt identities. Ordinary new clarification remains a
separate explicit operation. Completed newer area attempts suppress older paused UI
offers; opening/reloading the workspace never grants inference allowance.

Diagnostic export now projects existing readiness/submission policy, anonymized plan
group, saved attempts, accepted read/check counts, total/remaining steps, phase and
the appropriate continuation action directly from bounded SQL metadata. Retrieval
and blocked receipts are not counted as completed read/check steps. Older saved
ledgers gain this visibility on re-export without any row rewrite. Existing downloaded
exports cannot recover missing metadata themselves. Historical request categories
already stored as `other` remain unchanged; only new measurements recognize staged
analysis/load/blocked wrappers. Unknown historical interruption causes remain null,
not inferred from a 32-request count. Unsupported future stage/metric formats reject
without writing. No source prose, IDs, hashes, credentials or diagnostic messages
are exported; added fields are allowlisted metadata only.

Regression checks cover read-only projection after durable reopen, exact receipt
retention, future-format rejection, private-value exclusion, staged response labels,
retrieval-vs-completed counts, latest-attempt UI selection, stale/foreign continuation
rejection and browser continuation from Specification without repeating a saved read.
Actual user-project continuation and live-provider reasoning remain unexercised.

Verification: 921 tests (260 pretests + 661 main), type checking, focused browser
continuation, UI/desktop builds and diff check passed. Layout/model browser checks
passed in the aggregate runner before its unchanged Project-map locator failure;
the later aggregate runners and prior Electron titlebar gap are not claimed passing.
Only the attached metadata export was inspected, not the user's application database.

## Oversized targeted saved-response continuation (2026-10-26)

Source: existing saved/applied review submissions and requirement-scoped answers,
including older `contextBlock` failures before job creation. Target: unchanged
SQLite/workspace versions with an optional format-1 `submissionWork` JSON envelope,
policy `exact-submission-batches-v1`, and matching `context.submissionStage`.
Existing completed jobs, submission/source IDs, exact input, revisions, assessments,
clarification ledgers and portable evidence identities are not rewritten or rekeyed.
No startup inference or reset is required. Explicit processing first tries the
unchanged one-shot planner; only overflow uses the new ledger. Older completed
one-shot work is not invalidated or repeated solely because staging is available.

The ledger pins the original submission identity/input/scope, locally planned
mandatory record union, plan/material hashes and exact batch coverage. Each request
fits 96k characters with an 18k bounded draft; preflight reserves that draft and
keeps the original initial source and task records detailed in every batch. All
other mandatory records are partitioned without summarization or silent omissions.
Every batch is read, then the frozen draft is checked against every batch. New or
changed actions may cite only that request's detailed evidence; exact unchanged
actions can be retained. Up to eight exact cross-batch records may be requested.
A negative check blocks publication; it cannot silently rewrite a previously
checked draft or certify conflicting human choices as reconciled.

Attempts persist before dispatch (four per unfinished step); accepted responses,
wire hashes, model/job/revision provenance and step counters persist before further
planning. Each explicit action is bounded to 32 requests/15 minutes, with per-request
five-minute timeout/cancellation. Restart, publication-only retry and portable
adoption replay completed work without inference. Continuation retains the
original saved task scope even if the browser's feature selection changed; current
mandatory evidence is still recomputed and validated. Final publication replays the
entire exclusive ledger against current material and then uses ordinary review,
scope, evidence, revision/lease and specification-update checks in the same atomic
transaction. Failed/cancelled/stale work does not reapply human input or partially
publish. Changed mandatory evidence rejects with the old ledger retained, not
silently marked current or regenerated. Unsupported future formats reject on read.

Portable continuation retains the latest useful ledger plus linked waiting input;
browser snapshots expose derived `submissionProgress`, not full receipt bodies.
No database migration is necessary for old rows lacking the optional envelope.
This policy supports targeted reviews and server-scoped concrete answers, not
general notes/unscoped legacy answers, pair-resolution passes, or research-enabled
work. Research must be explicitly disabled; it is never silently switched off.
Indivisible target/base evidence, supplemental overflow, exhausted attempts, genuine
conflicting evidence and more than 32 batches remain specific preserved blockers.
Actual user-project and live-provider staged reasoning are not yet qualified.

Upgrade/recovery verification: eight new deterministic tests passed, including an
older applied pre-job context blocker, durable reopen, strict future-format rejection,
portable adoption into an empty database, unchanged receipt identity and zero-call
completed-ledger publication. All 917 tests, type check, UI/desktop builds and the
focused saved-review browser continuation passed. Broader browser verification still
stops at the pre-existing Project-map assertion; the earlier Electron titlebar gap
was not rerun. No personal project or live inference was exercised.

## Clarification publication aliases (2026-10-26)

Source/target: unchanged SQLite/job/portable formats and exact clarification
receipt policy. Older completed drafts may contain malformed or duplicate question
`localID` declarations accepted during questions-only read/check stages but rejected
by ordinary round publication. These aliases are not durable question identities.

`ProjectStore.finishJob` now validates the original one-shot clarification output,
or replays and compares the exact staged ledger, **before** dropping only question
declaration aliases from the publication copy. Ordinary discovery alias validation
is unchanged. Evidence references, options, text, scope, exclusivity and all-batch
verification still validate; aliases in references are never repaired or remapped.
The existing round machinery allocates permanent question IDs atomically.

No startup rewrite, schema/fingerprint bump, receipt mutation or model request is
needed. Completed ledgers resume through explicit **Continue clarification** with
zero inference when evidence remains current. Original receipt responses, context
hashes, attempts and history remain exact across reopening and portable export;
failed publication rolls back and leaves that work available to retry. Genuinely
stale, malformed or incomplete work still rejects rather than being certified.

Regression checks cover file-backed failed completed work, repeated reopen,
portable round-trip, zero-call continuation, unchanged question content/evidence,
substantive draft tampering, one-shot invalid/duplicate aliases, and rejection of
invalid evidence and ordinary discovery aliases. Verification: type check, all
909 tests (249 pretests + 660 main), focused Specification/browser continuation,
desktop/UI build and diff check passed. No model calls were made for this fix.
Actual user-project publication has not been exercised; the previously recorded
Electron titlebar smoke-test gap is unchanged and that check was not rerun.

## OpenCode V1 to V2 transport and credential ownership (2026-10-25)

Source: V1 server SDK `@opencode-ai/sdk@1.18.32`, legacy npm executable selection and
V1 credential management. Target: `@opencode/client@2.1.4`, native V2 API and V2-owned
credential management. User explicitly approved this migration after diagnosis of
the installed V1 1.18.32 / desktop V2 2.1.4 split and persistent refresh-token 401s.

No Reqwizit SQLite, settings, portable/workspace or saved-job format changes are
needed: the transport is projected into the existing app contract. Original project
IDs, evidence, model/provider selections, optimistic revisions, accepted assessments,
delivery proofs and staged read/check receipts/attempts remain unchanged. No identity
or freshness policy version is changed merely for a transport upgrade. Existing
OpenCode selections route through V2; direct-provider selections remain direct.
Root and staged-desktop production dependency locks are upgraded together; rebuild
the desktop with Reqwizit closed so Windows can replace its native SQLite module.
There is no startup model call, reset, receipt re-fingerprinting or automatic replay.
Older saved-data reopen/reuse/portable tests continue to exercise the same formats.

Reqwizit does not read, import, rewrite or copy provider tokens from `auth.json` or
the V2 database. OpenCode owns its documented one-way legacy credential import and
future refresh/sign-in flows. The adapter neither downgrades to V1 nor switches a
failed account/model/response format. Explicit V1 executable overrides reject before
session creation. Runtime-owned loopback authentication is generated in memory and
never saved to project data or diagnostics. User desktop/shared servers are not
reconfigured or stopped.

Saved runtime session IDs are retained; V2 must be able to retrieve them for any
coding-session recovery. Missing sessions fail without silently creating a replacement
or repeating completed work. V2 message projection preserves user/assistant/skill
content; idle markers are not counted as a later assistant response. Native queue IDs,
terminal outcomes and model identities are verified before accepting new output.
Unsupported attached input is rejected rather than omitted from the text-only
application projection; system/synthetic text, compaction summaries and shell output
remain included in bounded history accounting.
In-flight/V1 coding-session migration remains a specific live qualification gap;
the migration does not manufacture that provenance or upgrade old manual progress.

Deterministic transport tests cover metadata projection, pagination, queue/terminal
matching, wrong models, failed outcomes, intervening inputs, earlier tool activity,
cancellation/interrupt and V1-binary rejection. Existing persisted-data regression
tests and staged clarification/portable reuse tests remain registered. Live evidence
is limited to V2 provider/role metadata, synthetic JSON output recovery and one
skill-backed assessment; the actual user project and coding/GitHub delivery were not
exercised. See [runtime checks and limits](runtime-spike.md#current-opencode-v2-adapter-2026-10-25).

## Indexed clarification draft retention (2026-10-25)

Source: format-1 `exact-readiness-batches-v1` work without `indexedRead`. Target:
the same envelope with optional `indexedRead: {format: 1, fromReceipt: N}`. On an
explicit continuation only, after successful legacy replay, N pins the existing
receipt count. Earlier requests retain their exact wire hashes, material/plan keys,
responses and model provenance; no old row is rewritten or successful call repeated.
The indexed instruction is added only to requests at/after this boundary. Completed
legacy work needs no upgrade. No startup inference or optimistic-revision reset occurs.

Read responses may use `clarificationRead {summary, keepQuestions, questions}`:
the engine copies kept draft questions by zero-based index with all metadata intact.
Only new/revised questions require citations loaded in the current request. Retained
AI questions are still untrusted proposals; every final question must survive the
unchanged all-batch check pass. Duplicate/out-of-range indexes, unloaded new citations,
unauthorized edits and read responses during checking reject atomically. Canonical
analysis parsing preserves publication equality and stable question metadata.

Indexed work has a fixed **four total dispatched requests per unfinished step**
(including evidence retrieval and failed requests), versus the legacy three. This is
an explicit bounded protocol allowance change, not an attempt reset: an old failure
at three keeps its three spent calls and can use only the fourth. Repeated continuation,
reopen or import cannot renew that allowance. The receipt ceiling is 256 (64 steps ×
four); legacy unupgraded receipts still cannot claim a fourth request. Per-action
32-request/15-minute and 96k context limits remain unchanged. Portable continuation
validates and retains the boundary; unknown future marker formats reject unchanged.
Older app versions reject the new field, so do not downgrade upgraded work.

Regression tests reconstruct four legacy completed reads plus evidence follow-ups and
third-attempt citation failure, then resume with one fourth request without replaying
the earlier calls. The actual reported question response was not supplied, so this
does not establish whether that particular response reworded a prior question or
introduced a genuinely new unloaded citation. Live-project recovery remains unverified.

## Resumable exact Design clarification (2026-10-25)

Source: existing SQLite JSON jobs and unchanged format-1/2 question tasks. Target:
the same database/project/portable envelopes, with optional `Job.readinessWork`
format 1, policy `exact-readiness-batches-v1`, and matching `context.readinessStage`.
No database schema, project revision, evidence ID, assessment identity or successful
old receipt is rewritten on startup. Fitting one-shot tasks keep their original
behavior; oversized manual format-2 tasks stage only after explicit consent. Old
oversize failures remain dated; another explicit Clarify action can start this path.

The ledger pins exact original records, task/material/plan hashes, accepted
responses, model identity and spent attempts. Every mandatory record occurs in one
read batch and is checked again against the final draft. Requests remain bounded to
96k characters, originally with at most 32 batches, 192 receipts and three dispatched
requests per unfinished step (superseded for indexed work by the four-request/256-receipt
upgrade above). An action defaults to 32 requests/15 minutes; completed steps
and pre-dispatch attempts survive pause, cancellation, failure and restart. No
partial draft publishes. Supplemental exact evidence that cannot fit is a specific
blocker, not silently dropped. Semantic evidence changes reject old work as current;
an optimistic revision change alone does not invalidate exact receipt hashes.

Portable continuation keeps the latest useful ledger rather than the full activity
archive, with matching task/plan validation and no runtime session/lease/account
secrets. Unsupported future work formats reject on local read/import without
overwriting saved work. Browser snapshots omit the ledger and expose only completed,
total and phase progress. Old readers may reject this additive job field; do not
downgrade after creating staged work. Interrupted work requires explicit **Continue
clarification**, never startup inference or automatic replay.

Deterministic checks cover >416k distributed evidence, full read/check coverage,
last-batch pruning, exact retrieval/replay, malformed output, spent attempts,
stale/cancelled results, bounded actions, file-backed reopen and portable
continuation in an empty store. Actual user-project and live-provider qualification
remain outstanding; this migration does not establish either.

## Exact task context and read-only pending input (2026-10-25)

Source/target: unchanged SQLite schema, project records, submissions, workspace and
portable envelopes. Existing fitting single-task contexts are attempted first and
retain their original bytes/identities. New overflow-only saved-input/refinement
planning opts into existing exact snapshot references and literal phrase sharing;
historical/staged context reconstruction still uses its original policies. Saved
responses keep their existing 144k mandatory cap; new isolated refinement/manual
area-clarification fallbacks may use 144k only after exact compaction. No attempt,
lease, successful receipt, score or source identity is reset. Indivisible evidence
above the applicable cap remains blocked without a call. This supersedes the older
ordinary-refinement 96k boundary only for this new, explicitly compacted fallback.

Format-2 area tasks add optional bounded `pendingSourceIDs` (at most 128 unique,
canonical sorted IDs). Absent fields preserve existing format-1/2 task/context
identities exactly. Present fields pin already recorded human evidence whose AI
follow-up remains unfinished; task input hashes still bind current exact project
evidence. A dated assessment/blocker may be inspected with those sources as a
hypothesis, never relabelled current. The source blocker hash additionally binds its
original input key when this pending-input mode is used. Unknown/foreign/missing
sources reject; no omitted input is treated as read. Publication remains questions-
only and cannot complete submissions or rewrite requirements. Old readers may reject
the new optional task field; do not downgrade after using it.

The gate excludes unrelated/resolved/archived/explicitly superseded submissions but
still blocks relevant unapplied or conflicted input. Already applied input is reused
verbatim, not reapplied. No startup write/model retry or personal-data repair is
performed. Existing failed diagnostics stay dated; explicit action replans unfinished
work. Portable task validation accepts the additive field through the shared task
schema while retaining its exact source IDs; no activity archive export is added.

Regression fixtures cover a 161,713-character mandatory context reduced to 107,479
with exact independent decoding, unchanged fitting-context bytes, genuine oversize
failure, file-backed blocked-input reopen/explicit retry/no duplicate sources, scoped
gating, and read-only clarification preserving applied failure status and dated
assessment evidence. Real supplied-project and live-provider recovery remain
unqualified; no personal database was changed or paid probe repeated.

## Area clarification and assessment inbox correction (2026-10-25)

Source: unchanged SQLite/project/workspace formats and format-1
`readiness-questions-v1` dimension tasks. Target: the same envelopes, accepting both
the unchanged format-1 task and additive format-2 `definition-area-questions-v1`
tasks (`dimension: area-review`, input/check hashes, optional `blockedJobID`). No
schema version or optimistic revision reset is needed. Task formats remain separate
from project/settings concurrency counters. Future task formats reject without
overwriting saved work. Older app versions may reject new task variants; do not
downgrade after creating them.

The excessive partial-category inbox is corrected by projection only: no assessment
is deleted, marked defined, re-fingerprinted, or reassessed on startup. Existing human
clarification notes stay ordinary input and are never retracted or replayed. Current
stopped job blockers retain their optional manual editor, with explicit AI clarification
as the primary path. Area requests do not authorize specification updates or coding.

Format-1 task identity and exact context instruction bytes remain unchanged. Existing
completed area receipts are reused; when exact current format-1 no-question receipts
cover every unresolved dimension, manual area clarification also reuses those results
without repeating equivalent model calls. Format-2 blocker contexts verify the source
job's project, area, input identity, reason and evidence hash at preparation/publication.
Stale/foreign/missing/oversized evidence cannot become an invented user preference.
Failures/cancellation preserve original evidence and need explicit continuation.

Portable continuation now retains current format-1/2 clarification receipts and any
exact source blocker needed by a current format-2 task, without exporting unrelated
activity history. Existing exported checkpoints that already omitted such receipts
cannot recover evidence that was never shared. No startup/model replay or full archive
export is introduced; sessions and account selection remain excluded.

Tests cover large category lists without correction forms/counts, exact old/new receipt
reuse across repeated SQLite reopen, malformed/stale/cancelled publication, source-job
validation, bounded evidence, authenticated/revision-bound consent, and portable
receipt/source retention with clone reuse and unsupported future-format rejection.
Actual user-database upgrades and live model reconciliation remain unqualified.

## Definition findings in Specification (2026-10-25)

Historical initial manual projection; the excessive category inbox is superseded by
the area-clarification correction above.

Source/target: unchanged SQLite, project JSON, job, workspace and portable formats.
`src/core/definition-decisions.ts` projects existing assessment checks and recent
explicitly blocked jobs into Specification review cards. No migration, fingerprint
change, checkpoint invalidation, startup write or startup model call is needed.
Old saved jobs with the existing `definitionBlock` reason work without a newly
classified conflict field. Missing/changed input identities are shown as earlier
findings, not manufactured current provenance. Newer area jobs suppress older job
blockers; archived areas are excluded. The existing recent-job window still limits
retrospective visibility; no full-history blocker indexing is introduced.

Explicit human clarifications use the existing note/submission format and queue
consent. Notes distinguish the quoted AI finding (context only) from the human's
decision; original evidence, prior answers and accepted work are not rewritten by
the projection. Pending/failed follow-up stays pending/failed. Saved-only input is
not replayed on reopen; an affected refresh must establish resolution normally.

Compatibility fixtures cover older saved payloads, repeated projection, unchanged
records, stale identities, newer jobs, archived areas and neutral technical blockers.
The focused browser fixture covers failed-save draft retention, filter changes,
save-only correction/reload and no inference or requirement mutation on save. This
does not qualify an actual user's database upgrade or live model conflict resolution.

## Refresh-owned definition allowances (2026-10-25)

Source: exact definition ledgers where each dispatch (including a valid evidence
request) consumed one of three attempts. Target: the same SQLite/job/portable/work
envelopes with optional strict format-1 `allowancePolicy` (`fromStage`,
`legacyRecoveryStages`). Raw attempt fields now allow up to 12 only at/after this
policy boundary; unversioned expanded counters reject. The bounded follow-up ledger
widens compatibly from 192 to 512 entries to support at most eight valid evidence
responses per step across 64 steps. These are request accounting changes, not a
change to assessment meaning, inputs, plan keys, evidence or freshness identities.
Schema/migration metadata remains separate from project optimistic revisions.

Replay validates original saved receipts/requests before enabling the policy at the
unfinished step. The policy is not added to prompts, so original request hashes and
response bytes stay unchanged. Successful **saved and validated**, same-step evidence
responses are counted separately from failed/unfinished requests. Failure charge is
raw dispatch count minus those evidence responses, plus any legacy recovery dispatch
that the old saturated three-attempt counter did not represent. Old issued recovery
grants are conservatively retained (including pre-dispatch interruption), never
regranted or refunded. Unknown/unsaved/malformed/interrupted outputs receive no credit.
There is no app-start rewrite, app-data reset, repeated completed model call or
automatic startup dispatch. Unsupported future policy formats reject without writes;
older readers may reject new fields/counters, so do not downgrade after continuation.

Each unfinished step permits three failed/unfinished requests and up to eight valid
evidence requests, with 12 total dispatches as an independent ceiling (including the
single explicitly authorized extra request). The current raw counter continues
increasing: a legacy three-call step with one valid evidence response can make call
four as part of ordinary Refresh, retaining all three original calls and their
outcomes. No genuinely failed call is erased. Acceptance advances the step as before;
indivisible 96k evidence, 64-step, stale revision and genuine model blockers remain.

The main **Refresh definition coverage** flow now owns additional-request consent.
The authenticated revision-bound API accepts a strict optional list of distinct
area/latest-job pairs (at most 64), only with `confirmAdditionalRequests: true`.
Every pair is checked against current exact-input history, selected scope and the
existing one-grant-per-step eligibility before dispatch. UI Cancel/reload starts no
calls; metadata/settings/history cannot authorize extra requests. Only listed areas
receive a single additional dispatch. If it saves the exhausted step, the same
refresh automatically continues remaining ordinary steps/areas. A failed/unfinished
extra request cannot acquire another grant. The older `recover-definition` API
remains a compatible single-request action, but is no longer a separate UI workflow.

Existing transactional checkpoints persist the policy and incremented raw attempts
before dispatch, the validated evidence before granting credit, and accepted steps
before continuation. A crash before a result checkpoint keeps its attempt charged;
after checkpoint it reuses exact saved evidence without redispatch. Original jobs
remain immutable. Upgrade tests reopen a nine-step, three-call legacy ledger twice,
complete on call four without recovery, reopen/export/replay again, and verify
original request/response bytes. Tests also cover eight evidence requests, a ninth
assessment call, hard limits, genuine repeated failures, legacy spent recovery,
future policies, invalid IDs and cancellation/stale results. Browser fixtures cover
inline multi-area consent, auth/origin/revision/scope/job checks, automatic remaining
continuation, cancellation/reload and desktop/mobile layout. No personal-project
recovery or live provider call was run.

## Linked exact evidence follow-ups (2026-10-25)

Source: exact definition work with a single `evidenceRequest` per step/lineage,
including saved model blockers saying the permitted evidence request was already
used. Target: the same SQLite/job/portable/work envelopes with optional strict
format-1 `evidenceFollowupPolicy` and append-only `evidenceFollowups`. No startup
rewrite, schema counter, plan/input/freshness change or reassessment of completed
work is required. Unsupported future policy formats reject without overwrites;
older strict readers may reject the added fields, so do not downgrade readers.

Replay precedes enabling the policy at the unfinished `fromStage`. `priorRequests`
records how many original requests preceded the new contract, so their original
contexts can replay without the added instruction. Already-attempted legacy steps
with no supplemental evidence retain their existing contract. Each follow-up stores
stage, original evidence owner, pre-request split count/context hash, raw validated
record-ID request, spent attempts and job/model provenance. The bounded ledger permits
up to 192 follow-up receipts, with at most 20 new exact record IDs per response.
The original three-attempt limit (superseded by [separate evidence/failure accounting](#refresh-owned-definition-allowances-2026-10-25)), explicit single recovery grant, action allowances,
96k request and 64-step bounds remain independent and unchanged. A spent attempt
cannot return multiple requests except the separately spent authorized recovery
request at attempt three. No refresh refunds attempts or manufactures provenance.

Follow-ups accumulate full exact evidence for the unfinished lineage. Additional
subdivisions keep all already requested/restored records alongside each remaining
child. Stage boundaries exclude later evidence from earlier accepted contexts;
pre-request split counts reconstruct each follow-up's original context before later
repacking. Original request/child response hashes and bytes are retained. Earlier
accepted children do not replay model calls or gain evidence retroactively.

An explicit continuous/manual refresh can supersede an old **one-request protocol**
block only when its diagnostic names saved canonical IDs directly linked by supplied
records' `sourceIDs`, `sourceID` or `evidenceIDs`. Up to 20 named unsupplied planned
records are loaded locally; this is evidence retrieval, not approval inference. The
policy retains the old diagnostic and the restored IDs, evidence owner and pre-upgrade
split count. Replay independently checks those IDs against the exact saved links and
diagnostic. Unlinked/invented/out-of-plan IDs, genuine unrelated blockers and
already-upgraded blocks are not silently cleared. Bounded/automatic maintenance does
not clear old blockers. Historical jobs remain immutable.

An exhausted three-attempt step remains exhausted after local restoration. Manual
refresh can then expose the existing explicit **Recover assessment** action; only its
separate one-request consent permits inference. Loading exact records never establishes
that accepted cleanup wording was approved by a human, extends body-collision approval
to a separate hurt-detection region, or declares a product feature missing.

Existing transactional checkpoints save the policy and each follow-up before the
next dispatch. A crash/reopen after checkpoint does not repeat the saved request;
an interruption before checkpoint retains its spent attempt, not an unsaved response.
Startup does not dispatch. Tests cover repeated SQLite reopen, portable replay,
legacy policy/request bytes, linked diagnostic restoration, genuine blocks, explicit
exhausted recovery, later-child repacking, tampered hashes, future formats, invalid
IDs, cancellation/stale responses and unpublished partial work. No personal-project
recovery or live model call was run.

## Exact supplemental evidence repacking (2026-10-25)

Source: exact-batch work with saved `evidenceRequests`, including a 96k supplemental
overflow before any supplemented assessment was dispatched. Target: the same work,
SQLite and portable formats, with an optional `evidenceRequestStage` on append-only
format-1 continuation splits. This binds each child to the original request's full
exact supplemental records. No startup rewrite, input/plan/freshness change, schema
counter bump, or repetition of completed assessment/model calls is required. Older
strict readers may reject the added split field; use the updated reader, not a downgrade.
Unknown future continuation formats and invalid inheritance reject without overwrites.

On explicit continuation the saved ledger replays first. If the combined context
exceeds 96k, only the unfinished base batch is bisected. Every child retains the entire
requested evidence group, the current complete assessment draft, and all exact base
records in its own partition. Children cannot request that group again. The original
one-request restriction is superseded by the [linked follow-up policy](#linked-exact-evidence-follow-ups-2026-10-25),
within existing spent-attempt allowances. Original base records remain scheduled exactly once;
all read/check steps still finish before publication. The original unfinished child's
spent attempts remain spent (e.g. two saved attempts means its next call is attempt
three); subsequent children use the existing per-step allowance, not a reset of that
unfinished step. No paid request is used to find a fitting local partition.

Replay reconstructs the original evidence-request context **before** its marked
repacking splits, while accepted child contexts include only the subdivisions active
at their receipt boundary. This preserves original context hashes, response bytes,
provenance and retrieval IDs rather than overwriting the original request or treating
its summary as evidence. Existing transactional checkpoints persist each split before
dispatch. A crash before checkpoint leaves the previous ledger eligible for the same
local repacking; after checkpoint it resumes the saved schedule. Accepted child steps
and the original evidence request are not redispatched after reopening/export/import.

The 96k and 64-stage limits stay in force. If the full requested group plus draft and
one indivisible base record cannot fit, or no further stage is available, retain the
block without truncation or partial publication. Old overflow diagnostics remain in
their immutable jobs; continuation does not claim those earlier runs succeeded.

Regression tests seed nine completed steps, two spent attempts and a saved legacy
supplemental overflow, reopen SQLite twice, repack and pause after the first child,
reopen/portable-replay and finish without repeating saved calls. They verify original
job/request/receipt bytes, exact supplemental text in each child, complete base-record
coverage, bounded request sizes, corrupt inheritance and genuinely indivisible groups.
No personal-project recovery or live model call was run.

## Cross-batch exact definition evidence (2026-10-25)

Source: `exact-batches-v1` definition work without cross-batch evidence support.
Target: the same SQLite/job/portable envelopes with optional strict format-1
`evidencePolicy` (`fromStage`, optional `supersededBlock`) and `evidenceRequests`.
Each request records its stage, original context hash, canonical record IDs/reason,
spent attempts, selected model and job provenance. No startup rewrite, schema counter
or input/plan/freshness identity changes, reassessment of completed work, or automatic
model call is required. Unsupported policy formats reject rather than overwrite;
older strict readers may reject these optional fields, so do not downgrade readers.

Original receipts replay before enabling the new contract at the unfinished boundary.
Earlier contexts/responses remain byte-identical. One request of 1–20 distinct records
per stage may supplement the current batch, only from the saved area's complete plan.
Invented/current/duplicate references reject. Returned records are exact, losslessly
encoded and reflected in context manifests/citation authority. All original batches
still require collection and verification before publication. Supplementation does
not certify supersession, expand an approval's scope or waive a real contradiction.

Only an explicit continuous/manual refresh supersedes an old model blocker that
mentions earlier/retained exact evidence not supplied/included/repeated (or in another
batch), with a retained draft citation outside the current batch. This diagnostic-based
rule replaces the old protocol limitation, not a human decision; its original reason
is preserved in the historical job and `supersededBlock`. Other legacy blockers and
all already-upgraded model blockers remain blocked. Exhausted budgets do not reset.

Evidence requests consume the existing three-attempt limit (or an already authorized
single recovery grant), timeout and action allowance. The existing transactional
checkpoint saves the request before dispatching a supplemented assessment; a crash
after it reopens without repeating that request. A crash before the response checkpoint
retains the spent attempt, not an unsaved response. Replay validates each evidence
request's original context and final accepted-stage context. No partial score publishes.
The original implementation kept combined requests over 96k blocked with requested
IDs retained. The [repacking follow-up](#exact-supplemental-evidence-repacking-2026-10-25)
can subdivide unfinished base records without rewriting the retrieval context.

Upgrade/regression tests cover legacy receipts and blocked diagnostics, exact source
text, attempt accounting, repeated SQLite reopen, portable replay, tampered hashes,
future policy rejection, invalid references, overflow, cancellation and stale results.
No personal-project recovery or live inference was run.

## Accumulated definition explanation bounds (2026-10-25)

Source: compact exact-batch definition responses and stored assessment checks with
4,000-character per-check explanations. Target: the same SQLite, job and portable
formats with up to 96,000 characters per accumulated check explanation. Only compact
definition collection response schemas and stored/engine-built checks widen;
ordinary discovery responses remain at 4,000 and verification verdicts at 2,000.
The full exact evidence-plus-draft request must still fit 96,000 after lossless
encoding; a valid explanation is not permission to omit evidence or bypass this
independent bound. Such an overflow retains the original response and blocks without
publishing partial coverage. Concise explanation targets remain unchanged.

This is a compatible validator widening, not a freshness/meaning change. There is
no startup rewrite, schema-counter bump, reset or reassessment of completed work.
Original contexts, plan/input keys, response bytes, citations, IDs and attempt
counts are unchanged. Explicit resume reuses every accepted stage; a previously
rejected oversized response was not saved and cannot be recovered retrospectively.
Its spent attempt remains spent; no automatic repeat or extra allowance is granted.
Existing checkpoint transactions handle interruption as before. Unsupported future
formats still reject. Older readers may reject new explanations longer than 4,000;
use the updated reader when reopening/exporting this work, not a downgrade.

Regression tests seed seven old-format accepted steps and one failed attempt,
reopen SQLite twice, continue with >4k Unicode/CRLF explanations, and verify original
jobs/receipts, attempt two, final SQLite reopening and portable replay without
completed-call repetition. Additional checks cover long initial findings, the 96k
field and exact-context bounds, private rejected text, and unpublished partial work.
New validation diagnostics identify numeric string/array limits without echoing
rejected model values; old diagnostics remain historical.

## Additive definition collection citations (2026-10-25)

Source: exact-batch definition ledgers without `collectionCitationPolicy`. Target:
the same ledger/SQLite/portable versions with optional strict format-1
`collectionCitationPolicy` (`fromStage`, optional `supersededBlock`). Completed work
and freshness identities are unchanged. No startup rewrite or inference is needed.
Future policy formats reject rather than overwrite. Older readers may reject the
new optional strict field; do not downgrade portable readers after continuation.

After replaying the original receipts, continuation enables additive citations at
the unfinished stage. Compact collection updates still return at most 20 citations
per changed dimension; the engine unions these with all retained citations, using
the existing 1,280-citation accumulated-result validator. Status/importance/explanation
updates still replace that dimension's finding; omitted checks remain unchanged.
Exact citation authority, full evidence verification and the 96k request bound stay
in force. Collection must preserve supported earlier findings, not just citations.

Only a manual continuous definition refresh can supersede the reported legacy
protocol block: the saved collection draft must already contain at least 20
citations in a dimension, and the diagnostic must mention 20, citations, the
response limit, the retained assessment, and explicitly state that no missing
product decision or product gap is established by the blocker. This narrow
diagnostic-based compatibility rule does not waive general model evidence blocks.
The old job remains immutable; its reason is also retained in `supersededBlock`.
Legacy full-analysis collection switches to compact updates at that same receipt
boundary, even if an unfinished attempt was spent. Original request hashes,
responses, partition and spent attempts are preserved; no new allowance is granted.
Automatic/bounded callers retain the recognized blocker without retrying it.

Checkpointing saves the upgraded boundary with the existing transactional job write.
An interruption before that write leaves the old ledger eligible for the same
explicit upgrade; an interruption after it replays the saved boundary. No completed
call is repeated. Tests cover compact/full-analysis old ledgers, repeated SQLite
reopen, original job/receipt preservation, spent attempts, accumulated citations,
portable replay, genuine blocks, invalid boundaries and future-format rejection.

Logs now explain a zero-request blocked run as stopping before a new model request,
not a fresh rejection. Selected-task views explicitly warn that they may not show
the latest run; the newest dated task within the current view is identified without
inventing missing historical times. These are read-only display changes.

## Unified logs and recorded run times (2026-10-25)

Source: existing jobs/planning/execution and browser-session diagnostics. Target:
the same SQLite/execution/portable versions with optional job `createdAt`, `startedAt`,
`finishedAt` ISO strings and optional planning-generation `finishedAt`. Metadata is
separate from spec revision, execution CAS and assessment/checkpoint identities. No
startup data rewrite/backfill, schema reset or model reassessment is required.

New jobs get creation time at insertion, start time only when claimed, and finish
time only on their first persisted transition from pending/running to terminal.
Later telemetry/metrics saves do not rewrite that terminal timestamp. Recovery's
terminal time is the observed state transition, not a claim about when a provider
or crashed worker actually stopped. New planning generation success/failure records
an end time, while previously saved creation dates remain unchanged. Existing
assessments, receipts, selected models, stable IDs, spent attempts and completed work
are preserved. Timing fields survive portable continuation for retained jobs/plans;
the portable job/planning validators explicitly permit them. Do not downgrade
portable readers that reject these added strict fields.

Historical jobs are never stamped merely because they are read. The unified history
API can read an already saved activity-event **Recorded** timestamp, but does not
persist it as a start/end or infer duration from it. Missing starts/finishes/durations
stay unknown. Previously recorded measured durations and existing planning/code-run
creation times are used as their actual evidence permits. Browser-only diagnostics
record their observation time with a distinct label and remain session-only; startup
does not recreate them. There is no full stdout/provider transcript migration.

The new read-only `log-history` API and common viewer replace the separate assessment
history screen, not its underlying data. All saved job types can be searched/paged
in SQL with bounded diagnostic-only responses. Existing `definition-history` API and
older navigation targets remain compatible. No original prompts, responses, account
data or sessions are added to this endpoint. The metadata-only discovery export's
no-timestamps/no-prose contract remains unchanged.

Upgrade tests use legacy payloads without timestamps, repeated SQLite reopen and
unchanged original bytes, portable timing round trips, deterministic transition times,
bounded old-history paging, source/area/search filters, API authentication/origin
checks and absence of model output in summaries. UI tests cover recorded-vs-started
semantics, unknown dates/durations and earlier planning creation times. Unified-log
browser checks cover automatic assessment/discovery visibility, older failures,
filters, timings, redaction/escaping, reload/error retry and mobile without inference.

## Exact staged implementation planning (2026-10-25)

Source: planning format 1 in execution schema 1, including older context-blocked or
partially completed plans. Target: the same envelopes/SQLite schema/portable format,
with optional `stageWork: Record<requirementID, work>`. Each work has `format: 1`,
`policy: exact-planning-batches-v1`, target/input identity, exact record-key batches,
spent unfinished-stage attempts and append-only receipts containing request hashes,
validated output and attempts. The plan retains its original selected-model provenance.
No optimistic revision, assessment fingerprint, completed-package identity or existing
approval is changed. Startup alone does not convert data or initiate inference.

New requests omit full historical assessment bodies from prompts (retained unchanged
in execution state), explicitly supplying only non-evidentiary current/status metadata.
Exact source/requirement/question text may use lossless existing encodings. This is a
request representation/scale change, not permission to infer preferences, bypass
review or change completion semantics. Compatible prior completed packages are reused
without calls. Old failures and previous plan objects remain historical in SQLite.

On explicit retry, existing revision/settings/workspace compatibility gates still
apply. Saved batches and receipts are copied into the new plan, then replayed against
the exact versioned input identity and context hashes before dispatch. Every accepted
response and every spent attempt is checkpointed with the existing execution lease,
expected revision/binding and CAS protections. A crash after a dispatch checkpoint
does not refund the attempt; an accepted response checkpoint before publication can
be replayed/published without repeating it. Up to 32 staged requests run per action;
budget pause spends no new attempt. Completed work is never recreated solely because
the app switched from one-context to staged requests. Genuinely changed inputs retain
previous dated work and require a current plan under existing freshness rules.

Portable execution preserves exact stage ledgers but continues excluding machine-local
session IDs and full plan/activity histories. Read/check requests are fresh read-only
sessions, not saved transcript continuations. Input identities exclude machine-local
paths/bindings so identical portable records can replay after explicit clone adoption;
the normal new binding/settings/revision checks remain required. The staged protocol
and wire rendering must remain immutable for format/policy 1, or receive a new
versioned compatibility boundary in a future change.

Unsupported future stage formats/policies fail on startup, execution reads/writes,
replay and portable decode without overwriting saved payloads. Do not downgrade while
using staged work: older portable parsers reject the added strict field, and older
SQLite clients may ignore it and repeat unfinished requests rather than honor it.
Recovery is explicit restart/Prepare plan with the current app, never reset/delete.

Upgrade tests exercise old context-blocked plans, retained prior packages/history,
partial stage failure and repeated SQLite reopen, portable exact replay, third-party
future-format bytes left unchanged, cancellation/stale rejection, pre-dispatch attempt
accounting and the 32-request pause/continuation boundary. No app-data reset, personal
project write or paid model call is required by this migration.

## Explicit exhausted-definition-stage recovery (2026-10-25)

Source: saved `exact-batches-v1` work, including exhausted legacy UUID-citation
failures. Target: the same work/SQLite/portable formats with optional versioned
`recovery: { format: 1, grants: [{ stage, sourceJobID, jobID, spent }] }`.
No startup migration, revision increment, evidence-fingerprint change or reassessment
of completed work is needed. Older records remain readable unchanged. Older apps
reject the new strict work field; do not downgrade after authorizing recovery.
Unknown recovery formats fail closed without rewriting saved data.

The authenticated manual action requires the current project revision, exact latest
matching-input job, selected area and explicit additional-request consent. It creates
a new job rather than changing the historical failed job. Original partitions,
receipt/context hashes, raw responses, model provenance and three spent ordinary
attempts remain intact. Replay precedes enabling the current citation-label protocol.
A versioned append-only grant records one additional request for this stage; its
spent flag is checkpointed with the live lease before dispatch. Receipt `attempts`
continues to count ordinary attempts; the separate recovery ledger records the
additional allowance. Portable continuation preserves both.

One recovery action runs at most one request, then pauses if further stages remain.
Ordinary Refresh may continue subsequent stages but never grants recovery allowance.
Failure, timeout, cancellation or a crash after dispatch do not restore the grant.
A crash after grant checkpoint but before dispatch conservatively retains an
unspent authorization tied to that original job; a new worker does not dispatch it
or grant another. There is at most one grant per stage. Explicit model evidence
blocks, complete tasks, stale inputs and previously granted stages are ineligible.
Context/evidence bounds and complete-ledger publication checks remain unchanged.
Recovery is offered for exhausted requests generally, not proof that a citation
upgrade will fix the error. No original rejected response is reconstructed.

Upgrade tests cover a legacy failed checkpoint with an accepted stage, unchanged
history and accepted receipt bytes, repeated SQLite reopen, portable replay, labeled
recovery, subsequent completion, failure/cancellation spending and refusal to grant
again. Browser checks cover authentication/origin/revision/consent, cancellation,
reload without calls, one-request dispatch and mobile. No personal-project mutation
or live model request is part of this upgrade.

## Short staged-definition citation labels (2026-10-24)

Source: `exact-batches-v1` work without `citationPolicy`. Target: the same work
format/SQLite schema/portable format, with optional
`citationPolicy: { format: 1, fromStage }`. This is a versioned request/receipt
interpretation boundary, not a change to optimistic revision counters, definition
input freshness or the saved original partition/plan key.

New staged reviews enable labels from stage zero. Explicit continuation first
replays the old receipts unchanged, then enables labels at the next unfinished stage.
Earlier contexts/prompts and raw responses retain their original bytes and hashes.
Previously dispatched but rejected attempts stay spent, including when the unfinished
request gains labels; the original failed job is not rewritten. Complete legacy jobs
are not upgraded or reassessed. Startup alone never starts calls or rewrites work.

Each request annotates exact evidence records with `citationLabel` and supplies a
`definitionStage.citationLabels` map (`E1`, `E2`, … to canonical IDs). Collection
allows the current exact batch plus previously cited draft evidence; verification
allows only its current exact batch. Labels are local to the request and may change
at the next step/subdivision. Raw responses/receipts retain labels; deterministic
replay resolves them before existing validation and stores canonical assessment IDs.
Exact allowed canonical IDs remain compatible with existing adapters, but numeric
indexes, fabricated labels, partial UUIDs and guessed combinations are not repaired.
There is no fuzzy matching or removal of invalid citations. Individual response
citation limits, complete-ledger publication and evidence allowlists are unchanged.

Failed response validation creates no receipt/publication; spent-attempt checkpoints
remain durable. Failed publication retains all accepted raw receipts for explicit
recovery. Label overhead participates in normal bounded-context planning and exact
subdivision; it cannot justify truncating evidence. Portable export/import preserves
the new policy, raw labels and old/new contexts. Unknown policy formats fail closed
without overwriting saved rows. Older apps reject the new work field, so do not
downgrade after creating labeled checkpoints; keep backups/current app available.

Tests cover label-to-record ownership, collection/update/verification resolution,
unknown labels and spliced UUID rejection, raw response bounds, old receipt/context
preservation, attempts already spent before upgrade, repeated SQLite reopen, portable
replay, future-format refusal and canonical-ID-only publication. No personal-project
retry or live model inference is part of this upgrade.

## Definition citation failure details (2026-10-24)

Diagnostic-only extension: new citation failures distinguish missing records from
existing records outside the allowed detailed evidence, identify check/dimension
and citation positions, and include phase/batch for staged requests. At most four
examples are shown with total counts. UUID citations are displayed; other model
strings are represented by a short SHA-256 fingerprint to avoid recording arbitrary
private text or credentials. Existing message redaction/size bounds still apply.

No schema, prompt, context, freshness or receipt identity changes; no migration or
data rewrite is needed. Existing diagnostics remain unchanged because rejected
responses were not retained. Completed receipts and spent attempts are preserved;
startup does not infer or retry. Validation remains fail-closed and no assessment is
published on failure. Tests cover classification, bounded/private malformed values,
collection/verification stage details, unchanged attempts/receipts and SQLite reopen.

## Accumulated definition citations (2026-10-24)

Source/target: unchanged SQLite schema, portable format 1 and `exact-batches-v1`
ledgers. Individual model responses/receipts still allow at most 20 evidence IDs
per check. Engine-built verification unions and stored assessments now allow up to
1,280 (20 times the existing 64-stage limit), preserving every distinct citation.
Only staged definition job results use the expanded publication schema; publication
still reconstructs and compares the complete exact ledger before applying anything.
Ordinary model analysis, compact collection/update and raw verdict schemas retain
their original limits and evidence allowlists.

No SQL rewrite, identity/fingerprint change, prompt change or new protocol version
is needed. Old checkpoints, context hashes, receipt bytes, spent attempts and current
completed work remain valid. Reopening does not start inference. Explicit resume
reconstructs the seven saved stages in the reported failure and spends the remaining
third attempt only on final verification; rejected historical model responses were
not checkpointed and cannot be recovered. Failed publication remains transactional.
No attempt reset, data reset or repeat of completed model calls is required.

Portable job results and project assessments accept the accumulated representation;
expanded job results without their definition ledger are rejected. Older readers
with the 20-ID storage restriction cannot read new expanded assessments safely;
do not downgrade after saving these results. Unsupported future formats retain their
existing fail-closed behavior. Tests cover SQLite reopen before/after recovery,
unchanged historical receipts, exact final request bytes, third-attempt accounting,
portable export/decode/replay, further verification after accumulation, raw-response
limits, invalid citations, over-bound storage and forged publication rollback.
The user's actual project has not been resumed or modified as part of verification.

## Continuous manual definition refresh (2026-10-24)

Source/target: the same SQLite/project schema, `exact-batches-v1` definition ledgers,
receipt/input/plan identities, optimistic revisions and interruption format 1.
Manual refresh/assessment resume now continues through its selected scope without
the old shared fifteen-minute, ten-area or 32-request staged-action budget. This is
an explicit-operation workflow change, not an automatic data rewrite, new setting,
evidence/freshness change or permission to reset attempts. Automatic maintenance
and coordinated workflow retain their existing preferences, consent and budgets.

Completed saved work remains current under the same input basis. Explicit manual
continuation replay-validates older deadline/reserve/request-limit checkpoints,
retains their original partitions, context hashes, receipts, provenance and spent
attempts, then proceeds from the unfinished step. Historical jobs/warnings are not
rewritten. Restart never automatically starts calls. Genuinely changed evidence
remains stale and unsupported future checkpoint formats still fail closed.

Active continuous jobs use the existing `leaseUntil` field with a finite six-minute
lease, atomically renewed with each request checkpoint. Renewal requires the same
running unexpired job and exact current revision/plan; it cannot shorten a lease,
resurrect an expired/stale worker or overwrite another worker's evidence. Failed
writes roll back renewal and checkpoint together; a crash retains the previous
durable checkpoint and finite lease. Earlier jobs remain the historical backup;
existing startup/expired-job recovery continues to require explicit resume.

Metadata diagnostics remain `format: 1`; their compatible request-array bound grows
from 32 to 64 (the existing exact-stage maximum). Existing measurements are accepted
unchanged, not regenerated. A new job with 33–64 measurements cannot be reopened by
older app versions enforcing the old bound; those readers fail validation rather
than safely resuming it, so do not downgrade after creating such a job. The 20-run/
256,000-byte export cap, allowlisted metadata and no-prose privacy policy remain.
No eager SQL migration, data reset, replayed completed model calls or manufactured
historical timings are required. Repeated SQLite reopen/export and rejection of
over-bound/future formats preserve the saved rows. See
[continuous refresh](definition-coverage.md#continuous-manual-refresh-by-default-2026-10-24)
for checks actually run and live-verification gaps.

## Definition assessment history visibility (2026-10-24)

Source and target persisted formats are identical. This adds a read-only SQL/API/UI
projection over existing jobs, including attempts older than the workspace's recent
20-job projection. No table/index/schema version, job/checkpoint format, fingerprint,
freshness rule, evidence, assessment, revision, workspace/portable artifact or
request/attempt allowance changes. No forward transformation, backup, startup write,
reassessment or model call is needed. Reading history does not reconstruct or adopt
future checkpoint formats, publish assessments or mutate original rows.

Summaries use existing row order/area metadata; no timestamps, missing error prose,
model results or semantic resolution claims are invented. Newer/earlier labels are
local task-order information only. The API returns 25 selected summaries per page;
diagnostic display limits/redaction affect only projections. Original error text,
receipts, attempts, hashes and jobs remain unchanged. Interrupted/failed reads can
be retried without a data transaction or inference. Existing formats continue to
reopen; missing historical fields remain unknown. Unsupported recovery formats
remain subject to the unchanged fail-closed checkpoint validators.

Tests cover earlier errors outside recent jobs, bounded project-scoped pagination,
authentication/origin/input rejection, repeated SQLite reopen with unchanged saved
jobs, escaped/redacted errors and explicit unknown/limited displays. The existing
four-receipt size-blocker recovery test now uses an actual pre-compact contract and
checks earlier-error visibility after successful continuation. Verification and the
unqualified personal-project recovery gap are recorded in
[definition coverage](definition-coverage.md#finding-earlier-failures-2026-10-24).

## Workspace consolidation and logs (2026-10-24)

Source/target persisted formats are identical. DEC-033 changes browser projections
and navigation only: SQLite/schema versions, job JSON, saved assessment identities,
specification revisions, workspace/portable files and preferences are unchanged.
No forward rewrite or reassessment is necessary. Original diagnostics, attempts,
completed checks and delivery evidence remain saved. Old internal map destinations
lead to Specification; technical details open Logs instead of local disclosures.

Transient API errors/selected details are bounded browser-memory records, not a
new durable/exported format. Reload discards them; existing saved job diagnostics
remain available through the same read-only projection. No new calls start on
opening/reopening Logs. Unknown historical times remain unknown. Old-job tests
cover repeat projection and preservation; existing storage upgrade/recovery tests
remain applicable. See [workspace responsibilities](workspace-navigation.md).

## Upgrade contract

Application upgrades preserve saved decisions, IDs, histories, assessments, command
output and delivery evidence. Compatible format or workflow changes must not require
resetting data or repeating model calls. Genuinely changed decisions, code snapshots,
models or assessment semantics still require fresh evidence. A migration never
creates missing provenance or certifies that old verification commands ran again.

Assess migration impact for every persisted-data change, including fingerprints and
freshness rules. Record the plan here **with the code change**, before release:

1. Source and target formats, affected records and the reason for the change.
2. Exact transformations and the evidence establishing compatibility. Distinguish
   compatible representation changes from semantic changes requiring reassessment.
3. Preservation of original evidence, IDs, timestamps and history; backup strategy.
4. Transaction/retry behavior, concurrency and active-worker handling, unsupported
   future formats and recovery after failure.
5. Upgrade fixtures/checks actually run and remaining qualification gaps.

## Dynamic provider and model selection (2026-10-23)

Source/target: the existing `{ providerID, modelID, connectionID? }` model-selection
JSON in project snapshots, jobs and portable state. Provider validation expands
from the OpenAI/Copilot enum to a nonempty string for OpenCode-backed providers;
the representation, SQLite schema version and concurrency counters are unchanged.
No data transformation, new storage or automatic revision is necessary. Direct
connections still require OpenAI and an account-listed model at dispatch/save.

Existing IDs, connection references, history and assessment/checkpoint identities
are preserved. Catalog membership is not a freshness rule and discovery never
rewrites saved work or repeats model calls. An explicit model/provider change uses
the existing revisioned write and existing model-bound freshness rules. An absent
model/provider remains selected and fails explicitly at runtime rather than falling
back. Older app versions that only accept the enum cannot open newly selected
third-party provider snapshots; downgrade after such a selection is not supported.

The discovery cache is memory-only and safe to discard/retry after interruption;
failure preserves the last successful metadata with a dated stale warning. A new
upgrade test reopens old OpenAI/direct selections unchanged, then saves a custom
provider and reopens it twice with exact histories preserved. No assessment
migration or reassessment is required solely by this UI/catalog change.

## Compact definition responses and deadline admission (2026-10-23)

Source: definition `format: 1`, `exact-batches-v1` ledgers with legacy analysis
responses. Target: the same ledger identity with optional
`responsePolicy: { format: 1, fromStage }` and assessment-only/changed-dimension
response receipts. Before the boundary, request bytes and legacy parsing are
unchanged. From the boundary, the first collection response is
`{ definitionAssessment: ... }`; subsequent responses are
`{ definitionUpdate: { checks, confidence?, explanation? } }`. Omitted fields/checks
retain the saved draft exactly. Full assessment validation still applies; every
batch still receives verification before publication. Valid legacy analysis
responses remain accepted and retained without rewriting their content.

No SQLite/project schema bump, fingerprint change, eager rewrite, reset or repeat
assessment is required. Explicit continuation first validates/replays original
receipts, then enables the new response contract only if the unfinished stage has
zero spent attempts. Attempted stages retain their contract and exhausted stages
remain blocked. Original partitions, plan/input keys, completed hashes, responses,
job/model provenance, completed assessments and historical jobs are preserved.
The existing checkpoint transaction and lease/revision guards persist the optional
boundary and each exact response in the new job. Failed/interrupted writes retain
the last committed checkpoint; retry replays it without repeating saved calls.
SQLite and portable continuations both carry the optional boundary and responses.
Unsupported future policy versions fail closed; old applications must not resume
new-format ledgers. Original jobs remain the historical backup.

The interruption allowlist adds `refresh-time-reserve`: a pause *before* dispatch
when the estimated request duration exceeds the remaining shared refresh window.
It does not claim the deadline expired or spend an attempt. Existing causes remain
unchanged; missing historical causes remain unknown. Estimates are ephemeral per
explicit refresh, not persisted evidence, freshness, request grants or retries.
Partial progress still cannot publish coverage. Startup does not trigger inference.

Upgrade tests cover legacy receipt bytes, safe-boundary adoption, spent-attempt
preservation, repeated SQLite reopen, compact portable replay, future-format
rejection, malformed/unauthorized updates, all-batch verification and no-call
deadline pauses followed by explicit resume. Verification results are recorded in
the definition-coverage document; no live-model or personal-database qualification
is implied.

## Plain-language presentation (2026-10-23)

Presentation-only compatibility decision: simpler browser/terminal/desktop wording
and a shared plain-language instruction for future discovery, scans, definition
checks and question help. Source and target persisted formats are identical. No
SQLite version, JSON contract, specification authority, assessment/checkpoint
identity, fingerprint, freshness policy, model selection, retry allowance or consent
changes. Existing human text, generated prose, diagnostics, source quotations and
completed work remain unchanged. No migration, data reset, startup rewrite or repeat
AI request is needed. Saved technical diagnostics are presented behind disclosures;
unknown historical interruption causes stay unknown. Pure presentation tests check
that rendering and prompt generation do not modify saved inputs. Existing upgrade
and recovery suites continue to apply; this is not a new migration mechanism.

Verification: all 799 pre/main tests passed on Node 22.23.3, including existing
SQLite/portable upgrade and recovery suites; the six language tests also passed
after adding the final stale-edit explanation. Type check, UI build and focused
workflow/maintenance/epic-review/portable/specification browser checks passed.
The main browser check still stops at the previously recorded missing Approve
resolution control; no aggregate browser or live-model qualification is claimed.

## Adaptive definition subdivision and progress (2026-10-23)

Source: definition `format: 1`, `exact-batches-v1` ledgers with original batches,
draft-policy boundaries and up to 32 receipts. Target: the same original identity
plus optional `continuation: { format: 1, splits: [{ fromStage, at }] }`, permitting
at most 64 scheduled stages/receipts. `at` bisects one unfinished step's exact record
list; ordered append-only boundaries apply only from that receipt position onward.
Original partitions, plan keys, input fingerprints, models, responses, completed
context hashes and spent attempts do not change. Full exact collection and
verification remain mandatory; assessment meaning/freshness is unchanged.

No SQLite schema or project format bump, eager rewrite, reset, or reassessment is
required. Old jobs remain untouched. Explicit continuation first validates/replays
older requests, then transactionally checkpoints each subdivision in the new live
job using existing lease/revision guards. Interruption/repeated reopen reuses the
saved boundaries. A failed write leaves the previous transaction intact. Startup
never starts model calls. Original jobs supply the historical backup; no evidence
is deleted. Unsupported future continuation formats and malformed partitions fail
closed; older application versions cannot read newly subdivided ledgers and should
not be used to resume them. Indivisible-record/stage-limit/spent-attempt blockers
remain explicit and cannot certify partial coverage.

Progress uses existing messages, context manifests and measured diagnostics;
historical timings remain unknown. The new dependency-area helper and local prefix
planning change only how new partitions are prepared; saved partitions always take
priority. Display previews never replace exact model evidence.

Verified on Windows Node 22.23.3: type check/UI build, 143 pretests and 650 main tests,
focused epic-review browser checks. Upgrade tests retain four legacy responses across
repeated SQLite reopen and portable replay, preserve original jobs and byte-identical
completed contexts, reject future/corrupt continuations, and retain true indivisible
blockers without new calls on unchanged retry. No personal database or live provider
qualification was performed. See [definition coverage](definition-coverage.md).
The full browser command still stops at the existing **Approve resolution** assertion;
it does not establish a passing aggregate browser suite.

## Continuation-control consolidation (2026-10-23 follow-up)

UI-only: Continue project is the primary header/drawer action; first entry from
advanced mode opens a scope/allowance explanation before explicit consent. Manual
queue operations move under Advanced actions with precise labels; competing manual
dispatch controls are hidden in coordinated mode. Project settings retains mode
selection. No project/job/workflow formats, fingerprints, authority, settings,
allowances or checkpoints change. No migration, reset or reassessment is required.

Verified: type check/UI build, 138 pretests + 650 main tests (788 total), and
coordinated-workflow, epic-review and gap-navigation browser runners passed. The
coordinated check proves opening the explanation/advanced disclosure causes no model
calls or mode changes, awaiting decisions exposes no duplicate Resume, and bounded
continuation/restart/mobile remain intact. Epic/gap runners verify manual assessment
and exploration checkpoint recovery through Advanced actions. Full-browser rerun
still stops at the known missing Approve resolution assertion (now
`src/web/browser-check.ts:1353`). No live inference or personal database changes.

## Schema 6 → 7: coordinated workflow preview (2026-10-23)

Adds `workflow_state` (format 1 local scheduler/settings/consent) and immutable
`workflow_readiness_receipts` (policy `coordinated-checks-v1`). Settings CAS is separate
from scheduler checkpoints and SQLite schema version. No project JSON, jobs, evidence,
assessment formats, context fingerprints or existing preferences are rewritten.
Missing state defaults off; no calls, reassessment or approval are inferred. Readiness
proofs reuse current answer-derived authority, human review or compatible checks.
The unreleased receipt representation uses `requirementProofs`, replacing its
development-only refinement-job-ID list; no released workflow data needs upgrading.

Migration/history entry are transactional. Failure rolls back table creation and
version advancement; retry is safe. Startup validates strict workflow/readiness
formats, refusing malformed/future data without replacing it. Restart requires
explicit Continue even when enabled. Portable exports omit local authority and
scheduling receipts; shared-work adoption pauses enabled local coordination.
Original dated receipts/jobs survive changed input and reopen.

Upgrade fixtures use schema-6 saved projects/jobs/preferences, inject migration
failure, retry and reopen twice, proving preservation without inference. API/browser
consent and restart checks use no live calls. Actual-user upgrades and live-provider
coordination remain unqualified. See [coordinated workflow](coordinated-workflow.md).

Verification for this slice: type check/UI build and all 780 deterministic tests
(131 pretests + 649 main) passed on Windows Node 22.23.3, including portable consent
exclusion/adoption pause and immutable readiness-history reopen. Coordinated,
maintenance, specification and portable browser checks passed. Full-browser rerun
still fails at the existing **Approve resolution** assertion (`browser-check.ts:1352`);
do not treat that runner or real-user upgrade qualification as passing.

### Additive readiness-question tasks (2026-10-23 follow-up)

SQLite remains schema 7, workflow state format 1 and readiness policy unchanged.
Existing projects, assessments, readiness receipts, job checkpoints and fingerprints
are not rewritten or invalidated. Adds optional job-context `readinessQuestions`
(format 1, policy `readiness-questions-v1`, selected area/dimension, exact definition
input key and check digest) and the scheduler's `readiness-questions` current kind.
Older saved rows without these fields are read as before. Unknown task formats are
rejected rather than overwritten; strict portable job validation also recognizes
the optional task envelope. Ordinary clarification jobs remain local, not portable
scheduling/model-call authority. Questions themselves retain ordinary stable IDs and
evidence links in shared project state.

The new task does not change assessment meaning or reuse identity: a compatible
saved partial assessment directly drives clarification without another assessment
call. A completed no-question task is reused for unchanged inputs after reopen and
explicit Continue. New answers invalidate affected definition inputs as before.
Prior ready receipts remain valid for unchanged inputs; prior paused/blocked projects
still require explicit continuation. No background calls are inferred on upgrade.

Publication is atomic through existing job/revision transactions. Cancellation,
stale output, malformed/overbroad proposals, duplicate questions and invalid evidence
cannot change requirements or assessments. The new tests cover those failures,
preserved interpretation/evidence, bounded context and saved-task reopen/reuse.
Actual-user upgrades and live question quality remain unqualified.

Verified for this follow-up on Windows Node 22.23.3: all 787 deterministic tests
(138 pretests + 649 main), type check, UI build, and coordinated/specification/
maintenance browser runners passed. The updated coordinated browser check includes
targeted readiness questions and answer-triggered reassessment. Full-browser rerun
still fails at the prior `browser-check.ts:1352` **Approve resolution** assertion.

## Remove duplicate What’s next card (2026-10-23 follow-up)

UI-only removal of the redundant summary card and its unused navigation helpers.
Existing Design/Specification actions, Overall progress assessments, Processing &
queue status/continuation and project maintenance settings remain available. Rename
the remaining maintenance stylesheet to match the controls it still styles.

No persisted format, schema, fingerprint, preference, authority, job receipt,
checkpoint or budget changes; no data migration or reassessment is required. Saved
maintenance enable/pause settings and completed work are untouched. Browser tests
assert the card is absent on every workspace tab while exercising the existing
settings, queue, story processing, assessment, decisions and restart-consent flows.

Verification: type check, UI build, 56 focused maintenance/review/recovery tests,
and maintenance/specification/workflow browser runners passed on Windows Node
22.23.3. The maintenance browser asserts absence on all workspace tabs and continues
to exercise opt-in, queue/settings navigation, pause/reload, restart consent and
mobile layout. The full browser command was rerun and still stops at the known
**Approve resolution** assertion at `src/web/browser-check.ts:1352`. The full unit
suite was not rerun for this presentation-only follow-up. No live calls or changes
to the user's saved project database.

## Maintenance control placement (2026-10-23 follow-up)

UI-only relocation: enable/disable and usage limits move from the workspace's
What’s next panel to Settings → Project settings → Automatic maintenance. Queue
status, area receipts, blockers and pause/resume move to Processing & queue; Stop
remains attached to the current task. What's next retains brief status/navigation.
The setting is still per project and machine-local, never app-global or portable.

No persisted format, SQLite schema, fingerprint, concurrency counter, preference,
task identity, job receipt, permission or budget changes. No data migration or
reassessment is needed. Opening settings or the queue never dispatches model work.
Existing opt-in, paused state and completed checks are read as before. Tests cover
configuration/operation separation, queue/settings links with focus, absence of
controls from workspace tabs, saved opt-in, pause/reload, server-restart consent,
keyboard targets and mobile layout. No personal saved data or live inference.

Verified: type check, UI build, 119 pretests + 648 main tests (767 total), and
maintenance/workflow/portable/specification browser runners passed on Windows
Node 22.23.3. The focused browser check visits every workspace tab, enables updates
only in Project settings, opens the queue/settings links with focus, and preserves
pause/reload and restart consent. Full-browser verification caught a mobile Stop
visibility regression from placing maintenance above active work; active tasks now
come first. The rerun passed that check and stopped at the existing **Approve
resolution** assertion at `src/web/browser-check.ts:1352`.

## Opt-in guided maintenance (2026-10-23)

Source/target: SQLite schema **5 → 6**, additive `maintenance_state(project_id,
payload)` table. The ordered transactional migration adds the table/history entry
without rewriting any project, revision, submission, assessment, delivery evidence,
saved job or checkpoint. No backup of existing evidence is needed because it is
untouched. New projects and older saved projects read a default disabled state;
no row or model consent is fabricated until explicit configuration. Interrupted
migration rolls back table/history/version together and can be retried.

Strict local format-1 payloads contain separate optimistic scheduler `version` and
user-settings `settingsVersion`, enabled/paused flags, observed project revision,
decision-trigger keys, debounce timestamp and current per-area queue receipts.
Settings CAS does not become stale merely because the scheduler checkpointed work;
neither concurrency counter is a schema version. Enabling/resuming checks the
current project revision; pause/disable can reduce authority even from an older
project snapshot, but still check settings CAS. No assessment freshness or input
fingerprint semantics change. A narrower scheduling projection is never used to
certify coverage; publication still validates complete exact assessment inputs.

Opt-in starts with today's scheduling baseline, not a retrospective sweep. Tasks
claim their input identity transactionally before dispatch, retaining the real job
ID once begun. The existing service owns paid-call checkpoints, leases, attempts
and revision-safe publication. Automatic bursts have eight requests/five minutes/
three areas. Budget stops and failures pause; unchanged failed tasks are not retried.
Existing exact-stage receipts are reusable without representation migration or
reassessment solely for this workflow change. A current published assessment clears
an abandoned scheduler task without repeating inference.

Consent is durable as a preference, not permission to restart inference: each new
queue/server session starts unarmed and requires explicit resume. Browser reloads
do not reset a live server session. Other workers' live job/execution leases are
respected; failure bookkeeping only updates the scheduler's own claimed task.
Maintenance state is deliberately excluded from portable files, exports and
specification history; opening a clone on a different machine does not import
automatic-call authority. Unsupported future maintenance envelopes fail strict
reads/writes without overwriting the original payload; future SQLite versions
continue to reject startup. Downgrade after schema 6 requires a compatible app.

Upgrade fixtures cover an older schema-5 database with byte-preserved project and
history, a simulated migration interruption/rollback/retry, repeated reopen,
default-off consent, future-payload preservation, independent settings/scheduler
CAS, no inference on restart and two-process dispatch. Service/browser fixtures
exercise processing-before-assessment, approval-only input, relevant dependencies,
model-only proposal exclusion, debounce/coalescing, burst limits, stale publication,
pause/Stop, checkpoint continuation and publication-crash reconciliation. See
[guided maintenance](guided-maintenance.md) for implemented limits versus proposed
delta-only assessment work. No personal database or live provider calls are used.

Verification on Windows Node 22.23.3: type checking, UI build, 119 pretests and 648
main tests passed. Focused maintenance, workflow, portable and specification browser
runners passed; the full browser command still hits the known **Approve resolution**
assertion at `src/web/browser-check.ts:1352`. Initial browser verification caught and
fixed settings CAS racing scheduler checkpoints; subsequent browser checks cover
Pause after publication and explicit server-restart consent. No live cost/latency or
actual-user database upgrade was exercised. New migration tests use disposable older
SQLite fixtures, including interruption/rollback and repeated reopen.

## Lossless staged definition drafts beyond the raw 12k reserve (2026-10-23)

Source/target: SQLite schema 5, exact-batch work format 1 and plan/input identities
unchanged. Work optionally adds strict `draftPolicy: {format: 1, fromStage}`.
Absent policy retains the original draft context and raw 12k checks during replay.
An explicit continuation first replays and validates all old receipts, then sets
the policy boundary to their count. Earlier contexts remain byte-identical; neither
saved partitions nor their plan keys, receipts, original provider/model/job IDs,
spent attempts or dated project evidence are rewritten. New plans start at zero.
Completed old ledgers need no policy upgrade or repeat inference. New metadata is
saved by existing lease/revision-checked checkpoint transactions; interrupted startup
does not initiate inference. Retrying upgrade is idempotent. No freshness/assessment
semantics or project schema version changes, so no reassessment migration is needed.

At and after the boundary, 12k is a generation target and planning reserve, not a
raw-response rejection threshold. Schema-valid, reference-checked responses are
checkpointed before constructing the following request. Its working draft projects
only assessment fields, retaining every explanation and citation, while ignored
analysis wrappers remain in original schema-normalized receipt responses. Repeated
explanations use the existing lossless shared-text forms; this opt-in leaves all
other callers and older definition contexts unchanged. There is no semantic prose
compaction or extra model call. Status/importance/citation checks, complete-batch
verification and independent publication validation are unchanged.

The measured encoded request remains bounded at 96k. If it still cannot fit, the
job records an explicit evidence block and the completed response remains durable;
unchanged Resume blocks locally instead of repeating inference. There is no silent
truncation, repartitioning or allowance reset. Responses discarded before this
upgrade cannot be recovered from metadata diagnostics; do not manufacture receipts.

Portable serialization/adoption retains the policy boundary and original receipts.
Unknown future policy formats fail strict reads/adoption; expired-job recovery now
also validates definition work before any rewrite, with transaction rollback on
failure. Downgrading after saving the new optional field is unqualified. Upgrade
tests cover unchanged old request bytes and receipt provenance, retained partition
and attempts, repeated SQLite reopen, continuation/publication, portable replay,
oversized collection/verification and unencodable-draft no-call recovery, plus future
format rejection without overwriting expired worker records.

Verification: Windows Node 22.23.3 type check, 103 pretests and 647 main tests,
UI build and the focused workflow browser runner passed. The browser fixture saves
an over-12k response, stops, reloads and resumes with the original first receipt
and interrupted-stage attempt intact. Specification browser checks passed; portable
browser checks passed on isolated rerun after an initial duplicate-button locator
failure. No live inference or changes to the user's saved project database. The
full browser suite was not rerun for this follow-up; its preceding run remains
blocked at the known **Approve resolution** assertion.

## Definition interruption causes and timeout recovery (2026-10-23)

Source/target: SQLite schema 5, definition input-basis format 1, and exact-batch
work/receipt formats unchanged. Jobs optionally add strict format-1
`definitionInterruption: {cause, limitMs?}`. Causes distinguish the shared refresh
deadline, per-area deadline, individual request timeout, external unspecified
timeout, request allowance, explicit Stop, shutdown and an otherwise unspecified
external cancellation. Only allowlisted codes/numeric bounds are persisted or
exported; arbitrary abort errors/reasons are not copied into records or diagnostics.

No eager rewrite or assessment migration: original unclassified cancelled jobs stay
unchanged with an unknown cause. Do not infer an explicit Stop or a timeout from
their duration, status or generic diagnostic. New explicit continuation reuses the
original partition, exact completed receipts, original provenance and spent attempts;
it does not repeat completed calls or reset allowances. No stage context/evidence
hash, assessment freshness, score, human input or delivery evidence changes.

Known deadlines now publish transactional interrupted/paused receipts instead of
generic cancellation. A newer project revision wins over interruption bookkeeping;
no stale result can publish. Explicit Stop/shutdown remain distinguishable cancelled
work with retained checks. Late responses after a deadline cannot publish. Recovery
and startup remain explicit: no automatic repeat inference. The processing drawer
labels definition processing separately from gap discovery.

Portable current-checkpoint records retain this optional stop receipt. Strict future
formats reject reads/adoption without overwriting original data. Downgrading after
new metadata is saved remains unqualified. The diagnostics JSON adds optional
`interruptionCause` (null for old/unknown causes); timings alone never manufacture it.

Tests cover a shared fifteen-minute refresh deadline during a later area, including
a retained first stage and a much shorter current-area elapsed time; individual
request timeout/resume with retained attempts; explicit Stop and shutdown; stale
revision precedence; portable stop-receipt round-trip; legacy cancelled JSON reopened
without any rewrite or repeated completed stage; arbitrary abort-text redaction; and
future-format rejection preserving original bytes. No user database or live model
inference is used. The supplied historical export cannot establish its original
interruption cause because that metadata was not recorded.

Verification: Windows Node 22.23.3 type check, UI build, 99 pretests and 647 main
tests passed. The focused workflow browser runner passed explicit Stop/reload/Resume
with an unchanged saved first-stage receipt and retained interrupted-stage attempt.
Portable and specification browser runners passed separately (the specification
runner was rerun after an initial 404 caused by running alongside a UI rebuild).
The full browser command still stops at its known **Approve resolution** assertion
at `src/web/browser-check.ts:1352`. No live inference or personal data migration.

## Exact-batch whole-area assessment continuation (2026-10-23 follow-up)

Source/target: SQLite schema 5 and definition input-basis format 1 unchanged. Existing
single-context assessments, scores, dates and histories remain valid; they are not
invalidated just because a larger-area workflow is now supported. Existing failed
145k/96k jobs remain unchanged history. An explicit refresh locally prepares the
previously blocked evidence as a complete exact-record partition before inference.

New optional strict format-1 `job.definitionWork` uses policy `exact-batches-v1`:
area/input and partition identities, exact batch membership, current spent attempts,
bounded completed receipts, optional pause/block reason and continuation origin.
Each receipt binds its exact request/draft hash and validated response to original
job/provider/model provenance. No credential, account identifier or runtime session
is added. Context `definitionAssessment.staged` binds the same policy/plan identity.
New saved assessments optionally include strict format-1 `stagedReview` method/
batch metadata, not a new assessment score or freshness policy. Model proposals
cannot assign that metadata.

Checkpoint/pause/block/publication writes are transactional, live-lease and expected-
revision checked. Publication independently reconstructs the complete partition,
replays every exact receipt/draft, rejects partial/future/mismatched/blocked work and
requires every verification batch. A late verdict can only reduce coverage or raise
importance; no positive upgrade is permitted during verification. Confidence caps
at medium for the explicit cross-batch reasoning limitation. Earlier assessment
evidence stays unchanged until the final transaction succeeds.

Explicit retry reuses the saved partition and spent attempts before choosing a new
representation; unrelated revisions alone do not reset calls. A final checkpoint
survives publication failure and can publish with zero further calls. Cancellation,
request/time budget pauses and app restart retain completed receipts. Exhausted
stages and unchanged model evidence blockers do not grant fresh attempts. Relevant
input changes retain previous dated work but cannot certify a current assessment.
New work can use the genuinely changed input basis.

Portable continuation carries current definition work as a self-contained receipt
ledger and necessary snapshots, with schema/identity validation before adoption.
It deduplicates repeated attempts by area/input/partition identity and retains the
completed ledger instead of its earlier partial copies. Obsolete input generations
stay local history, not portable activity archives. Completed semantic stage hashes
and original model provenance remain available; runtime sessions, metrics and
runtime diagnostics are excluded. Necessary semantic missing-evidence reasons stay
with blocked checkpoints so import cannot silently replay a blocked call.
Future work/task/method formats reject without overwriting
original rows. Downgrade after new metadata has been saved remains unqualified.

Tests cover a synthetic evidence set larger than the reported 145,769 characters,
bounded exact batches, no partial publication, late contradictions, unchanged source
evidence, cancellation/staleness, spent/exhausted attempts, explicit evidence blockers,
SQLite/portable resume, original receipt provenance, final-publication recovery and
future-format rejection without overwrites. A focused browser fixture observes a
saved first stage through reload, then complete assessment and mobile status. The
user's exact saved project and live-model semantic usefulness remain unverified.

Verification: type check/UI build, 91 pretests and 647 main tests passed on Windows
Node 22.23.3, including staged workspace adoption on a different local account and
completed-ledger deduplication. Portable/specification browser runners also passed.
The workflow browser runner passed with saved-stage reload and large-area publication. The full
browser command remains blocked by the previously documented **Approve resolution**
assertion. No live inference or modification of the user's saved database.

## Definition coverage freshness and near-limit staging (2026-10-23)

Source/target: SQLite schema 5 unchanged. Saved definition assessments optionally
add strict `inputBasis: {format: 1, key: <SHA-256>}` for `definition-inputs-v1`.
Model proposals cannot supply this field. The engine/renderer use the same pinned
browser-compatible SHA-256 implementation; no human text is stored in the digest or
exported as diagnostics. Freshness metadata is omitted from inference contexts.
Assessment timestamps/revisions, checks, IDs, answer versions and histories remain
unchanged. This does not migrate implementation assessments or delivery evidence.

Legacy projection is lazy and read-only: load the original `atRevision` snapshot,
verify that its assessment matches the saved assessment, then fingerprint THAT
snapshot and its cited evidence. Compare against current relevant inputs. Never
fingerprint today's decisions on an old assessment's behalf. Missing/unverifiable
original snapshots retain conservative revision freshness, not manufactured
provenance. Reopening repeats the same calculation safely; no startup calls, eager
history rewrites or CAS increments. The next normal expected-revision transaction
persists the additive basis. Failure before that transaction leaves original bytes
intact; previous revisions remain recoverable. Future basis formats reject reads
without overwriting them. Portable project records retain the optional basis;
legacy portable snapshots can supply the original evidence for the same projection.

New assessment-only jobs add strict format-1 `context.definitionAssessment` with
area/input identity. Publication independently requires complete current area
records, one nine-dimension assessment, detailed citations and no specification
edits, plus the existing live lease/expected-revision checks. Ordinary/partial gap
jobs gain no new authority. Current assessments can be reused without repeat calls.

Workflow/stage schemas additionally recognize `staged-current-spec-v3`. It has a
policy-bound current-spec representation and 8k draft cap/reserve; v1/v2 retain
their original 12k reserve and identities. Saved work is reconstructed first under
its original policy, never relabelled or given fresh attempts. Only otherwise
blocked indivisible new leaves try v3. CPU checkpoint `planningPolicy` also admits
v3: older size/batch-limit eligibility receipts replan, while completed/waiting and
saved-model/attempt-limit receipts remain reusable. Replacements remain bounded,
revision-checked and transactional. Future CPU/stage policies reject without cache
replacement. Downgrading after new-format records are saved is not qualified.

Upgrade tests cover original-snapshot current/stale projection, unchanged historical
bytes, repeated reopen, next-write persistence and future-basis rejection. Existing
CPU receipt transaction/rollback/future-policy tests remain; new v3 tests exercise
SQLite restart and portable checkpoint round-trip with no stage replay, unchanged
source evidence and completed-check reuse. Actual-user recovery and live model
semantic quality remain unverified. See [definition coverage](definition-coverage.md).

Verification: type check/UI build, 79 pretests and 646 main tests, focused workflow,
portable and specification browser runners passed on Windows Node 22.23.3. The full
browser command remains blocked by its previously documented **Approve resolution**
assertion. No personal project was migrated or live model call made during checks.

## Continuous bounded staged actions (2026-10-23)

Source/target: SQLite schema 5, unchanged workflow/stage semantic formats and keys.
Format-1 retrieval work optionally adds strict `stagedRun: {format: 1, requestLimit,
durationMs, paused?}`. Production defaults are 32 requests/fifteen minutes per
explicit staged action; a bounded internal dependency override permits shorter
test budgets, not larger production allowances. Diagnostic format 1 now accepts up
to 32 measured requests. No SQL migration, evidence rewrite or model-call reset.
Unknown future staged-run formats reject reads; downgrade to older strict readers
after saving new metadata or more than six measured requests is not qualified.

Existing six-request jobs (including their old failed status/diagnostic and absent
run marker) remain exact saved history. Explicit retry reconstructs compatible
stages under the original evidence policy, then starts a fresh action allowance;
it does not reset the current stage's spent attempts. The original three-attempt
stage limit, sixteen-batch ceiling and exact publication checks stay unchanged.
No inference starts on app reopen. Completed response/model/check identities,
assessments and delivery evidence are unaffected.

Workflow jobs reserve sixteen-minute leases before planning; staged execution's
fifteen-minute deadline includes preparation, with the existing two-minute planner
bound unchanged. Ordinary non-staged execution keeps five minutes. The queue still
caps a user action at ten packages/fifteen minutes. Stop/failure/cancellation never
automatically retries. Intentional request/time budget stops atomically verify live
lease and revision, release the lease, retain work as `interrupted`, and save a
pause marker. A stale project wins over pause publication. An in-flight timed-out
call remains a spent attempt, not a successful stage. UI/Activity display the pause
without labelling it failed. Portable continuation retains the new run metadata
through the existing validated retrieval-work envelope.

Tests complete a 32-stage package in one job and export all 32 measurements, simulate
a fifteen-minute deadline with a spent in-flight attempt, resume only unfinished
stages, round-trip a paused checkpoint portably, and reopen a legacy failed six-call
job with no startup calls/replay. Existing cancellation, stale, malformed, exhausted
attempt and publication-recovery tests remain applicable. No personal database or
live provider calls are used; the change improves unattended progression, not
provider speed, request count or guaranteed completion within fifteen minutes.

Verification: final `npm test` passed 69 pretests and 646 main tests. The final
future-run-format assertion/time-budget test also passed separately. Type checking,
desktop TypeScript emit, UI build and focused workflow browser tests passed. The
browser fixture observes a live job continue past six stages after reload without
a second click, checks budget-pause wording, and resumes its saved checkpoint
without replay. Initial browser checks exposed missing live progress/run-budget
projection; both are corrected. Full `npm run test:browser` was run and still stops
at the existing missing **Approve resolution** assertion in
`src/web/browser-check.ts:1350`; the later chained portable/specification browser
runners did not run. Exact-user throughput, live subscription behavior and packaged
Electron execution remain unqualified.

## Saved staged-policy batch-ceiling recovery (2026-10-23)

Source/target: unchanged SQLite schema 5, format-1 workflow reviews/stages and local
planning receipts. No SQL/JSON migration, fingerprint change or payload rewrite.
The planner now retains a typed sixteen-batch overflow as an invocation-local
candidate failure, alongside (not disguised as) context-size failures. Saved root
and saved-child policy probes treat it as non-matching instead of aborting the
whole worker. Repeated historical jobs reuse that exact local failure. New work
continues through the existing splitting/v1/v2 selection rules; genuinely unfit
leaves still produce `stage-limit` blockers and independent packages can continue.
Unexpected errors still propagate. The sixteen-batch ceiling is not raised.

Existing completed model work, partial stage receipts, spent attempts, exact policy
markers and immutable failed jobs remain untouched. Compatibility still requires
current exact evidence to match the saved policy/plan key. Changed guardrails are
not permission to relabel old calls as a new v2 plan; unchanged compatible work
continues to reuse its original identity. Existing `resolved-prefix-v1` root/subtree
receipts and context cache keys stay valid. The new failure cache is ephemeral,
not an exported/persisted semantic authority. Previously aborted preparations have
no resolved receipt to upgrade; explicit retry now reaches a valid next candidate
or an honest blocker without deleting data. Startup never invokes a model.

Regression tests retain a real paused v1 job with six successful stages in SQLite,
grow exact guardrails until v1 exceeds sixteen batches while v2 still fits, reopen,
and verify synchronous plus owned-worker selection without changing the old job.
The same fixture exercises saved-child probes and repeated historical candidates.
A separate fixture exceeds even v2, checks explicit blocker/progress reporting,
continues to an independent feature and verifies unexpected exceptions are not
swallowed. No personal database edits or live model calls are used.

Verification: 69 pretests and all 644 main tests passed, including the owned-worker
and SQLite-reopen regression. The final independent-blocker fixture rerun also
passed after simplifying its setup. Type checking, desktop TypeScript emit, UI
build, focused workflow browser regressions and `git diff --check` passed.
Exact supplied-project throughput, live-provider behavior
and full packaged Electron execution remain unqualified. The broad browser suite
was not rerun for this slice.

## Exact refinement supporting-evidence preflight (2026-10-23)

Source/target: SQLite schema 5 and unchanged project/job/submission/portable JSON
formats. No persisted evidence or history is rewritten. `refinement-context.ts`
enumerates the target requirement(s) and all their direct source links as exact
supporting records. Service planning pins them separately from task targets, and
checks completeness before inference. Queued resolution-answer preflight also pins
both requirements' sources. Publication independently runs the same completeness
assertion, retaining citation validation and atomic rollback.

This fixes a reproduced mismatch: an old plain approval owned by a background
requirement could be omitted by current-decision projection even when another
requirement in the exact pair still directly cited it. The model could return a
resolution that storage then correctly rejected for missing supporting detail.
Directly supporting historical evidence now remains exact regardless of its owner;
inclusion does not authorize superseded evidence as a current decision/citation.
Truly missing saved source records fail locally rather than being fabricated or
silently removed. Incomplete-context diagnostics identify bounded missing IDs,
never source prose; metadata diagnostic exports still exclude these messages/IDs.

Existing semantic refinement/pair fingerprints, original task-target IDs and
completed-check reuse remain unchanged. Supporting evidence already belongs to
those targets' saved provenance. Failed jobs remain dated history; explicit retry
uses newly prepared complete evidence. Completed originating responses and completed
pair checks are not replayed/reset. A previously rejected proposal is not silently
published under a new evidence set. Existing size ceilings remain: newly pinned
evidence can block before inference rather than consume a predictably unpublishable
call. No automatic startup calls, reverse migration or schema bump is needed.

The disk-backed upgrade test constructs the cross-owned superseded approval using
normal store operations, reproduces legacy omitted context and failed publication,
reopens, completes a new fully grounded pair proposal, then reopens again while
preserving original sources/requirements, failed job bytes and semantic identity.
Additional preflight tests cover missing requirements/sources and incomplete context;
existing citation, cancellation/stale, completed-response/pair reuse and 144k tests
remain passing. All 60 focused refinement/recovery tests, 69 pretests and 642 main
tests passed, along with type checking, desktop TypeScript emit, UI build and the
focused workflow browser runner (regression coverage, not a live overlap-proposal
qualification). The final raw-source preservation assertion also passed separately.
The broad browser suite was not rerun. Exact user data, packaged Electron and live
provider behavior are unqualified; no personal database edits or live inference
were performed.

## Saved-response overlap allowance parity (2026-10-23)

Source/target: SQLite schema 5, existing project/job/submission/portable formats.
No schema migration or payload rewrite. Pending `overlapFollowup` receipts already
identify the completed response job, exact trigger sources, and unfinished pairs.
The queue now passes an internal submission reference; the service validates that
durable provenance before allowing the same 144,000-character mandatory-only
fallback already available to the original single-response follow-up. Ordinary
refinement, manual pair checks, workflow discovery and question help retain their
existing limits. No optional refill or truncation is introduced. The allowance
does not authorize review changes or attach the original submission as a new batch.

Old 96k-blocked pairs resume explicitly using their existing receipts; completed
response jobs and completed pair checks are never relabelled or replayed. Original
IDs, human evidence, failed jobs, assessment/check identities and completed work
remain intact. Existing pair freshness, lease, cancellation and checkpoint CAS rules
continue to apply. Startup does not run inference. Future receipt formats retain
existing fail-closed parsing. No new model-attempt grant or automatic retry is added.
Above-144k evidence still blocks before dispatch; larger input is not a provider
capacity guarantee. Older binaries may re-block pending large pairs but need no
reverse data transformation.

Tests exercise an actual old-policy 96k blocker saved to SQLite, repeated open,
explicit retry with one overlap call and no repeated completed-response call,
unchanged original evidence/jobs, invalid receipt provenance, cancellation, stale
results, malformed output, and above-144k blocking. Existing successful-pair reuse,
interrupted publication recovery, future formats and cross-worker CAS tests remain.
No personal database edits or live provider calls are part of this change.

Verification: all 25 incremental-resolution tests passed, including the disk-backed
upgrade case. The final full `npm test` rerun passed all 69 pretests and 640 main
tests. Type checking, desktop TypeScript emit, UI build and focused epic
browser checks passed. That browser runner covers workflow/recovery regressions,
not the new large-overlap queue fixture; the latter is verified at the service/SQLite
level. Exact-user-project/live-provider behavior and packaged Electron execution
remain unqualified. The broad browser suite was not rerun for this slice.

## Staged headroom v2 and local eligibility upgrade (2026-10-22)

Source/target: SQLite schema 5, format-1 review/checkpoint JSON. No SQL schema
migration or project/history rewrite is needed. New `staged-headroom-v2` reviews
have distinct input fingerprints and require an explicit matching
`retrievalWork.epicStages.contextPolicy`. Legacy `staged-guardrails-v1` stages,
including those without a protocol marker, reconstruct unchanged under v1; they
are never relabelled v2. Compatible completions, partial responses, unpublished
finals and exhausted attempts retain their original evidence and allowance.

V2 is a fallback only for otherwise blocked indivisible workflow/boundary leaves,
after existing staging and preferred-72k splitting. Planning measures exact evidence
plus the largest stage envelope and the entire existing 12,000-character draft
allowance against 96,000 characters. Actual requests are independently measured
against that unchanged hard ceiling; no human evidence is truncated or summarized.

The complete-input digest `resolved-prefix-v1`, root/subtree/context cache keys and
old context bytes remain valid. Format-1 CPU receipts optionally add
`planningPolicy: staged-headroom-v2`. Old receipts containing local size/unknown
blockers are reconsidered lazily; reviewed/waiting and saved-blocker/attempt-limit
receipts remain reusable. Re-evaluated resolved receipts replace their previous
payload transactionally under expected-revision checks and existing cache bounds.
Interruption rolls back replacement; reopen/retry is safe. A pending candidate
cannot become a skip receipt. This never grants model attempts or deletes history.
Unsupported future policy markers reject reads/writes before cache replacement.
Downgrade to older strict JSON readers after saving v2 work is not qualified.

Upgrade coverage includes SQLite reopen/resume without replay, spent validation
attempts, exhausted stages, portable continuation round-trip, exact 96,000/96,001
boundaries, stale/cancelled/malformed/oversized responses, and transactional receipt
failure/retry/future-marker protection. See
[verification and limits](discovery-efficiency.md#staged-headroom-fallback-2026-10-22).

## Legacy-order staging optimization and blocker metadata (2026-10-22)

Source/target: SQLite schema 5 and existing format-1 planning receipts/progress.
There is no SQL migration or rewrite of project/job history, completed model stages,
assessment identities or stored contexts. Root input digest `resolved-prefix-v1`,
root/subtree keys, intermediate context keys and all model/checkpoint fingerprints
remain unchanged: this is an exact-computation optimization, not a policy change.
Existing compatible CPU receipts are reused rather than forcing completed planning
or model work to repeat. Downgrading to older strict parsers after new additive
metadata has been saved is not qualified.

The existing staged target-only 54,000-character gate is evaluated before computing
the full-area seed catalog. The gate, compaction choices, exact blocker message,
partition seed order and 16-batch ceiling are unchanged; this only avoids catalog
work on a path that already must fail under the original staged contract. No size
inequality is inferred from raw text lengths or from a different evidence superset.

Legacy context closure uses an indexed priority worklist with logical sweep/record
positions. It reproduces the old question/requirement/source scan's insertion order,
edge filters, cycles, missing references and ignored supersession edges, while
visiting each reachable record once. The current-spec graph policy remains separate.
Staged rendering/compaction may be reused only for identical task flags/targets and
exact closed evidence membership in one immutable snapshot. Each caller's included-ID
order is restored. The invocation-local cache is capped at 64 entries / 8 MiB of
serialized values and never becomes a persisted evidence authority or exported cache.

Format-1 receipt tasks optionally add `blocker` with a fixed cause enum and known
numeric size/budget. New format-1 diagnostic progress optionally adds `blockerSummary`,
`closureRenderAttempts` and `reusedClosures`. Causes distinguish staged target size,
indivisible seed size, context limit, staged batch ceiling, retained evidence blockers
and spent attempts. Older cached blockers without structured cause stay `unknown`;
the app does not parse arbitrary old prose, invent sizes or rebuild compatible work
solely to populate telemetry. Unknown sizes remain null. Parent-saved metrics retain
the examined-prefix summaries on timeout/cancellation; no evidence text, IDs, paths
or arbitrary diagnostic prose is added to exports.

Tests compare exact legacy insertion order on 80 shuffled cyclic/filtered fixtures,
wire contexts against the old scan, linear record visits on a 1,000-record reverse
chain, original staged target/seed blockers, and unchanged successful partition/wire/
batch evidence keys against a frozen pre-optimization staging implementation. They
also cover reduced target preparations, repeated-render avoidance, interrupted-job
summary export/privacy, and reuse of older receipts with unknown causes. Existing
schema-4/5 rollback/reopen and staged model-check recovery tests remain applicable.
See [current staging behavior and verification](discovery-efficiency.md#staging-cost-optimization-and-blocker-causes-2026-10-22).

Verification: 60 pretests and 635 main tests passed, including a final pretest rerun
after strengthening the seed-cause check. Type checking, UI build, desktop emit,
compiled-JavaScript worker/blocker smoke and focused workflow browser checks passed.
The broad browser suite was not rerun for this slice; its preceding **Approve
resolution** failure remains unqualified. Full Electron packaging and actual
throughput on the supplied project remain unqualified. No personal database or
live provider inference was used; synthetic fixtures establish structural savings
and exact-output compatibility, not an end-to-end speedup claim for that project.

## Intermediate preparation checkpoints and phase diagnostics (2026-10-22)

Source: SQLite schema 4, including existing format-1 root-group receipts. Target:
schema 5, ordered transactional migration `intermediate-local-contexts-v1`, adding
`epic_planning_contexts` only. Existing receipt bytes, project/revision/job payloads,
assessments, completed stages and spent attempts are preserved. No reset, model
replay or backup rewrite is needed. Startup does not run inference. Migration failure
rolls back the new table, migration history and `user_version` together; reopening
retries safely. Older app versions reject schema 5 rather than downgrade it.

The existing complete-input digest `resolved-prefix-v1` and original root-group keys
remain unchanged because scheduling, exact wire contexts, model/checkpoint identities
and freshness semantics are unchanged. Completed recursive subtrees now share the
receipt table under a separate `subtree-v1` key domain. Only fully resolved
reviewed/waiting/blocked subtrees are saved; an interrupted parent or pending subtree
cannot become a skip receipt. Counts retain their original report basis. Existing
root receipts keep working without redoing their completed local computation.

Successful exact context computations and complete `ContextBudgetError` outcomes may
be checkpointed under `epic-context-computation-v1` keys containing revision, review
identity, guardrail seed order, final-response flag and explicit-load IDs. These keys
are additionally bound to the complete project/history/submission/scope digest.
Changed inputs cannot reuse contexts. Cached contexts are copied before use and
their live review identity alias is restored; staged batches retain their original
partition, finalized identity and exact evidence basis. This is computational reuse,
not new model-review evidence or a larger call allowance. Later independent output,
revision and publication checks remain in force.

The new table holds at most 128 entries / 16 MiB of serialized payload per project,
for one input generation, retaining the recently computed tail. Byte accounting is
stored separately so eviction does not repeatedly decode context bodies. Writes use
an expected-revision guard and commit atomically with eviction. Oversized entries
are not persisted; computation continues. Unknown future envelope formats reject
validated reads/writes without replacing saved rows. Context bodies can contain exact
private requirement/evidence text: they stay in local SQLite and are never included
in portable projections, workspace artifacts or metadata-only diagnostics. Eviction
or a cache miss only causes local recomputation, never deletion of original evidence.

Format-1 progress gains optional `examinedStates`, `activity`, `activityMs`,
`preparedContexts` and `reusedContexts`. The fixed allowlisted numeric fields leave
older measurements readable and absent values unknown. Worker elapsed-time buckets
are exclusive sampled wall time, not pure CPU time or a complete parent-side planning
total; an interrupted current operation can be only partially measured. Prepared
context counts denote checkpointable computations, not proof of disk persistence or
model acceptance. Group counters now include completed subtrees as well as roots.

Tests exercise schema-4 rollback/retry, original root receipt preservation, repeated
reopen, stale writes, bounded eviction, oversized entries, future formats, partial-root
interruption with retained siblings, exact context/overflow reconstruction, phase/state
diagnostic privacy and lower preparation counts on retry. See
[current behavior and verification](discovery-efficiency.md#intermediate-preparation-reuse-and-explainable-progress-2026-10-22).

Verification: all 57 pretests and 633 main tests passed. Type checking, UI build,
desktop TypeScript emit, compiled-JavaScript worker startup/receipt/state smoke and
focused workflow browser checks passed. The focused runner initially exposed the
evicted-log outcome-banner regression; it passes with typed-report recognition and
a bounded 30-second wait for its deliberately expensive no-inference fixture.
The broad browser command still stops at the missing **Approve resolution** assertion
in `src/web/browser-check.ts:1350`; its portable/specification runners did not execute.
No personal database or live provider calls were used. Full packaged Electron and
the supplied project's actual throughput remain unqualified.

## Exact-input local planning continuation (2026-10-22)

Source: SQLite schema 3. Target: schema 4, ordered migration
`exact-input-local-planning-receipts-v1`, adding `epic_planning_receipts` only.
The startup transaction records migration 4 and advances `user_version` atomically.
No project/job/revision/assessment payloads, stable IDs, evidence, completed calls,
model-stage fingerprints or optimistic-concurrency counters are rewritten. The
derived table starts empty; prior timeouts have no retroactively invented receipts.
Schema 4 is not supported by older app versions.

Completed local scheduling of a root workflow/boundary group can save format-1
receipts for its reviewed/waiting/blocked tasks and report counts. Pending tasks,
partially split groups and exceptions cannot establish a skip receipt. A SHA-256
key binds reuse to the complete serialized project, ordered workflow-job history,
submission list, feature scope and explicit planner algorithm `resolved-prefix-v1`.
Even a same-revision content edit or changed attempt invalidates reuse. This key is
separate from semantic/model-stage identities. Future context/scheduling/freshness
changes must bump the algorithm version, not reinterpret old CPU receipts.

The parent persists each completed group's receipt in an immediate transaction with
an expected-revision guard. Stop, deadline, process interruption and reopening retain
previously committed groups. An explicit retry can skip their context reconstruction;
startup still makes no automatic model calls. The currently incomplete group must
restart, and all pending work prepares fresh exact contexts. These are local CPU
checkpoints, not proof of model review or completed requirements. They are not included
in portable projections, workspace artifacts or diagnostic exports. Only optional
numeric `resolvedGroups`/`reusedGroups` counters enter format-1 diagnostic progress.

Storage keeps one exact-input generation per project, bounded to 2,000 groups/4 MiB;
changed-input cache replacement is transactional and deletes derived receipts only.
At the cap, planning continues without further persistence. Unsupported future
receipt formats reject reads/writes without replacement. A failed SQL migration rolls
back its table/version/history together and is safe to retry. Original evidence needs
no backup rewrite because it is untouched. Snapshot-local approval parsing, decision
projections and lookup indexes are shared only during immutable planning; protected
submission views copy mutable maps. No persisted context encoding or evidence policy
changes result from these indexes.

Upgrade/recovery tests cover a schema-3 fixture, rollback after table creation,
successful retry, repeated reopen, unchanged revision/job bytes, and future receipt
preservation. Planning tests cover cancellation after saved groups, another deadline,
SQLite reopen, exact pending task/report identity, fewer preparations, zero-preparation
all-resolved reuse and changed-input invalidation. See
[local planning continuation](discovery-efficiency.md#exact-input-local-planning-continuation-2026-10-22)
for current verification and limits.

Verification: the full main suite passed all 633 tests; the final pretest rerun
passed all 53, including upgrade/rollback/reopen and zero-context reuse checks.
Type checking, UI build, desktop emit, compiled-JavaScript worker smoke and focused
workflow browser verification passed. No live model calls or personal database
were used. Exact-project performance and full Electron packaging remain unqualified;
the broader browser suite was not rerun for this follow-up.

## Incremental workflow preparation and local progress (2026-10-22)

Source: existing format-1 epic-review reports and optional format-1 discovery metrics.
Additive target: reports may include `planningPartial: true`; format-1 metrics may
include optional format-1 `planningProgress` with fixed phase enums and numeric counts.
Diagnostic exports label prefix backlog counts with `scope: examined-prefix`; absence
retains the earlier saved-scope interpretation. Recording-state adapter-time totals
now export null, not an invented completed-run zero. This initial worker-isolation
slice did not change SQLite/project/portable schemas, revision counters, context
policies or semantic evidence fingerprints; the later schema-4 CPU checkpoint
addition is described above.

No legacy payload is rewritten or old plan/call identity recomputed at startup.
Initial workflow planning now stops after the first eligible package and runs in an
owned CPU worker with parent cancellation and a two-minute deadline. Equivalent saved
no-policy/headroom/staged profiles, completed results, spent attempts and overlapping
split children are still reconstructed before new grouping. Precomputed staged batches
retain the same exact evidence basis and finalized review identity on every batch;
they do not grant a new request or change the original partition. Full synchronous
catalog planning remains available for deterministic inspection/compatibility checks.

Progress is an optional local diagnostic field, saved through the existing transactional
measurement-only update, not a specification revision or a completed-check receipt.
Its absence stays unknown. Half-second pulses update elapsed/last phase without
pretending another package or model call completed. On interruption, existing lease
recovery retains partial measurements and old evidence; there is no automatic worker
restart/inference. Local preparation may repeat on explicit retry because these
checkpoints are not a persistent computation cursor. Worker caches are invocation-local.

The worker cannot write storage or access providers. On-demand historical snapshots
come from the immutable revision reader in the parent; current revision and cancellation
are checked before inference. Parent timers do not rely on a blocked planning worker's
event loop. The five-minute discovery bound and six-minute lease are unchanged; no
blanket lease extension masks a stalled planner. Cancellation/deadline cleanup terminates
only the owned CPU worker. Unsupported future progress/report fields reject normal
validated reads without overwriting saved data. No ordered SQL migration, backup
rewrite, reset or repeat model call is needed for this additive optimization. Downgrade
support for new report/metric metadata is not promised.

Tests cover identical first-package identity/evidence versus full planning, partial
counts, parent responsiveness, cancellation during exact context preparation, bounded
worker deadline and cleanup, fresh work after cancellation, stale human changes,
durable pre-model progress, API startup/cancel responsiveness, staged exact-basis
reconstruction and SQLite reopen without model replay. Existing legacy/full-policy
recovery checks remain applicable. No personal database or supplied diagnostics were
committed as fixtures. See [preparation behavior and limits](discovery-efficiency.md#responsive-incremental-preparation-2026-10-22).

Verification: `npm test` passed all 49 pretests and 633 main tests. Type checking,
UI build, desktop TypeScript emit, a compiled-JavaScript planning-worker smoke check,
and the focused epic-workflow browser check passed. The broader browser command
stopped at the missing **Approve resolution** assertion in `src/web/browser-check.ts:1347`;
its subsequent portable/specification runners did not execute. Full packaged Electron
execution and the user's exact interrupted project remain unqualified. No live
provider calls or personal database were used.

## Browser Resume mode correction (2026-10-22)

No persisted schema, payload, context-policy, fingerprint, SQLite/portable version
or revision-counter change. The new authenticated same-origin browser endpoint
`POST /api/projects/:id/resume-discovery` validates the current revision and bounded
question target, then routes using current server-side input state. It accepts no
legacy retrieval-policy/mode override. Its `processOnly` queue option is ephemeral,
not saved project state.

Unfinished non-archived/non-resolved input uses finite isolated follow-up, preserving
existing scope/conflict/overlap recovery. Empty selected queues stop rather than
falling through to unrequested legacy discovery. Otherwise explicit browser Resume
uses workflow discovery, as the Design button already did. Startup alone never
starts work. Legacy terminal/API discovery and explicit saved-job continuation
retain their existing contracts.

The workflow planner still reconstructs compatible saved no-policy/headroom/staged
contexts and spent allowances first. This correction does not rewrite old jobs,
adopt legacy lens checks as workflow evidence, transfer/reset spent attempts, change
human constraints or force completed calls to replay. No data transformation,
backfill or SQL migration/backup transaction is needed. Existing dated evidence and
future-format rejection remain unchanged. Unsupported oversized exact evidence can
still block, independently of routing.

Tests cover resuming after a legacy context blocker without modifying its ledger,
finite saved-response processing, empty/out-of-scope input, authentication/origin/
revision validation, and paused staged work across SQLite reopen: the six original
receipts remain unchanged and only two remaining calls run. The focused browser
runner now exercises the actual queue Resume button after reload, rather than
using Explore next gaps as a substitute for Resume.

Verification: Windows Node 22.23.3 type check, UI build, full `npm test` (43 pretests /
633 main tests), and focused workflow browser check passed. The broad browser command
still stops at the existing **Approve resolution** assertion (`browser-check.ts:1347`),
so its later portable/specification runners did not execute. An initial focused run
hit an index-page 404 while the broad command rebuilt the shared UI output; a separate
rerun after the build passed, including the actual staged Resume-button path. No live
model calls, user database changes, or imported diagnostic-file fixtures were used.

## Local discovery measurements and explicit diagnostic export (2026-10-22)

Source: jobs without diagnostic measurements. Additive target: optional format-1
`Job.discoveryMetrics`, a strict bounded metadata envelope (initial planning/context,
workflow matching counters and up to six adapter-attempt durations/context summaries).
No SQLite/project/portable version or optimistic revision changes. Measurements are
outside context data/manifests, semantic hashes and assessment/continuation identities.
The local selected-context traversal property is ephemeral; only safe numeric summaries
are saved. Diagnostics are excluded explicitly from portable continuation.

No startup backfill or legacy-job rewrite: absence remains unknown, not invented zero
timings or a reason to repeat model calls. New jobs checkpoint format-1 metadata
before requests, on return/failure and at terminal completion using transactional
updates of only the measurement field. Those writes do not create project revisions,
activity or workspace dirtiness, and cannot overwrite concurrent terminal job state.
Request entries describe adapter attempts, not proof of network/provider acceptance.
After process death, retained `recording` state and null unfinished durations remain
partial even if existing lease recovery marks the job interrupted. No automatic calls
or timing reconstruction run on reopen. Finalized measurements cannot be rewritten.

No source evidence is transformed, so no backup rewrite or ordered SQL migration is
needed. Future/malformed metric envelopes reject job/export reads without overwriting
stored payloads. Existing compatible completed work, checkpoints and spent attempts
retain their original identities. Downgrades may ignore the optional local field;
measurements are never required to recover work.

Export is explicit, authenticated, same-origin and read-only: one to twenty distinct
owned discovery jobs, SQL metadata projection, fixed safe section keys, report-local
IDs and a 256,000-byte output cap. It excludes arbitrary diagnostic prose and original
text/paths/identifiers rather than applying heuristic redaction. Missing historical
measurements are null. Counts/durations can still disclose scale; UI/report warn users
to review before sharing. See [diagnostic fields and limitations](discovery-efficiency.md#export-a-representative-discovery-run).

Upgrade/recovery tests cover older jobs, repeated SQLite reopen, interrupted in-flight
checkpoints and real expired-lease recovery, future-format rejection without writes,
unchanged evidence/revisions, actual per-invocation requests across staged resume,
no-call reuse, exact-load growth and portable exclusion. Privacy/API checks cover
free text/arbitrary section keys, ownership, authentication, origin, duplicate IDs
and selection bounds. Browser checks cover selection, download/privacy and export
failure without starting discovery.

Verified on Windows Node 22.23.3: full `npm test` (38 pretests / 633 main tests),
final focused diagnostics checks, type check, UI build and focused workflow and
specification browser checks. The full browser command remains blocked at the
previously documented missing **Approve resolution** assertion (`browser-check.ts:1347`);
the separate portable browser runner remains blocked by the duplicate **Open shared
checkpoint** selector (`portable-browser-check.ts:37`). An initial diagnostics-panel
Stop-button visibility regression was fixed by collapsing diagnostics below active
controls and rerunning the broad check past that assertion. No live model calls.

## Graph-backed current-specification contexts (2026-10-22)

Source formats: no-policy, `headroom-v1` and `staged-guardrails-v1` epic-review format 1.
Additive target: epic-review format 1 also accepts `contextPolicy: current-spec-v1`.
No SQLite/project/portable version, optimistic revision, saved evidence, assessment
or `gap-evidence-v1` fingerprint semantics change. The graph is a derived local index,
never a new persisted source of authority. Existing lossless encodings and explicit
generated-metadata omission legends are reused.

New/changed non-staged workflow work compares current-spec metadata projection before
the existing headroom/staging/splitting path. Reconstruct compatible completed,
partial, exhausted and unpublished-final work under its saved policy first; do not
relabel old calls or repeat them merely to change context representation. Legacy
working-set closure order is retained for exact raw-wire checkpoint reconstruction.
Normalized legacy gap identities use indexed closure with the same evidence set.
The new policy's actual projected context participates in the existing exact basis.
Staged batches retain their original policy and mandatory evidence semantics.

No existing payload or history is rewritten at startup, so there is no SQL migration,
backup rewrite or interruption transaction to recover. Repeated startup is read-only
with respect to this optimization; ordinary publication still uses existing leases
and revision transactions. Unsupported future policy names reject reads without
overwriting saved records. Downgrade compatibility for new-policy jobs is not promised.
Original human evidence, IDs and dated completed work remain intact. This is not a
license to delete history, infer missing supersession or certify stale checks current.

Tests cover current/legacy closure equivalence, cycles/missing links, no shared-file
fan-out, exact retained human evidence, generated-background reduction, ambiguous
answer retention, unchanged input objects, and previous headroom completed/exhausted/
unpublished-final jobs across repeated SQLite reopen and no-replay recovery. Existing
legacy/staged upgrade and future-format rejection tests remain applicable. See
[discovery efficiency](discovery-efficiency.md) for measurement and remaining scope.

Verified on Windows Node 22.23.3: 28 pretests / 632 main tests, final five-test graph
suite including a pre-graph identity oracle, type check, UI build, synthetic benchmark
and focused workflow browser check. No model calls or user database inspection.
Ranked search and narrower semantic invalidation are not implemented by this change;
new-policy portable cross-machine continuation is not separately qualified.

## Oversized workflow context recovery (2026-10-22)

### Staged shared-decision review

Source formats: no-policy epic-review format 1 and `headroom-v1` with retrieval-work
format 1. Additive target format: epic-review format 1 with explicit
`contextPolicy: staged-guardrails-v1` and `guardrailBatches` (1–16 arrays of exact
record IDs); retrieval-work format 1 with optional **format-1 `epicStages`** containing
the complete exact-plan hash, batch count, phase/cursor, drafts, ordered successful
response receipts and per-stage spent attempts. Reports optionally add
`stagedProgress`. No SQLite schema, project format or concurrency revision changes.

Only new/changed above-target work adopts the staged policy. Reconstruct matching
saved profiles and preserve compatible completed/partial/exhausted work first,
including legacy splits. Never relabel an earlier single-context review as a staged
check or reset an attempted stage. No existing payload is rewritten, so no data
reset, migration inference, backup rewrite or SQL transaction is required at startup.
Unknown future policy/checkpoint formats reject reads without overwriting evidence;
downgrade compatibility for staged jobs is not promised.

The stage plan binds all exact batch bases, not just the currently displayed batch.
Every successful response stays in the checkpoint history; draft selection is
reconstructed locally and checked independently in `finishJob` before atomic
publication. Attempts are persisted before inference and reset for the next stage
only alongside the completed receipt. Interrupted/malformed/cancelled responses
do not earn a receipt. Six-request package pauses and final-publication failures
resume explicitly; completed responses do not replay. A genuinely changed guardrail
invalidates the affected plan; dated previous output remains stored and is not
manufactured into current evidence. Ordinary expected-revision/live-lease guards
still apply. Publication scope explicitly records the union of separately reviewed
exact evidence; it is not an expanded single-request context.

Stage base contexts cap at 54k and actual requests at 72k, reserving a 12k draft pool
plus instruction headroom. No human text/provenance is sliced. An indivisible exact
closure or excessive batch count still blocks; semantic model judgments and arbitrary
cross-batch relationships are not claimed as fully verified. Research is unsupported
and explicitly rejected rather than silently disabled. More model calls are possible:
up to sixteen discovery plus sixteen validation stages, three attempts per stage,
six requests per package invocation, with no startup inference or automatic refill.

Upgrade/recovery tests cover repeated SQLite reopen, future checkpoint rejection
without writes, complete legacy-policy reuse, preserved spent attempts, six-request
pause/resume, late veto before publication, unpublished-final recovery, direct storage
rejection of unchecked drafts, changed evidence and cancellation. Verification
results are recorded in the workflow review document.

Implemented verification: type checking, 28 pretests / 626 main tests, UI build,
focused staged/epic browser, and separate portable/specification browser checks passed
on Windows Node 22.23.3. The full browser command still fails its existing resolution
approval assertion at `src/web/browser-check.ts:1347`. No user data or live model calls
were used. New staged clone/pull continuation remains separately unqualified; existing
portable tests do not prove that flow. No completed saved work was deliberately
invalidated to apply this optimization.

### Proactive headroom policy and saved-work preservation

New epic contexts add optional `epicReview.contextPolicy: headroom-v1` and optional
format-1 `epicContextBudget` diagnostics. New reports may add an optional
`contextBudget` summary. Project/SQLite/portable schemas, epic-review format 1,
retrieval-work format 1 and optimistic revisions remain unchanged. Legacy absence
means the original reconstructible policy, not a retroactively invented headroom
policy. Read validation rejects unknown future policies/budget formats without
overwriting their payloads. Downgrade support for the new policy is not claimed.

The 72k target includes the app's context envelope; 96k stays the hard ceiling.
Optimization runs before splitting, with generated-metadata compaction and bounded
exact phrase sharing using the existing lossless shared-text wire representation.
Expanded phrase evidence has the same existing evidence basis. Policy text or
actually loaded evidence may change for new work; its new profile and resulting
exact basis remain explicit, not relabelled as a legacy call.

Before applying new grouping/encoding, reconstruct saved profiles at current exact
evidence and compare package identities, extra loaded records and final/checkpoint
bases. Preserve matching parent packages, previously split children and overlapping
boundary children. Completed outputs and exhausted allowances are retained even
when they exceed the new soft target. Genuinely changed inputs reopen normally;
unrelated edits do not reset completed calls. Cached candidates are local planning
only, not new persisted provenance. No existing source, job, report, snapshot or
assessment is rewritten, so no payload migration or backup transaction is needed.

New writes retain ordinary leases/revision guards. Publication failure after a final
checkpoint can recover under the saved profile without inference. Startup remains
paused. Mandatory evidence that cannot fit 72k is explicitly above target; an
irreducible 95,197-character fixture demonstrates that guaranteed headroom for all
shared human constraints remains a staged-review/scoping limitation, not a passing
optimization claim.

Upgrade tests curate older schema-1 snapshots and no-policy jobs, exercise repeated
reopen, above-target completion reuse, spent-attempt retention, overlapping boundary
children, unpublished-final recovery and future-format rejection without writes.
Growth tests retain new answers/notes and explicit file loads; unsupported oversized
loads still fail before the additional inference. Type checking, `npm test` (28
pretests / 618 main tests), latest 127 context/retrieval/epic tests, UI build and
focused epic browser checks passed on Windows Node 22.23.3. Portable and specification
browser checks passed separately. The broader browser command stopped at the existing
resolution-approval visibility assertion (`src/web/browser-check.ts:1347`), so a full
browser pass is not claimed. No live model calls or user database inspection were
performed. The genuine above-target mandatory-evidence case remains an explicitly
documented limitation, not a forced migration or reason to reset data.

### Near-cap generated-instruction fallback

After the existing exact, deferred-file and lossless snapshot attempts, an oversized
minimum epic package can compact only app-authored policy/encoding explanations.
The combined workflow instruction replaces the redundant legacy single-lens prompt;
known policy fields use concise equivalent rules. A long generated advisory summary
may be replaced with an explicit omission notice. Requirement/scenario text, question
wording/options, human sources/addenda, provenance and mandatory scope remain exact.
This is not recursive shortening of arbitrary `text`/`explanation` fields and does
not raise the 96,000-character limit. The complete workflow envelope is checked too.

Project/SQLite/portable schemas, stage/checkpoint formats and source payloads remain
unchanged. Earlier context forms are tried first, so previously fitting contexts and
their saved identities still reuse without model calls. The shorter policies are
part of the existing conservative exact-evidence basis for newly enabled contexts;
older successful evidence is not relabelled or migrated. Locally size-blocked work
can be reconsidered on explicit retry; spent attempts, jobs and original snapshots
remain intact. Startup never starts inference. Final-checkpoint publication failure
and repeated reopen retain the new representation and recover without replay.

Near-limit fixtures cover both an otherwise fitting 95,808-character working set
that overflows when the workflow envelope is added, and a 97,093-character working
set already over the hard cap. Instruction compaction produces complete requests
of 94,218 and 95,503 characters respectively, while a larger
80-requirement fixture remains explicitly blocked without data loss. Actual user
project fit and live model behavior remain unverified.
Verification: type checking, `npm test` (28 pretests / 608 main tests), latest 117
focused context/retrieval/epic tests and a final near-cap regression passed on Windows
Node 22.23.3. Recovery coverage now exercises the new instruction fallback across
final-checkpoint publication failure and repeated reopening without replay.
UI production build and focused epic browser checks also passed (the existing
>500 kB bundle warning remains). No live model calls were made.

### Distributed approval-history fallback

If splitting and static-file deferral still cannot fit a minimum workflow package,
the builder additionally tries format-1 `reviewSnapshotEncoding` in the request
only. Canonical approval/rejection source strings can reference an exact loaded
requirement's matching statement/scenarios, plus the original decision and exact
addendum. Canonical parsing checks the entire envelope and acceptance serialization;
ambiguous/unknown prose and mismatching historical wording remain original strings.
No human text is summarized, omitted or inferred; original sources are unchanged.

Project/SQLite/portable formats, epic-review/retrieval formats, package membership
and attempt ceilings stay unchanged. Exact evidence hashing expands snapshot
references back to byte-identical strings and excludes only the encoding legend,
so the existing `gap-stage-evidence-v1` identity is preserved. Older fitting contexts
are tried unchanged first. Compatible stages/finals remain reusable, and publication
still uses current revisions/leases. An unsupported encoding format or missing target
fails closed. No startup inference, payload migration, history rewrite or allowance
reset occurs; a previously local size blocker is reconsidered only on explicit retry.

The synthetic distributed fixture retains all 65 requirements, 65 answered questions
and all human sources, reducing the minimum review request from a previously blocked
133,387-character working set to 90,977 characters including workflow instructions.
This is a deterministic fixture result, not a measurement of the user's database.
Tests verify exact round-trip, unchanged evidence hashes, addenda/older rejections,
ambiguous and mismatched history, unsupported encoding rejection, and final-checkpoint
recovery/repeated reopen without replay. Live provider comprehension and the user's
actual saved project remain unverified.
Verification for this fallback: type checking, `npm test` (28 pretests / 607 main
tests), latest 116 focused context/retrieval/epic tests, UI build, focused epic browser
check and whitespace check passed on Windows Node 22.23.3. The broader browser
failure recorded below was not requalified by this backend-only follow-up.

Diagnostic-bound correction: app-generated blocker messages are now explicitly
shortened (with a visible marker) to the existing 1,200-character report-reason
limit before validation. This affects diagnostic prose only, never exact evidence,
fingerprints or stored decisions. The previous overflow failed report publication;
it did not publish an invalid report or apply proposals. Failed job history remains
unchanged, and explicit retry rebuilds the report without resetting saved model
attempts. No schema widening, migration or data reset is needed. Type checking,
48 focused tests and the epic browser check passed, including 20 overlong blockers
and one-copy display of a failed diagnostic. The full suite was not rerun at that
point; the later distributed-approval fallback run above includes this correction.

Source and target remain project/SQLite formats unchanged, epic-review format 1 and
retrieval-work format 1. There is no persisted summary field or schema migration.
Compact requirement previews are derived navigation only, excluded from the existing
exact-evidence basis just like other record-index labels. No saved source, requirement,
assessment, review, checkpoint, spent allowance or original model output is rewritten.

Existing exact-context planning and splitting are attempted first, preserving the
package identities and evidence bases of previously usable/successful reviews. Only
irreducibly oversized packages gain a fallback using the existing deferred-workspace
evidence representation. Their exact human constraints remain pinned; explicitly
requested extra records stay exact. Previously local size blockers had no successful
review or inference checkpoint and can become eligible on explicit retry without
resetting model attempts. Existing model-produced blockers/attempt exhaustion remain
subject to exact evidence matching; no blanket blocker reset is introduced.

Startup performs no inference. Explicit retry reconstructs current exact context;
publication still uses revision/lease checks. Compatible completed reviews and saved
loads/finals retain the existing recovery path. Oversized human evidence still blocks
with more detailed diagnostics; it is not silently reclassified or summarized.
Verification: type checking, `npm test` (28 pretests / 603 main tests), and the
latest 41/41 epic tests passed on Windows Node 22.23.3. Upgrade coverage includes
an older local no-call size-blocker report, exact snapshot/job preservation through
repeated reopen, explicit fallback recovery, and subsequent completed-review reuse.
The focused epic browser check passed including all-blocked diagnostics/mobile;
portable and specification browser checks passed separately. The full browser command
stopped at the resolution approval visibility assertion in `src/web/browser-check.ts`
(line 1293), so a full browser pass is not claimed. No live model calls or user
database inspection were performed; applicability to the user's particular large
shared evidence remains to be checked by an explicit retry.

## Bounded implementation-planning candidates (2026-10-22)

Source and target remain execution schema 1 / planning format 1, with unchanged
SQLite/project/portable formats, freshness checks and config fingerprints. Planning
no longer repeats an unbounded full-project behavior index in each request. Exact
mandatory target evidence and existing dependency guardrails are unchanged. Optional
exact candidates fit within the existing context budget; omitted scope is explicit
and saved as an ordinary unresolved package question. Approval already requires
human resolution notes for questions. Dependencies on omitted behavior are rejected.
This is bounded candidate analysis, not a claim of exhaustive prerequisite discovery.

No saved plans, approvals, assessments, original model evidence or execution sessions
are rewritten. Old approved plans remain current under their original checks.
Explicit retry of a failed/interrupted plan reuses compatible completed packages
unchanged and applies the bounded builder only to unfinished targets. Failed attempts
remain in planning history. Startup does not repeat inference; existing revision,
binding, cancellation, lease and CAS checks still govern publication. No migration
or schema bump is necessary. Mandatory-only overflow remains a blocker and now
reports section sizes rather than suggesting that splitting always solves it.

Verification: type checking, focused planning tests and full `npm test` passed
(28 pretests and 600 main tests) using Node 22.23.3 for SQLite tests. Coverage includes
exact candidate retention, mandatory overflow without inference, persisted omission
questions, rejection of unseen prerequisites, compatible package retry/reopen and
portable partial-plan continuation. `git diff --check` passed. No live model calls
or user database edits were performed. The reported 633,285-character saved prompt
has not been reproduced; excessive mandatory evidence may still block that project.

## Larger mandatory-only allowance for saved follow-up (2026-10-22)

Source and target remain SQLite 3, unchanged project/portable formats and existing
context manifests. A single saved response can now use a final 144,000-character
mandatory-evidence allowance after the previous 48,000/96,000 planning/compaction
passes. Both queue preflight and service planning opt in. Optional reconciliation
candidates remain bounded by the old allowance, and expanded packages do not receive
optional related-record hints. Advisory/help, gap exploration, general discovery and
ordinary focused checks do not opt in. This supersedes the previous change's retained
96,000-character cap for this specific workflow, not its evidence-preservation rules.

No persisted records, fingerprints, semantic assessments or completed checks are
rewritten or invalidated. Older needs-attention submissions retain their applied input
and retry explicitly using the new planner; reopening does not call a model. Existing
lease, expected-revision, cancellation and publication checks are unchanged. Over-limit
input still saves a preflight blocker without inference. Failed/provider jobs retain
their original evidence; the allowance is not a guarantee of model capacity.

Verification on Node 22.23.3: type check, 75 focused tests and full `npm test` passed
(28 pretests, 598 main tests). The new disk-backed upgrade test preserves a legacy
96,000-character blocker across reopen, then verifies one explicit saved-response
retry, exact human sources/question options, no optional refill and no duplicate input.
Existing queue tests now exercise retained blockers above 144,000 characters. A
read-only check of all four actual blocked submissions at revision 1935 reproduced
their previous sizes and confirmed preflight succeeds at 118,706, 103,292, 115,617 and
102,472 characters against the new cap. No project data was edited or inference run.

UI build passed. The browser suite passed its updated oversized-response/addendum
blocker/reload/retry flow, then failed later at `src/web/browser-check.ts:1293`, waiting
for a requirement heading in a collapsed epic. That unrelated browser flow, and later
scripts skipped by the chained command, are not reported as passing.

## Background approval projection for saved follow-up (2026-10-22)

Source and target remain SQLite 3, existing project/portable formats and context
manifest decisionProjection format 1. Isolated follow-up now uses the same verified
current-decision projection as gap exploration, only for background records. Target
requirements and explicitly requested evidence keep their original approval history.
Exact current wording/scenarios, human addenda and ambiguous provenance are retained.
No sources, links, revisions, assessments, fingerprints or completed jobs are rewritten;
there is no schema migration or startup inference. Old needs-attention submissions
use the updated planner on explicit retry, preserving their already-applied responses.
The mandatory input cap and existing revision/lease/publication checks are unchanged.
Oversized human evidence can still block, without manufacturing a current decision.

Verification: type check, 102 focused context/retrieval/specification/approval tests,
and full `npm test` passed (28 pretests, 597 main tests) using the existing Node
22.23.3 installation. The new regression covers oversized superseded background
approvals, repeated planning, unchanged original records, protected target/supporting
history and blocking for human addenda, unknown prose, branched or mismatched evidence.
Existing queue restart/retry tests also passed. The initial default-Node-20 test
attempt was blocked by the installed SQLite native module's Node-22 ABI; no modules
were rebuilt. No live provider calls or user database edits were performed. The
reported project's exact context has not been reproduced against its saved data.

## Local completion of plain approvals (2026-10-22)

Source and target remain SQLite 3 and the existing project, submission and portable
formats. No startup rewrite, schema bump or fingerprint change is needed. A newly
submitted approval with a whitespace-only/empty note runs the existing transactional
review checks and records the original input, confirmation source and applied revision,
then completes without a model job. Automatic AI processing may remain paused.
Notes, rejection and change requests retain their existing follow-up behavior.

Older queued approvals still pass current safety checks before application. Older
applied `saved` plain approvals without a job or overlap receipt can complete locally
on explicit resume, including recovery after interruption between application and
completion. Application is not repeated. Reopening alone does not convert saved work
or run inference; completed results, failed model-job evidence and interrupted overlap
receipts remain unchanged and use their existing explicit retry/continuation paths.
Original evidence, history, semantic assessments and completed checks are retained.

Upgrade/recovery coverage is in `src/service/local-approval.test.ts`: queued and
already-applied legacy submissions, repeated reopen, request replay, active-worker
exclusion and retained failed-job retry. No user database reset or model call is required.

Verification (Windows, Node 22.23.3): all 101 focused approval/change-request/recovery,
decision-availability and context tests passed; type checking passed. The broader
`npm test` run passed its 28 pretests and 594/595 main tests before the final scoped
approval test was added. Its remaining failure is the static Review UI expectation
at `src/core/refinement.test.ts:383` (`Approve resolution` is absent in collapsed
epic markup); that test does not use the changed discovery queue. UI work already
in progress was left untouched. No live-provider or real-project latency benchmark
was run; these checks establish avoided model calls, not a fixed timing guarantee.

## Continuous specification (DEC-030)

Source and target remain SQLite 3, portable manifest 3 and existing project/feature
artifact versions. This is an additive forward read path, not a database rewrite:
requirements may now contain optional `authority` format 1 (`answer-derived`, exact
source IDs, explanation and publication revision); analysis/job results may contain
optional `specificationUpdates` format 1. Both envelopes reject unsupported formats.
Project parsing preserves authority; portable import checks its source links and
revision rather than manufacturing missing provenance. Markdown exports explicitly
distinguish answer-derived wording from separate human approval.

Missing envelopes mean legacy behavior. Reopening never adopts old proposals,
changes old accepted/rejected decisions, or repeats model work. Saved results,
checkpoints, assessment identities and review/content fingerprints keep their existing
algorithms. Authority itself is not added to old fingerprints: it describes how
wording was recorded, not a different behavioral specification. Actual wording/source
changes use existing freshness rules; valid unchanged assessment/delivery evidence is
not invalidated solely by this compatible workflow addition. Older binaries are not
qualified for editing projects containing the new metadata (they may strip unknown
fields); retain this version or newer when sharing these projects.

New updates, authority and job output commit in the existing publication transaction
with a live lease and expected revision. Failures roll back the entire publication;
original inputs remain available for explicit resume. No separate version bump or
startup migration/calls are required. Human approval sources are never synthesized or
superseded by automatic updates, and original wording/IDs remain in revision history.
Refinement and explicit review preserve their original evidence semantics.

Upgrade tests in `src/service/specification.test.ts` use older saved proposals and
approvals, interrupted input, repeated SQLite reopen, explicit retry and portable
round-trip preservation. Future authority formats fail closed. Verification results
are recorded in [continuous specification](continuous-specification.md#compatibility-and-verification):
type check, all 613 deterministic tests and all eight browser checks passed on Windows
Node 22.23.3, including repeated reopen/retry and portable preservation. The production
build, both CLI help commands and diff check passed. Live semantic fidelity remains
unqualified; no live provider calls or user database rewrites were performed.

## Evidence-blocked epic outcomes and independent continuation (2026-10-22)

Source and target remain SQLite 3, epic-review/retrieval format 1 and unchanged
project/portable formats. A new valid `reviewBlocked` response is saved atomically
as a completed job with its existing `epicReviewReport` blocker and no `result`
or retrieval final. Completion records finished work, **not** a reviewed package.
The transaction requires a live lease, matching expected revision, package blocker
and matching spent-attempt count; it makes no specification revision. Invalid
output/provider failures retain failure semantics. Targeted runs continue independent
packages after valid evidence blockers without extra retries or relaxed run bounds.

No persisted-data rewrite or schema migration is necessary. The planner recognizes
both old failed blockers and new completed-without-result blockers, preserves their
specific reasons, checkpoints, original IDs/history and spent attempts, and skips
unchanged packages. No automatic inference, blocker reset or reassessment is granted.
The uncertainty-versus-factual-evidence clarification is runtime prompt text only:
package construction, exact context data, evidence/check fingerprints and compatible
saved finals remain unchanged. Existing genuinely stale evidence is not made current.
Older failed jobs are not relabelled; downgrade behavior for the new outcome semantics
is not qualified.

Upgrade tests reproduce the previous failed-blocker payload, retain a new blocker
after an exact load plus a completed check, reopen SQLite twice and verify no replay
or rewrites. Tests also cover grounded unknown-startup questions, linked versus
path-mentioned script evidence, independent continuation, all-blocked termination,
provider/malformed failures, cancellation, stale revisions and expired leases.
Live model question quality and the reported project's actual scan/link state remain
unverified; no user database inspection or live calls are required by these checks.
Verification: type check, full 584-test suite, latest 38/38 epic tests, production
UI build and epic browser regression passed on Windows Node 22.23.3. The final
targeted run includes an additional ten-package-ceiling check. The browser assertion
was updated after its first run to expect the final run outcome rather than the
intermediate blocker; saved blocker details remain explicitly asserted.

## Compact Design discovery and review pauses (2026-10-22)

Source and target SQLite, project, portable, assessment/checkpoint and job formats
are unchanged. The single Design button now explicitly chooses existing epic mode;
it does not convert legacy checks, reset spent attempts or invalidate compatible
workflow results. Existing per-project `reqwizit-question-target` browser preferences
retain their key, bounds and meaning under the **Questions ready** label.

Review now prevents predictable unsafe submissions while live workers or related
unfinished input block a decision, instead of inviting queued approvals. This changes
UI availability only: original submissions, notes, decision bases, histories and
transactional storage/queue semantics remain untouched. No forward data migration,
startup inference or reassessment is needed. Existing saved queued reviews remain
recoverable under their original checks. Failed/cancelled/completed jobs and expired
leases do not independently leave a live-worker UI lock; other blockers still apply.
Deterministic render tests cover these states and read-only notes; browser coverage
checks a blocked click creates no submission, retained notes and an explicit later
decision. Concurrent unrelated publication remains future work.

## Epic question continuation / waiting isolation (2026-10-22)

Source and target remain the existing epic-review format 1 and unchanged SQLite,
project and portable formats. This is a planner correction, not a saved-data
rewrite: unresolved questions no longer participate in requirement/note grouping
or boundary pairing; they have waiting-only singleton packages and remain exact
supporting evidence for linked targets. Recompute scheduling on explicit review.
No startup inference or reset is required, and existing question IDs/answers,
source evidence, jobs, checkpoints, spent attempts and histories are retained.

Package IDs and exact-evidence keys keep their existing algorithms. Compatible
requirement/note packages retain their memberships and completed checks. Former
mixed packages containing unresolved questions were waiting, not completed review
work; they are not relabelled as checked. Saved original package records remain in
history. Human approval semantics/fingerprints are unchanged. For discovery only,
an explicitly other-workflow question's shared-source citation does not block
independent review; source-only/global uncertainty, direct links, answer provenance
and saved human input remain conservative blockers. Previously dated evidence is
never made current by changing this scheduling rule.

Tests cover stable independent workflow/boundary identities after three new
grounded questions, separate approval/global-question gates, ten-question
continuation with overshoot, and repeated SQLite reopen preserving prior completed
checks, pending questions and original jobs without replay. A deterministic browser
fixture exercises 24 requirements in one epic and four sequential three-question
results, retaining twelve questions with a target of ten. Live-provider behavior
has not been requalified by these fixture checks.

Verification on Windows Node 22.23.3: full deterministic suite **572 passed**;
final targeted epic/backlog suite **42 passed**; type check, UI build, epic-review
browser regression (including shared-source citations), and diff check passed.

## Configurable gap question targets (2026-10-21)

SQLite/project/portable schema versions, check fingerprints and evidence identities
are unchanged. Targeted gap jobs add optional `context.questionTarget` scheduling
metadata; legacy jobs without it keep their original five-pending publication policy.
The browser remembers each project's target in a separate localStorage key (default
5, integer 1–50); this is a local UI preference, not a shared specification decision.
No saved records need rewriting, no forward data transformation is required, and
existing completed checks, request allowances, IDs, evidence and histories remain
valid. Changing the target does not trigger reassessment or reset model-call budgets.

Publication permits final-package overshoot only for explicitly targeted jobs;
ordinary no-new-question follow-up also tolerates already-saved larger backlogs.
Each package retains the existing expected-revision transaction/checkpoints. Stopping,
failure or restart preserves earlier packages, without automatically restarting
inference. Existing legacy-reopen/checkpoint tests remain applicable; targeted queue
tests cover successive publication, overshoot, already-exceeded targets, empty work,
failure/cancellation and ordinary follow-up with more than five pending questions.

Verification: Windows Node 22.23.3 type checking, deterministic tests, UI build,
main/portable browser checks and the epic-review browser check passed. Browser
coverage includes per-project target persistence, multi-package exhaustion, saved
stage reuse, outcome explanations and mobile layout. Live model usefulness/cost
and long-running live scan behavior have not been qualified; no provider inference
was used for these checks.
Two full runs passed 568 tests before the additional API-boundary test was added.
The final 569-test run passed 568, with a Windows `EPERM` creating the unrelated
credential transaction lock directory; both credential tests passed on isolated
rerun. The new question-target API test passed in that full run.

## Definition-only word help (2026-10-21)

The prior question-local fix still allowed vocabulary clicks to pull in more than
48k of exact project/dependency evidence. New UI clicks use the additive `define`
help action with `word: { phrase, text }`, instead of encoding vocabulary help in a
generic `follow-up` message. New `word-help-v1` manifests explicitly describe a
partial question representation: exact enclosing wording plus the selected display
field in the request, not a review of full question/evidence records. No evidence
is truncated or rewritten; this request is only authorized to explain terminology,
not recommend product choices. Other help actions keep their guarded context.

SQLite, portable formats, assessment semantics and freshness identities are unchanged.
Old requests/manifests/responses remain valid and unmodified; the UI recognizes
legacy word-help message prefixes as well as structured definitions. There is no
startup transformation, automatic retry, data reset or model-call replay. A failed
old explanation remains historical; a new click explicitly requests a definition.
Completed new definition jobs round-trip through the same durable job storage.
No queue or lease/revision/cancellation policy changes are made.

Regression fixtures reproduce more than 73k of mandatory guardrails while discovery
holds a live job: broader advice blocks with no inference, but definition-only help
completes without modifying human state, the live job or the failed attempt. Two
reopens preserve exact jobs and revisions without replay. Additional checks cover
large option fields and linked files, prior advice omission, exact display-field
validation and malformed definition payloads. Live provider qualification is not
established by these fixtures.

Verification: `npm run check`, all 571 deterministic tests (566 main-suite and
five worker lifecycle checks), `npm run test:browser` (including the UI production
build and portable-browser checks), and `git diff --check` passed with Node
22.23.3 for SQLite-backed checks. No live model calls were made.

## Question-local advisory help context (2026-10-21)

New help jobs use a `question-help-v1` context manifest instead of the generic
`epics-v3`/`tasks-v*` working-set manifests. SQLite, portable formats, help request/
response schemas and assessment/checkpoint identities are unchanged. This is a
new-request selection policy, not a reinterpretation of completed evidence; no
forward payload transformation, reset or startup model call is needed. Historical
manifests, failed jobs, guidance, IDs and revision provenance remain unchanged.
New requests reuse the ordinary completed-help history window, including legacy
responses, without automatically retrying failed jobs. Existing transactional job
publication, revision validation, cancellation and lease recovery remain in place.

Unlike the former advisory fallback, current feature notes and dependency human
guardrails are explicitly pinned alongside target evidence. Unrelated generated
records are no longer added simply because they fit a discovery budget. Truly
oversized mandatory evidence still blocks before inference; this does not mark
previous valid help stale or require users to repeat completed calls.

Upgrade tests construct legacy completed/failed help manifests, reopen twice,
verify exact original jobs and human revisions, then explicitly request new help
using the retained guidance. Scope/budget tests cover concurrent discovery,
forward-only shared-file links, moved source ownership, request reservation and
history omission counts. Live model qualification is not established by fixtures.

Verification: `npm run check`, all 569 deterministic tests (564 main-suite plus
five desktop worker lifecycle tests), and `git diff --check` passed. Tests ran
with the existing Node 22.23.3 runtime because the default Node 20 executable is
incompatible with the installed SQLite native module. No dependencies were rebuilt,
no live model calls were made, and browser automation was not repeated for this
service-only change.

## Desktop backend isolation and continuation comparison cache

SQLite schema 3, execution schema 1 and all portable formats are unchanged. Desktop
startup now opens the same store and protected provider service in an owned worker
thread; no records are transferred to a replacement database. Shutdown still waits
for service cancellation and store publication. Interrupted work retains the existing
lease/recovery and explicit-resume rules; worker failure never starts replacement
model calls automatically. No forward data transformation or startup replay is needed.

Continuation export caches only the current snapshot's serialized fields and array
items for the lifetime of one call. Historical records are still loaded/validated;
selection, exact delta encoding, object hashes/order, original evidence, assessment
identities and checkpoint reuse remain unchanged. No persistent cache or freshness
key is introduced. Existing transactional publication, pending hashes and conflict
checks remain in place; cleanup is awaited rather than forcibly terminating writes.

Verification (2026-10-21, Node 22.23.3): portable tests compare exact delta/object JSON
bytes with the previous encoder and restore historical arrays/scalars/evidence;
existing clone/adoption, interrupted scan/planning and assessment reuse checks passed.
All 565 deterministic tests passed (560 engine/UI/API plus five worker lifecycle
checks). Independently staged real Electron startup/relaunch/
shutdown checks passed without user-data writes or model calls. Installer upgrade
and a real process-crash-during-publication check were not repeated.

## Git-assisted assessment navigation

SQLite schema 3/execution schema 1 and portable formats are unchanged. Fresh assessment
windows now prioritize current captured files using exact feature IDs from bounded Git
history and net changes since the existing scope-specific assessment `head`. These are
ephemeral navigation hints only, not new evidence or reuse boundaries. No saved records,
timestamps, provenance, assessment identities/fingerprints or concurrency counters change.
Existing compatible results are reused before consulting history; no startup migration,
data reset or repeated model call is required. Missing old commits/history fall back
without manufacturing a baseline. Cancellation and current-source validation remain intact.
No new caches are persisted, so reopen/retry reconstructs hints from current Git state.

Verification (2026-10-21): type checking, 32 targeted storage/implementation tests and
all 559 deterministic tests passed on Node 22.23.3, including real Git history,
exact IDs, revert/net changes, dirty/untracked
files, missing commits, cancellation, reviewed boundaries, and existing SQLite reopen,
legacy enrichment, reuse and delivery checks. No live inference or speed benchmark run.

## Assessment context packing and isolated blockers

Saved formats remain SQLite schema 3/execution schema 1; no data transformation or
startup replay is needed. Assessment now also uses the existing lossless record-table
wire encoding for decisions, guardrails, supporting requirements, questions/options
and research when text/ID sharing alone exceeds the cap. This changes representation
only: exact values/order, missing-vs-null fields, expanded IDs and current file bytes
remain unchanged. The 48,000-character cap, context policy, assessment semantic identity
and relevant-input fingerprints are unchanged, preserving compatible completed work.

Assessment context-size failures now populate the existing per-requirement `contexts`
map with their over-budget manifest and retain the first legacy `contextBlock`. Older
runs without these entries remain readable without inventing per-target diagnostics.
Each blocker is checkpointed normally; blocked targets never enter `completedIDs` or
overwrite earlier findings/delivery evidence. Other requirements and the independent
main phase can continue; affected phases finish blocked. Cancellation/non-context
failures still stop, retaining prior checkpoints. Coding remains stop-on-blocker.
Publication/session details remain local and are omitted from portable continuation
as before. Explicit incremental retry reuses compatible completed results after reopen;
no schema or concurrency-version migration is required.

Verification (2026-10-21): all 557 deterministic tests passed on Node 22.23.3,
including existing migration fixtures and the new multi-blocker checkpoint/reopen
test. An additional 18 context/storage/migration checks passed after strengthening
the non-mutation assertions. Type checking, desktop compilation, production UI build
and main browser checks passed. The separate portable browser check remains blocked
by an ambiguous `Open shared checkpoint` selector. No live inference was performed.

## Desktop branding and integrated Windows title bar (presentation only)

The Q/checkmark assets and native Windows overlay change no persisted formats or
freshness rules. Existing appearance preferences supply accent/contrast colors
unchanged; no new settings keys, schema versions or data transformations. Saved
decisions, IDs, history, assessments and completed evidence remain untouched.
Staged and packaged desktop checks reopen an existing Node-created store and verify
saved-project continuity and shutdown without model calls.

## Application menu and recent workspaces (presentation/local preference only)

No SQLite, portable-state, artifact, assessment, fingerprint or job format changes.
All existing saved projects remain available in the new menu, without repeating
model calls or changing revisions. The additive `reqwizit-recent-workspaces`
localStorage key stores up to 100 distinct project IDs in selection order; absent,
malformed or non-array values start empty, and non-string entries are ignored.
Untracked projects retain the existing newest-created order. Unknown IDs are never
rendered as projects. This preference is not exported or used as decision evidence;
it needs no transactional data migration. Failed preference writes retain in-session
ordering and cannot overwrite project data. Existing appearance settings are reused
unchanged for the accent-colored header. Browser checks exercise malformed old
preferences, initial saved-project access, selection order and reload.

## Definition assessment clarity (presentation only)

No source/target format change or forward migration is needed. SQLite, portable
state, workspace artifacts, assessment revisions/checks, evidence and freshness
rules remain unchanged. The progress view partitions saved findings into current,
outdated and unassessed areas without rewriting them or invoking inference. Existing
overall score calculation is preserved; no saved work is invalidated by this display
change. Tests exercise older revision assessments, mixed freshness, unknown areas,
missing evidence and read-only rendering. Relevant-input freshness and explicit
whole-area reassessment actions are not implemented by this change.

## Portable projects and workspace-folder rename (DEC-029)

Workspace manifest **1/2 → 3**; feature/project/progress JSON remains format **2**.
New `state.json`, `execution.json`, and `continuation.json` each have independent
format **1** envelopes. SQLite remains schema **3**, with an additive, initially empty
`portable_import_backups` table; execution schema and assessment identities are unchanged.
No original database revisions, jobs, evidence, assessments or completed calls are
deleted, recomputed or invalidated simply to adopt this representation.

`.requirement-wizard/` is renamed to `.reqwizit/` only after the existing artifact
hash/journal checks succeed. A same-parent directory rename preserves bytes and unrelated
files and is recoverable on reopen; existing publication journals still apply at the
new path. Both folders existing is a conflict, never an automatic selection/merge.
Active discovery/scan/implementation leases defer migration/publication until worker release. Do not
restart a real long-running check solely to migrate the folder. Unavailable/edited
folders retain local state and report a conflict/unavailability. New portable files use
the normal intended-hash journal and manifest-last publication, including retry after
interruption. Folder-local `.gitattributes` disables text conversion to preserve hashes
and exact human evidence through Windows Git checkout.

Portability is a continuation projection, not an export of the activity archive.
Current sources/decisions and necessary supersession links remain intact. Execution
keeps semantic findings, exact capture/context/model/footprint identities, manual
invalidation requests, latest impact evidence per scope, planning packages and coding
commit/PR/delivery evidence. Process/session/worktree details and progress transcripts
are omitted. Original revisions used by retained discovery/checkpoint receipts are
exact array-prefix/suffix deltas with content-hashed shared records against current state, decoded one snapshot at a time
to avoid materializing a full revision archive in memory. Completed ordinary
interpretation/help jobs and activity events are not imported. Local database-history
compaction and further source pruning are separate future work. Completed refinement
checks whose target fingerprints cannot pass the existing reuse predicate are omitted;
their current approved/dismissed proposals and supporting source evidence remain intact.
Retained completed refinement checks use a marked `portableReceipt: 1` ledger with
their original outcome/model/keys, not their runtime navigation indexes. Historical
snapshots retain the original schema-valid payload even when an older release retained
duplicate/dangling references; they are never substituted for the validated current
project graph. Legacy context reconstruction must still prove its original wire hash.

Import/adoption is explicit, hash-checked and transactional. It rejects future envelopes,
malformed records/references, path traversal/links, inconsistent revisions and divergent
local state. Size bounds are 64 MiB/artifact and 256 MiB/set. The selected account route
and folder binding are local; old model IDs remain inference provenance. Pending
discovery work is imported interrupted, automatic processing is paused, and source-scan
bindings are explicitly mapped to the new workspace. Planning bindings are remapped;
coding runs retain a foreign binding and cannot silently reuse absent local worktrees.
Opening never runs model calls, repository commands or verification scripts.

Before adopting a changed shared checkpoint into an existing local project, original
current project/execution payloads and overwritten job/submission records are retained
in `portable_import_backups` in the same transaction. Prior revisions and other jobs/
submissions remain in place. Idempotent open creates no backup or revision. A failed
import rolls back everything, including backups. Recovery can inspect the backup table
offline; there is not yet a restore UI. A normal consistent SQLite backup remains
recommended before upgrading real data. Legacy manifest 1/2 exports cannot supply the
working state they omitted: upgrade/sync from their originating database first.

Excluded publication-directory omissions normalize to the legacy marker for full-capture
identity; scoped footprints ignore both folder names. This preserves previous equivalent
assessment identities across the rename without manufacturing inspected code. Other
byte/scope/decision/model changes retain existing conservative invalidation rules.

Initial checks: typecheck and the dedicated portable storage suite passed, including
an actual Git commit/clone into a fresh database: one completed assessment was reused
and only two unfinished requirements invoked the deterministic adapter. Changed code
then required fresh assessments. Dedicated browser checks passed for open, retained
evidence, paused queue, reload, shared-checkpoint acknowledgement and 390px layout.
Broader checks and remaining gaps are recorded in project-workspaces.md. No live model
calls, user database writes or RustGrindGalaxy folder migration were performed.

A subsequent read-only RustGrindGalaxy projection validated 390 retained original
revision-evidence snapshots and all 276 saved workspace assessments with exact data
and freshness parity. A naive array-delta representation exceeded the string-size
bound; content-hashed shared records and exclusion of provably obsolete target checks
reduced the portable set to 51,862,803 bytes. See project-workspaces.md for counts,
timing and remaining large-project/live qualification limits. Historical duplicate
references exposed by this check remain original evidence, not silently repaired data.
Final verification: Node 22.23.3 typecheck, all 553 deterministic tests, standard and
portable browser checks/UI build, terminal help commands and whitespace checks passed.

## Assessment responsiveness

SQLite **3 → 3**, execution schema **1 → 1**, assessment identity/fingerprint
formats unchanged. This is a query/render optimization, not a data migration.
Existing saved jobs, assessments, activity entries, workspace outputs, dates and
delivery evidence are not rewritten on startup or invalidated. No model calls
are replayed. Full history remains accessible through existing history APIs;
workspace polling selects its existing last-20 ordinary-job window in SQL before
decoding payloads, with advisory help history retained.

Execution saves retain immediate transactional CAS, worker/discovery exclusions
and atomic activity publication. Already-indexed activity IDs are checked inside
the same write transaction before historical revision resolution, matching the
existing insert-if-absent behavior. A failed write is retriable without advancing
the caller's version; first/new outcomes still resolve original revision evidence.
The browser's calculation projection is memory-only and never persisted. It retains
capture/impact inputs and does not certify freshness from revision/version alone.
Existing version/future-format rejection remains in place on full record reads.

Regression coverage includes SQL-only checkpoint guards/stale rejection, skipped
historical resolution, last-20/help ordering and old-job preservation across reopen,
same-version worker projections and calculation parity/invalidation. Existing
transactional migration/backfill and repeated-reopen tests remain applicable.
Type checking, all 540 deterministic tests, the UI build and full browser checks
passed on Node 22.23.3; no user database, saved evidence or live model connection
was used for verification.

## Epic workflow review

Area-boundary correction (2026-10-21): SQLite **3 → 3**, review/checkpoint format
**1 → 1**; no identity/fingerprint changes or startup rewrite. Response schemas now
restrict proposal epic IDs to detailed areas, with independent pre-checkpoint validation.
On explicit retry only, an older saved final that assigns proposals outside those areas
is omitted from the new job's cloned work before requesting a corrected response.
The original failed job/output, evidence, load stages and cumulative attempts are
preserved; the three-attempt ceiling is not reset. No valid completed checks/finals
are invalidated, no proposal is reassigned, and startup never calls the model.
Existing lease/revision-checked checkpoints and atomic publication remain in force.
An on-disk older invalid-final fixture verifies repeated reopen, original-payload
preservation and successful corrected retry; valid final recovery remains covered.
Type check and all 535 deterministic tests passed on Node 22.23.3; no live calls.

SQLite **3 → 3**; additive, separately versioned format-1 `context.epicReview` and
`epicReviewReport` job envelopes. Existing retrieval checkpoint format **1 → 1** is reused
for at most one exact-load stage, three cumulative attempts and a validated final response;
legacy continuation receipts/allowances are not accepted for epic review. No startup
rewrite, migration sweep, inference, data reset or implementation-assessment invalidation.
Old projects/jobs, evidence IDs, completed checks, history and workspace outputs are not
rewritten. Old per-record/lens checks are not equivalent to combined package reviews and
remain available under the old action; no old check is silently promoted or discarded.

New identities bind package kind, epic membership and exact current evidence/guardrails.
Changed grouping or genuinely changed evidence creates new review work with old evidence
retained. Unrelated revision increments alone do not invalidate compatible packages.
Saved additionally loaded records receive independent exact-freshness checks, including
outside the base package. Failed-attempt reuse can reconstruct its original revision to
avoid either stale facts or an allowance reset. New planning reads only epic-review job
history rather than parsing large legacy navigation outputs.

Checkpoint writes remain leased and expected-revision checked. Completed loads are replayed
locally, not through the model; final responses are validated and saved before atomic
publication. A publication interruption can reuse a compatible final without inference.
No-call idle reports never advance the specification. Future/malformed new envelopes reject
reads without overwriting saved payloads; old missing envelopes retain legacy semantics.
Forward compatibility does not authorize downgrading an app to a version unaware of these
new review semantics.

Upgrade tests use an on-disk older project/job set, verify unchanged old jobs, saved-load/final
preservation, repeated reopen and publication-failure recovery without repeated calls, and
reject a future review format. See [epic workflow review](epic-workflow-review.md) for checks
actually run and remaining live semantic/performance qualification. No user database or
live provider was used.

Verification: Windows Node 22.23.3 typecheck, 533 deterministic tests, latest 21 epic
tests (including cross-revision publication recovery), all browser suites, UI build,
both CLI help commands and whitespace/link checks passed. Browser failures and their
corrections are retained in the linked verification record. No live model qualification
is claimed.

## Review update warning instead of acknowledgement

Presentation/workflow only; persisted formats, fingerprints and decision-context rules
are unchanged. New Review decisions use the currently displayed revision rather than
the unsent draft's initial comparison revision. The original draft/note is kept for
comparison, with an update warning above the decision buttons. Existing submissions,
conflicts and saved evidence are not rewritten or automatically retried. No startup
migration, reassessment or model call is required; submission-time stale checks remain.

## Exhausted gap-task scheduling and blocker reporting

SQLite **3 → 3**, gap report **1 → 1** with optional `requestBlocked` and bounded
`exhaustedTasks` fields. No schema conversion, startup sweep, evidence-key change,
allowance reset, inference replay or assessment invalidation. Existing saved projects,
jobs, checkpoint/final responses and historical reports remain byte-for-byte unchanged on
reopen. New reports include request-limit blockers within the existing `blocked` total,
not `checked`; `requestBlocked` is a subgroup and its list is capped at 20. Old reports
without these fields retain their original meaning and counts.

The read-only backlog projection now recognizes failed/cancelled/interrupted/stale gap
jobs with a valid one-time continuation receipt, six spent attempts and no saved final
response. For the same target/lens/current evidence key and model/connection, the task is
blocked rather than pending. A later compatible completed check wins; valid saved final
responses remain available for publication recovery. Three-attempt tasks retain explicit
continuation eligibility. Unknown/malformed allowance and receipt formats reject reads
without overwriting saved payloads; diagnostics alone never establish exhaustion.

Storage reads only allowance/model metadata, not growing navigation bodies or saved
output, for scheduling. On the next explicit Explore/Resume action, another pending task
may run under its own allowance; the exhausted task receives no calls or new grant. If
only blocked/waiting work remains, the no-call report creates no specification revision.
Unrelated revision/summary changes do not reset the blocker. A genuinely changed
evidence/scope key or different model/connection is distinct work, with original attempts
and evidence retained. No user must reset data or edit decisions just to upgrade.

Upgrade tests cover legacy six-attempt payloads and repeated reopening without rewriting
them, parity between full-job and compact scheduling metadata, blocked-not-checked counts,
next-task routing, no-call all-blocked scopes, saved-final exclusion, model/evidence changes
and rejection of future allowance/receipt formats. Browser checks exercise the matching
request-limit label and target/lens list, next-task routing, retained history, reload and
mobile layout. No live provider calls or user-data edits are required for these checks.
Verification on Node 22.23.3: typecheck, all 511 deterministic tests, standard browser
checks, the navigation browser check and whitespace checks passed. A read-only plan of
Rust Grind Galaxy revision 1694 reported one request-limit blocker and selected another
check; it did not infer or write project data. Existing large-bundle warnings remain
non-blocking. Older builds with strict report readers do not support the new optional
blocker fields; reopen newly saved reports with the updated app rather than downgrading.

## Explicit navigation for saved IDs in quoted explanations

SQLite **3 → 3**, retrieval envelope **1 → 1**, evidence-basis compatibility
**gap-stage-evidence-v1 → gap-stage-evidence-v1**. There is no startup conversion, data
reset, model replay, specification revision or allowance reset. Before a new gap request,
an optional `quotedRecordNavigation` index promotes at most 32 exact whole IDs in quoted
context text into explicit handles, restricted to existing omitted saved records and spare
context space. It never adds detailed evidence, authorizes citations, resolves human intent
or follows a path/URL. Freeform strings alone remain invalid retrieval handles.

This index is navigation-only, like search results and ordinary record indexes, and is
excluded from the existing evidence-basis calculation. Exact quoted text and all detailed
records remain in that calculation. Older compatible stage/final receipts retain their
original keys/revisions/sessions and reuse checks; original wire-hash verification for
legacy receipts without a basis is unchanged. No saved receipts are rewritten on startup.
Failure diagnostics now distinguish canonical handles that were already loaded, not
offered or duplicated, and unavailable request items without echoing unknown model text.
Future envelope rejection and existing context/attempt bounds remain unchanged.

Tests cover exact and substring references, unknown IDs, the 32-handle/spare-space limits,
unchanged evidence identity, unseen-citation rejection and exact loading through the real
service. A read-only reconstruction of Rust Grind Galaxy's failed request at revision 1694
accepted its seven requested IDs after two quoted handles were offered: 55,020 / 96,000
characters, with unchanged evidence identity. This was validation only, not a new model
call or completed discovery; its six spent attempts remain six and the task remains
incomplete. Original project data and job/session evidence were not modified.
Verification on Node 22.23.3: typecheck, all 508 deterministic tests, the navigation
browser check and diff whitespace checks passed. Live discovery was not retried.

## Explicit one-time gap continuation allowance

SQLite **3 → 3**; retrieval envelope **1 → 1** with an optional strict
`continuation: {format: 1, sourceJobID, fromStage}` receipt. Existing jobs remain byte-for-byte
unchanged on reopen; no startup inference, schema conversion, assessment invalidation or
workspace rewrite is needed. Legacy jobs without a receipt retain the three-attempt,
two-navigation-stage limits. Only the explicit revision-checked continuation action grants
up to three more attempts once, raising lifetime maxima to six attempts/five stages. Gap
report `modelCalls` accepts up to six; it is a diagnostic count, not evidence of readiness.

New jobs copy compatible checkpointed work and retain original evidence bases, revisions,
sessions and cumulative attempts. The receipt records the exhausted source job and first
unfinished stage. Extended prompt limits start there; replayed older stages keep their
original input identity. Original source jobs, human input and specification histories are
not rewritten. A pre-upgrade failed final navigation request that was never checkpointed
is not invented from a diagnostic; continuation may need a new request for that unfinished
step. Original final responses still use the existing publication-reuse path, not a grant.

The owned-worker lease excludes concurrent discovery. The receipt is checkpointed before
any newly allowed inference; failure/cancellation and reopening retain both grant and spent
attempts. A durable task-identity lookup rejects a second grant even after a successful
continuation. Stale revisions, changed task evidence, different models/connections,
cross-project IDs and obsolete attempts reject rather than reset work. Unknown receipt
formats and extended counts without a receipt reject without replacing saved bytes.
Older app versions do not support newly granted extended envelopes; use the updated app
to reopen them rather than downgrading. No destructive migration needs a separate backup.

Upgrade tests cover legacy exhausted jobs, repeated reopen, original payload preservation,
compatible stage reuse, explicit grant, failure/retry accounting and six-call exhaustion.
API/browser checks cover authentication, origin/revision/ownership/active-worker checks,
confirmation/cancel, saved receipt visibility, reload and mobile layout. Live provider
continuation remains unqualified; no user database was modified during development.
Verification on Node 22.23.3: typecheck, all 505 deterministic tests, standard browser
checks and the extended navigation browser check passed. UI builds retain the existing
non-blocking large-chunk warning. Diff whitespace checks passed.

The continuation action is also rendered next to the diagnostic inside Processing &
queue. This UI-only recovery placement changes no persisted formats, identities or grant
rules. Ordinary Resume is hidden there for exhausted-only work; queued/saved responses
keep their separate Resume control. The navigation browser check exercises granting
from inside the modal rather than reaching a control behind it.

## Gap retrieval shared-file scope correction

SQLite **3 → 3**; no schema/payload conversion, fingerprint-version change, startup
replay, or assessment invalidation. A gap lookup now loads an explicitly requested
workspace source without using that source as a submission trigger for every requirement
citing the same file. Exact task requirements, prior-stage evidence and human guardrails
retain their existing inclusion rules. Queued submission follow-up is unchanged.

Previously failed expansions retain their original manifests and diagnostics. Explicit
retry rebuilds from the original target and checkpointed stage evidence, not the failed
expansion's diagnostic included-ID list. Compatible navigation stages retain their
original IDs, revisions, sessions and cumulative attempts; unrelated completed work is
not replayed. Existing evidence-basis checks still reject genuinely changed evidence.
No destructive conversion or separate backup is needed; future-format rejection remains
unchanged. Tests cover shared-file isolation, explicit requirement loading, human
guardrails, unchanged submissions, repeated SQLite reopening and saved-stage recovery
without replaying navigation. A read-only reconstruction of Rust Grind Galaxy revision
1693 reduced its failing expansion from 102,595 to 51,582 characters, retaining all
previous-stage evidence and the requested file; no live inference or user-data write
was performed.

## Requirement-level attention cleanup

SQLite **3 → 3**. No payload conversion, startup sweep, revision/fingerprint change,
assessment invalidation or model replay. A read-only forward compatibility projection
now recognizes later applied approval/rejection submissions with matching retained
confirmation/rejection source provenance as replacements for earlier unapplied failed
decision conflicts, including opposite choices and nonempty notes. A valid saved review
fingerprint and durable ordering/timestamps remain required. Missing provenance is not
manufactured. Original bytes, notes and diagnostics remain intact; old notes are not
applied or treated as change requests. Change requests and pending overlap work stay
actionable. The later submission's own processing is never hidden.

Resolution describes historical failed attempts, not current requirement approval. It
does not revert when wording/status/feature archival or source supersession changes
later. Those changes retain their existing current-review safety checks and can require
a new decision, without resurrecting old failed submissions. Older databases benefit
on read/reopen; no user-data reset or repeated inference is necessary.

Explicit requirement-level dismissal uses existing `superseded` + `archivedAt` fields.
Dismissal and Undo each validate the expected project revision, exact bounded batch,
project/requirement ownership and eligibility in one immediate transaction. A changed
member rejects the whole batch. Undo checks each original archive timestamp and never
restores applied decisions, queued work or pending overlap processing. Original input,
IDs, diagnostic and submitted timestamp are unchanged. Retrying dismissal/Undo after a
lost response or reopening is idempotent; UI Undo is available until dialog close.
Queue pause/leases are unchanged; restoring an attempt does not automatically retry it.
No destructive conversion needs a separate backup. Existing future-envelope rejection
continues unchanged.

Upgrade coverage includes saved opposite decisions with exact notes across repeated
SQLite reopen and no startup inference/payload rewrite, transactional batch rejection,
repeated dismissal/Undo, timestamp mismatch, real pending-input protection and
authenticated bounded API requests. See [browser verification](browser-workspace.md#find-and-resolve-processing-problems)
for executed checks and the remaining non-blocking UI bundle warning.

## Focused issue recovery and attempt archiving

SQLite **3 → 3**; no startup sweep, revision/fingerprint change, inference replay,
assessment invalidation or workspace-artifact migration. Grouping and current-blocker
display are read-only projections over existing submissions, including legacy attempts.
The original completed-review reconciliation was subsequently broadened by
[requirement-level attention cleanup](#requirement-level-attention-cleanup).

Explicit archiving transitions a `needs-attention`, unapplied conflicting review to the
existing `superseded` state, adding only optional ISO `archivedAt` metadata. Older rows
without this field retain their meaning. Original IDs, human input, notes, timestamps,
decision basis and diagnostic remain unchanged; project sources, revisions and saved
activity evidence are not rewritten. The original row retains its evidence, so no
destructive transformation or separate backup is needed. Old activity entries continue
to describe their historical failure and can open the current item/history.

The expected-project-revision check, eligibility check and update run in one immediate
SQLite transaction. Repeating an archive request after a lost response/reopen returns
the original archived row/timestamp. Stale requests, cross-project IDs, applied reviews,
nonconflicting failures and pending overlap follow-up reject without changing records.
Conflicting unapplied attempts are not worker-owned processing tasks; archiving them
does not release leases, alter queue pauses, clear linked questions, or authorize retry.
Existing stored-envelope validation continues to reject unsupported future formats.

Upgrade tests use saved attempts without `archivedAt`, preserve exact original fields,
check rejected writes, repeated startup/idempotent retry and retain genuine pending-input
blockers. API tests cover token/origin checks, strict bounds and cross-project isolation.

## Narrower decision blockers and scoped answer evidence

SQLite **3 → 3**; no startup payload sweep, revision rewrite, data reset or inference
replay. New queued answers optionally retain server-captured `answerScope` **format 1**
(`questionID`, unique `requirementIDs`, at most eight). Applying them saves the same
scope on the original answer/delegation/deferral source in the same transaction.
Source kind, question ownership and scope must agree. Client submission bodies cannot
provide this internal metadata. Old submissions/sources without it remain conservative;
missing applied-source provenance does not qualify as scoped. New corrections to older
broad sources are not silently narrowed. Requirement IDs and exact human text are intact.

New review/proposal evidence strings use `human-review-basis-v2`; new pair identities use
`resolution-evidence-v2`; individual check hashes use `refinement-task-v2:<sha256>`.
The decision-basis envelope remains **format 1**, separate from these key-policy versions
and project optimistic revisions. Requirement fingerprints, assessment/execution formats,
workspace layout and original completed results do not change. New bases additionally
capture linked-question feature/evidence routing. Genuinely relevant input still stales
the affected work; unrelated scoped input no longer does so merely by sharing a feature.

Forward compatibility is implemented through read-only adapters, not replacement keys:

- Version-1 review and pair keys retain their captured fields. Compatibility projection
  ignores only structurally independent targeted evidence using retained immutable source
  metadata; unscoped/unknown evidence, explicit supporting sources, shared relationships,
  dependencies, wider addenda and pinned trigger/correction lineage remain relevant.
  Missing historic fields are not invented. Original keys and diagnostics stay saved.
- Legacy individual SHA-256 checks are first verified against their original immutable
  `expectedRevision` snapshot, then compared using scoped identities. Unchanged legacy
  hashes also remain usable directly. Unknown hash policies/missing unverifiable evidence
  are never certified current. No completed paid call is automatically repeated on startup.
- Older jobs/proposals/submissions are not rewritten or automatically applied. A retained
  conflicted review still needs explicit resubmission even if a narrower blocker clears.
- Unsupported future answer-scope formats fail validation without overwriting payloads.
  Unknown key policies fail closed for reuse. Downgrading to builds unaware of scoped
  answer evidence/new keys is unsupported once new work has been saved.

Scope is checked again before queued answer application. Follow-up publication rejects
out-of-scope changes atomically; failures/cancellation retain the applied evidence for
explicit retry. Existing leases, expected revisions, shared/dependency guards and global
live-worker exclusion remain in force. This is not per-feature concurrent publication.

Verification (2026-10-21, Node 22.23.3): all **491 deterministic tests** and full
browser checks passed. Upgrade cases cover unchanged evidence across repeated reopening,
legacy review/proposal/pair/check reuse, genuinely shared evidence invalidation, changed
queued scope, missing applied-source proof, future formats without overwrite, and atomic
publication failures/cancellation with explicit retry. After the final scope-capture
optimization, type checking and all **31 decision-availability tests** passed again.
No live model calls were made; live scoped generation remains unqualified.

## Targeted requirement change requests

SQLite **3 → 3**; existing payloads have no conversion or startup rewrite. New review
submissions add the intent `action: "changes-requested"`, with required nonblank `note`,
the existing exact target snapshot and version-1 relevant-evidence basis. Applying this
input adds a source of existing kind `note`, with optional `changeRequest: true` and
`requirementID`; it does not create confirmation/rejection evidence or supersede a prior
approval. Human text, IDs, revisions and job/submission provenance remain intact.
Unapproved revisions use existing version-1 pending changes; approved replacements use
existing refinement records and explicit human approval. No new table/schema counter,
assessment format, workspace layout or fingerprint version is needed.

Old approval/rejection notes and existing generic notes are **not** inferred to be change
requests. For records without the new marker, decision-basis contents, freshness and
completed work remain unchanged. New requested feedback is genuinely new human evidence
and can invalidate relevant review/proposal bases under the existing safety rules; that
is not an upgrade-triggered reset. Explicit request intent is distinguished in UI/history.

Queued application and result publication use existing transactional expected-revision,
evidence, pending-input and worker guards. Applying a request saves feedback atomically
without deciding the requirement. Invalid/cancelled follow-up retains that applied source
for explicit retry, never automatically repeats inference on reopening, and cannot
partially approve/reject or publish unrelated edits. Restart recovery preserves older
queued reviews and new requests. Unsupported future review actions are rejected on
saved-submission read/write without rewriting their payloads. Downgrading to a build
that predates change requests is unsupported once this new intent has been saved.

Compatibility verification (2026-10-21): all **479 deterministic tests** passed on
Node 22.23.3. The change-request suite covers old decision/evidence preservation,
repeated SQLite reopen with unchanged saved requests and no startup inference,
interrupted/cancelled follow-up and explicit retry without duplicate note sources,
live-snapshot queue ownership, stale reviewed evidence, malformed/out-of-target result
rollback, and unsupported future-action payload preservation. The existing legacy-review,
assessment and transactional migration suites also passed. No data repair/reset or
live model calls were performed; live generation for the new intent remains unqualified.

## Inline Review clarifications and readiness

SQLite **3 → 3**, project/submission JSON, workspace artifacts, schema versions,
decision-context/fingerprint semantics, saved assessments and completed work are unchanged.
Readiness counts, inline answer editors and previous-displayed-requirement comparisons
are presentation/routing changes only. Comparisons and unsent drafts are transient React
state, not new persisted evidence. Inline answers use the existing durable submission
format and validation; processing retains the existing queue/lease/revision safeguards.
Old saved answers and reviews remain readable without reset, migration, startup rewrite
or model replay. Original diagnostics and human evidence are not rewritten. Explicit
acknowledgement/resubmission is still required when relevant information changes.
Compatibility verification (2026-10-21): all **466 deterministic tests** passed on
Node 22.23.3, including an exact version-1 decision-basis assertion, saved-review
reopening/legacy provenance checks and the existing transactional migration suite.
No upgrade transformation is needed; the evidence selector is shared with display
without changing the basis contents or format.

## Item-local processing recovery

Item-local processing-error/recovery presentation also leaves persisted formats,
versions, fingerprints and decision gates unchanged. Existing saved failed reviews
and answers are read directly; no migration, reset, replay or startup rewrite is
required. Original diagnostics/history remain saved. Recovery and follow-up retries
require explicit user actions and never manufacture clarification answers.

## Design and Review typing isolation

Only transient React draft storage/rendering changes. Source and target SQLite,
JSON, workspace artifacts, saved submissions, fingerprint/context-key rules and
schema versions are unchanged. No migration, startup rewrite, data reset or model
replay is needed. Review submission still records the original draft's review
basis and requires explicit confirmation when its requirement/context changes.

## Requirement rejection with unresolved clarifications

Ordinary rejection now bypasses only the unanswered/deferred/delegated clarification
gate; approval and pending-input/evidence/worker checks are unchanged. SQLite **3 → 3**,
project/submission JSON and workspace formats, decision-basis keys, assessment semantics
and fingerprints are unchanged. No migration, reset, rewrite or model replay is needed.
Existing blocked rejections retain their exact note, decision, provenance and diagnostic;
read-only recovery offers a new explicit review, never automatic application. Questions
are not answered or retired merely by rejecting. Original histories and completed work
remain intact; no partially applied upgrade exists to recover.
Review follow-up now prioritizes explicitly linked questions within the same four-candidate
and context-budget limits. This changes new-call navigation only, not saved evidence,
freshness keys or completed-check reuse. Upgrade coverage reopens an older blocked
rejection twice with exact project/submission/job preservation, then explicitly resubmits
without rewriting the original attempt or replaying a model call.
Verification: all **460** deterministic tests passed on Node 22.23.3, including
direct/queued rejection, approval guards, replacement follow-up and reopen recovery.
UI build passed with the existing chunk-size warning. The browser suite stopped at
`src/web/browser-check.ts`'s queue-status assertion: expected **Saved gap checks reused**,
received **Ready when you are**; full browser verification remains incomplete. No live
model calls or user-data repair were performed.

## Discovery alias validation

Discovery now preflights response-local aliases and collapses only identical new-epic
declarations. Saved SQLite/JSON/workspace formats, versions, fingerprints, completed-check
reuse and assessment semantics are unchanged. No forward transformation, reset, startup
rewrite or automatic model replay is required. Existing IDs, human evidence, histories
and saved submissions remain intact. A failed round requires explicit resume; ambiguous
references are rejected rather than guessed or silently renamed. Existing scan-checkpoint
normalization remains unchanged. Type check and all 453 deterministic tests passed on
Node 22, including scan-checkpoint legacy reuse and corrected-response retry.

## Project progress presentation

Separate answer/local-code summaries and explicit missing/outdated definition labels
are derived at read time from existing project/execution records. Source/target
SQLite, JSON and workspace formats, versions, fingerprints, assessment freshness
and the overall calculation are unchanged. No migration, reset, rewrite or model
replay is needed; saved evidence and completed work remain intact across restart.
Deterministic progress checks cover old/missing assessments, answer states, scope
exclusions and read-only derivation. No new persisted format needs an upgrade fixture.
Verification: Node 22 type check, all 451 deterministic tests, UI build and full
Playwright browser checks passed, including local/main separation and mobile layout.

## Refinement run progress

Refinement stage/count/status telemetry is an additive browser snapshot section and
in-memory queue state only. SQLite, project JSON, workspace artifacts, schema versions,
fingerprints and saved-check reuse are unchanged. No forward transformation or model
replay is required; original decisions, histories and completed checks remain intact.
Server restart discards telemetry, not saved work, and does not resume inference.
Deterministic tests cover completed-check reuse and partial failure/stop/block counts;
there is no new persisted format requiring an upgrade fixture.
Verification: type check, all 296 deterministic tests (including existing upgrade/reopen
fixtures), UI build and Playwright browser checks passed.

## Workspace list paging

Design, Review and Implementation paging changes presentation only. Source and target
SQLite/JSON/workspace formats, schema versions, optimistic-concurrency counters,
assessment semantics and fingerprints are identical. Page size/position and retained
editing drafts remain in-memory UI state; this change writes no navigation fields to
project records or settings. Existing decisions, stable IDs, history, assessments and
delivery evidence remain untouched. No data migration, backup transformation, reset,
automatic model call or reassessment is needed. Restarting uses the normal saved state
and default navigation; no partially applied data upgrade exists to recover.

Verification: paging rendering checks preserve the entire input project/evidence and
only mount bounded rows. The full 291-test deterministic suite, including existing
SQLite reopening and forward-migration checks, passed. No new saved-data format exists
for a separate upgrade fixture.

## Version boundaries

- SQLite `PRAGMA user_version`: database schema, currently **3**.
- Execution payload `schemaVersion`: JSON representation, currently **1**. Missing
  means the shipped legacy format, **0**.
- Execution `version`: optimistic-concurrency counter, independent of schema version.
- Assessment `compatibility`: evidence/acceptance semantics, currently
  `assessment-evidence-v1`. Change it only when prior findings are semantically
  incompatible, or add an explicit reviewed compatibility migration.
- Decision identity `decisions-v1`: relevant saved requirement/decision inputs.
  Object keys are canonicalized; array order is preserved and path sets are sorted.
  Prompt instruction prose (`evidencePolicy`), the skill document and context-budget
  policy are excluded. Required decisions and acceptance scenarios remain included.
  Changes to the input projection itself still need a compatibility review/migration.

Skills and context policies remain recorded as original provenance and govern new
requests. A compatible assessment is not invalidated solely by those labels changing.
Its actual model, requirement, relevant decisions and latest captured code must still
match. Delivery decision identity is independent of assessment workflow prose.

## Implemented migration ledger

### Default-off browser retrieval pilot (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, saved-search result **1 → 1**,
execution **1 → 1**, workspace **2 → 2**. Adds optional retrieval-work `requestedPolicy`
(`prefix` / `prefix-aux-v1`) and an authenticated manual analyze request field. Project
records, workspace artifacts, schema versions, assessments/check identities and budgets
are unchanged. UI opt-in is in-memory/tab-local, default off, reset on reload/project change;
no persisted preference or local-storage migration. Queued submissions/Refine/scans/terminal
do not inherit it. Explicit manual default requests may also store `requestedPolicy:"prefix"`.

No forward data transformation, startup rewrite, reassessment, reset or automatic model
call is needed. Older jobs keep absent request provenance absent; new requests do not copy
that field from prior jobs. Original saved stages retain their exact policies/receipts and
attempt counts across switching back; no rerunning searches to replace misses. Legacy
receipts and compatible checks/approvals/history/implementation assessments remain valid.
The optional request marker is independent of the original saved-stage policy and of
optimistic revision counters. Downgrading to older binaries lacking the additive fields
is not qualified; unsupported future selections reject reads without overwriting payloads.

Tests use disposable stores, preserve old missing-field payloads through repeated reopen,
resume legacy misses without replay under explicit pilot selection, and repeatedly reject
future request-policy values while preserving raw jobs/projects. API/browser checks exercise
opt-in, switch-back reuse and exact-loading boundaries. Independent relevance review remains
pending; [review packet](retrieval-pilot-review.md) is not a completed sign-off. See
[pilot scope and verification](retrieval-browser-pilot.md).
Verification: type checking and all **450** deterministic tests passed on portable Node
22.23.3. The focused pilot browser/UI build also passed without retries. Original saved
input, approvals, legacy receipts and current assessment checks remain covered by the full
baseline/merge suites; independent human relevance review is still not completed.
Final UI production build and all five serial browser scenarios passed without retries,
including the default-off pilot. The existing bundle-size warning remains; live/provider
quality and independent relevance review are not established by these fixture checks.

### Prefix-preserving auxiliary merge evaluation (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, saved-search result **1 → 1**,
execution **1 → 1**, workspace **2 → 2**. New search results can carry an optional separately
versioned `policy: {format:1,id:"prefix-aux-v1",...bounded counts}` with explicit experimental
limitation text. This is an opt-in service dependency for evaluation; all browser/terminal
construction retains original prefix search. No user setting or automatic policy switch exists.
New candidate results offer no cursor; existing witnessed legacy cursors retain old snapshot
search semantics. Unknown policy versions and policy/page/limitation mismatches are rejected.

Existing payloads retain their exact representation: no migration, startup rewrite, reset,
reassessment or model replay. Original receipts (including no-page/no-basis legacy receipts)
are reused as issued; policy change does not invent better results or missing provenance.
Navigation does not establish citation authority; changed loaded/human evidence still blocks
final reuse. No gap/assessment identity or request/context budget changes. Existing completed
checks, approvals, history and current implementation assessments remain valid. No partial
upgrade exists to recover. Old binaries are not qualified for new experimental receipts;
new policy receipts are created only in disposable opt-in test databases, not user projects.

Recovery tests preserve raw older receipts across repeated reopening, adopt missing evidence
bases only from immutable verified inputs, reuse committed candidate search/final calls without
replay, reject relevant changed evidence, retain cumulative attempts, and repeatedly reject
future policy payloads without overwriting data. See [algorithm, results and verification](retrieval-merge.md).
Verification: type checking and all **446** deterministic tests passed on portable Node
22.23.3. The initial incorrect loaded-area recovery assumption and its corrected safety
test are recorded in the report, not represented as a passing run. Original baseline and
earlier comparison files remain unchanged; no user database was opened or upgraded.
UI production build, all four serial default-policy browser checks via `test:browser:all`,
both CLI help entry points and diff checking passed. No browser retries were used; the
existing bundle-size warning remains. Candidate UI rollout is still unverified and disabled.

### Bounded retrieval candidate evaluation (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, execution **1 → 1**, workspace
**2 → 2**. Adds only test-only retrieval policies, a second-domain catalog and comparative
measurements. No candidate is wired into production search, service, prompts or checkpoint
storage. The original baseline corpus/queries/tests are unchanged. No ranking, cursor,
search-receipt schema, compatibility/freshness identity or model/context budget changes
for saved projects; approvals, history, completed gap checks and implementation assessments
remain valid. No data transformation, startup rewrite, reassessment or replay is required;
there is no partial migration to recover. Disposable fixture stores are the only databases
opened by the evaluation.

Experimental results are not saved as production search receipts and invent no cursor or
model-call provenance. Tests exercise production exact loading and citation checks locally;
the unchanged baseline retains end-to-end service/checkpoint and upgrade checks. Promoting
a candidate later requires separate versioned search/cursor compatibility and recovery tests.
See [candidate measurements, regressions and limits](retrieval-evaluation.md).
Verification: type checking and all **434** deterministic tests passed on portable Node
22.23.3, including the original baseline and existing migration/reopen tests. Production
search/service and the original baseline corpus/test files have no diff.
UI build, all four serial browser checks via `test:browser:all`, both CLI help entry points
and diff checking also passed. No browser retries; the existing bundle-size warning remains.

### Deterministic first-query retrieval baseline (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, execution **1 → 1**, workspace
**2 → 2**. This adds test-only synthetic catalogs, measurement/assertions and an npm test
entry point; no production planner, search, ranking, prompt, budget, payload, schema,
assessment semantics or freshness identity changes. No forward conversion, backup rewrite,
reset, reassessment or automatic model replay is required. Existing approvals, exact human
constraints, history, stable IDs, completed checks and implementation assessments remain valid.
There is no partially applied production migration to recover. Test imports only touch their
own newly created disposable SQLite databases; no user database is opened or upgraded.

Large-catalog checks preserve original revisions/jobs and a current fingerprinted implementation
assessment, reuse a committed search after reopen and an unrelated revision, and retain
attempt limits/navigation citation rejection across repeated reopening. Existing upgrade
tests continue covering older formats and recovery; no new persisted representation requires
a separate upgrade transform. See [baseline design, measured misses and verification](retrieval-baseline.md).
Verification: type checking and all **431** deterministic tests passed, including existing
forward-migration/legacy-reopen cases. Initial ABI and fixture-assertion failures are retained
in the baseline verification record; they are not represented as passing retrieval runs.
UI build and the full serial `test:browser:all` command passed without retries on this change;
the existing bundle-size warning remains. Both CLI help entry points and diff checking passed.

### Browser startup readiness and verification isolation (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, execution **1 → 1**, workspace
**2 → 2**. This changes browser readiness presentation and fixture verification only.
The new project-list-loaded flag is in-memory component state; no database tables,
project/job JSON, local-storage keys, workspace artifacts, provenance, freshness rules,
gap checks or assessment fingerprints change. Existing IDs, history, human approvals,
completed calls and implementation assessments remain valid. No forward data conversion,
startup rewrite, reassessment or model replay is required. Refresh simply rebuilds the
readiness flag; interruption cannot leave a partially migrated payload.

Before this fix a slow/failed sidebar-list request could hide the Design tab even after
the selected project's authenticated snapshot had loaded. The empty initial array no
longer establishes that there are no saved projects. A successful known-empty list and
absence of a selected project establish the welcome state; an explicit New project action
still works. Snapshot/current-revision/permission checks are untouched. Controlled browser
response ordering reproduced the old failure and verifies snapshot-first/list-first,
overtaking polls, stale selection responses, failed lists, cold loads and confirmed emptiness
without inference or mutations to original saved snapshots. The earlier uninstrumented
navigation timeout's exact historical cause remains unknown.

Tooltip test setup now establishes an actual pointer leave/enter after Escape and taps
the current locator instead of cached coordinates. A trial hover retains visibility,
stability and hit-target checking before an intentionally aria-disabled explanation is
tapped; its disabled-state, visible explanation and zero-execution assertions remain.
Focused browser coverage reproduces no-enter-after-Escape, a deterministic layout shift,
blur-timer cancellation and keyboard/touch dismissal. No production tooltip behavior,
permissions or guard logic changes; no test-level retry or timeout increase masks failures.
`test:browser:all` builds once before running the four browser scenarios in sequence;
failure diagnostics are bounded and redact messages, URLs and sensitive HTTP material.

Node **22.23.3 win-x64** verification uses the official portable archive (published
SHA-256 `2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71`), an isolated
repository snapshot and a clean `npm ci` with independent Node-22-native dependencies.
The checkout's Node installation, dependencies and user project database are untouched.
Electron binary download was skipped; desktop packaging and exact Node 22.12.0 are not
qualified by this check. Type checking, all **417 deterministic tests**, and terminal/spike
`--help` passed. The initial Node 22 full browser run failed at the touch-tooltip assertion;
an intermediate locator-tap revision failed its intended enabled check. These failures are
retained as verification history, not relabeled as passing.

Final verification passed on Node 22.23.3: type check, all **417 deterministic tests**,
UI production build, and `test:browser:all` (controlled reliability, full workspace,
focused exact retrieval and saved navigation), plus terminal/spike `--help`. The focused
reliability check also passed under the checkout's unchanged Node 20.11 installation.
The serial browser command succeeded after the targeted test changes; earlier failed runs
remain recorded above. This qualifies the tested version/workflows, not every timing
interleaving, exact minimum Node version or live-provider behavior.
The existing bundle-size warning and eight moderate clean-install audit findings remain;
dependencies were not changed. No live model calls, user-database writes, repository
commits or pushes were performed. First-query retrieval quality and live-provider
qualification remain separate follow-on work; this does not change discovery budgets
or establish specification completeness.

### Snapshot-bound saved-search continuations (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, saved-search result **1 → 1**
with optional `page` **format 1**, execution **1 → 1**, workspace **2 → 2**. Search
requests optionally accept a witnessed opaque `cursor`. No DDL, startup conversion,
project mutation, data reset, assessment invalidation, approval replay or automatic model
call is required. Original IDs, human evidence, history, approvals, completed gap checks,
implementation assessments and delivered evidence are unchanged. Older nonpaged receipts
remain valid and byte-preserved; retries do not invent cursors, change original results or
repeat completed calls merely because paging became available. Old versions cannot read
new paging fields; do not downgrade an active worker.

New optional page receipts bind project, immutable source revision, task/loaded-record
scope key, literal query, result limit and scan position. They record the input cursor,
record/text offsets, deferred-text flag and optional next position/cursor. Positions are
not model-controlled offsets: a continuation must match a previously saved stage's offered
cursor, query, limit and scope, and its position hash must verify. A continuation reads
the original revision in its original saved record order, not today's changed navigation.
Missing original snapshots, unknown/stale cursors, incompatible scope or malformed/future
page envelopes reject without replacing saved receipts or silently starting a fresh search.
Fresh queries without cursors remain available against the current snapshot.

Search remains advisory navigation and stays excluded from `gap-stage-evidence-v1`.
Original page receipts and hashes are retained on compatible retries; exact loading uses
current saved evidence and changed authoritative content still blocks later call reuse.
No legacy evidence-basis or gap-check fingerprint changes. Missing legacy bases continue
to require original wire-hash verification; optional page metadata is not synthesized
during adoption. Existing revision/lease/cancellation/permission safeguards remain in force.

Each page has the existing eight-result, 5,000-record and 1,000,000-text-character limits.
Continuation first advances past omitted matches/unexamined records, then to later
4,096-character text windows (at most sixteen local windows). Previously offered handles
are skipped. Deferred earlier text remains eligible after result pagination; at the total
character boundary, whole windows are deferred rather than losing a partially scanned
tail. This can examine slightly fewer records in a new first page than the older prefix-
only planner, without rewriting its original results. Matching across window boundaries
is not guaranteed. Omission counts and explicit local bounds remain visible; absent next
cursors do not certify exhaustive search or specification completeness.

Search/refinement/paging/loading **share the unchanged two-navigation-stage and three-
attempt budget**, including failures and retries across revisions. No-call startup/reload
and compatible completed-call reuse remain intact. Search → page → load cannot also
analyze under this cap; it blocks without publishing proposals or consuming a gap check.
Paging does not allow navigation-only handles to authorize citations, decisions or changes.

Added deterministic coverage includes stable original-snapshot ordering across reordered
navigation, refined queries, result/record-cap/text-cap/suffix continuations, whole-window
boundary preservation, earlier deferred suffixes, local text-window exhaustion, unknown/
stale/query/limit/scope/position failures, unavailable snapshots, disk reopening/no-call
startup, cross-revision paging, cumulative budget exhaustion, and legacy nonpaged receipts
with and without evidence bases. Malformed/future page envelopes reject reads without
replacing payloads. Cancelled, stale and expired-lease workers cannot checkpoint returned
continuations. Existing authoritative-evidence-change and approval/assessment/history
regressions continue to pass. The expanded in-memory browser scenario checks continuation
availability/positions, original snapshot provenance, explicit retry, exact human
constraints, shared-budget blockers, reload, original history and mobile width.

Verification: type check, all **417 deterministic tests**, UI build, focused exact-retrieval
browser check and full browser suite passed. The expanded navigation browser check first
timed out waiting for Design after reload; failure diagnostics were added and an independent
rerun passed. This reload timing issue is not claimed fixed. The separate known full-suite
tooltip flake did not reproduce and was not modified; the large-JavaScript-chunk warning
remains. Available Node is **20.11**; Node 22.12+ verification remains outstanding. No live
model calls, user-project database writes, repository commits or pushes were performed.
Live semantic quality/entailment and adversarial live permission qualification remain open.

### Bounded saved-evidence navigation queries (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, execution **1 → 1**,
workspace **2 → 2**. This is an additive response/checkpoint extension, not a change to
project evidence, gap-check semantics or assessment freshness. No DDL, startup rewrite,
backfill, data reset, approval replay or reassessment is required. Original sources,
stable IDs, revisions, approvals, completed gap checks and implementation assessments
retain their identities. Existing pre-search completed stages/finals remain reusable;
the old context wire representation is unchanged when no search has occurred.

Navigation stage `request` now accepts either the existing strict `retrieveEvidence`
envelope or strict `searchEvidence: {format:1,query,limit}`. A search stage requires its
original `searchResult` **format 1**, with matching query, bounded handles/labels, scanned
record count and explicit omitted-match/unexamined/prefix-limited counts. A load stage
cannot carry that search receipt. Unsupported future result formats, missing receipts,
mismatched queries and over-limit results reject reads without replacing saved payloads.
Older app versions cannot interpret new search stages; do not downgrade an active worker.

Search examines only omitted saved records available for exact loading: requirement
statements, question/source text and research findings, plus record/epic IDs. Queries
are bounded to 160 characters/twelve literal terms, returned handles to eight, text
prefixes to 4,096 characters, examined records to 5,000 and examined text to 1,000,000
characters. Counts describe those prefixes, not an exhaustive or semantic search.
There is no persisted external index, filesystem/network access or new permission.

The context's new `savedEvidenceSearch` field is explicitly advisory and is excluded
from `gap-stage-evidence-v1`, alongside existing navigation indexes. This preserves
the exact old basis for old contexts; it does not exclude any formerly authoritative
field. Search results do not enter `includedIDs`, citation allowlists or decision/change
authority. A returned handle must still exist and be loaded with exact evidence and its
mandatory human constraints before use. Old completed gap checks are not reopened solely
because search is now available; completion never promised exhaustive evidence review.

Search and exact loading share the existing two committed navigation stages, three
cumulative request attempts and 96,000-character hard context cap. Existing transactional
lease/revision checks reserve attempts before inference and save search receipts before
expansion. Failed or over-budget follow-up retains the receipt and does not reset budgets.
Explicit retry reuses the original search result without rerunning its query, even after
unrelated revisions or changed navigation labels. Original job/hash/session/revision
provenance stays intact; new exact loading reads current saved records. Changed loaded
authoritative evidence blocks reuse of later stages/finals; original results are retained,
not replayed or treated as current. Publication keeps all existing current-revision,
reference, approval, question-budget and live-lease checks. Startup never resumes inference.
Legacy missing-basis adoption still verifies immutable original contexts and wire hashes.

Deterministic tests cover undisplayed handles, search → exact load → analysis, navigation-
only citation/change rejection, literal matching, query/result/scan/text/context limits,
disk reopening, startup no-call recovery, committed-search interruption, final-publication
failure, compatible cross-revision reuse, original receipts under changed labels, changed
loaded evidence, cumulative retry exhaustion, cancellation, stale revisions, expired leases
and malformed/future receipts. Existing legacy adoption and assessment/approval/history
regressions remain passing. The new focused browser check uses an in-memory database and
verifies undisplayed-handle navigation, explicit retry, exact human constraints, shared
budgets, omissions/blockers, original history, reload without inference and mobile width.

Verification: `npm run check`, all **410 deterministic tests**, UI production build,
focused saved-navigation and retrieval browser checks, and the full `npm run test:browser`
suite passed. The known full-suite tooltip timing flake was not reproduced or fixed;
the large-JavaScript-chunk warning remains. Checks used available Node **20.11**, not the
recommended 22.12+ baseline. No live model calls, user project database writes, repository
commits or pushes were performed by this task. Live-provider search quality, semantic
entailment and adversarial live permission behavior remain unqualified. Prefix/order
bounds can miss relevant records; budget exhaustion requires meaningful scope/evidence
changes, not repeated clicks. Structural validation cannot prove model prose ignored
all advisory labels; it prevents those handles from authorizing citations or changes.

### Evidence-equivalent cross-revision retrieval retry (2026-10-20)

Source/target SQLite **3 → 3**, retrieval work **1 → 1**, execution **1 → 1**,
workspace **2 → 2**. This adds optional independently versioned evidence-basis/reuse
envelopes, without rewriting projects, original jobs, human sources, approvals, history,
completed gap checks, assessment fingerprints, delivery evidence or workspace artifacts.
No DDL, reset, startup backfill, backup conversion or automatic model replay is required.

New navigation/final checkpoints retain the existing exact `contextKey` and add optional
`evidenceBasis: { format: 1, compatibility: "gap-stage-evidence-v1", key }`. Final responses
also record their actual input `revision`. The basis expands app-owned lossless text,
identifier and record-table encodings and canonicalizes object keys. It excludes only
root revision, explicitly advisory previous interpretation, record index, related hints,
navigation epic map and submission-scope omitted-record count. All remaining displayed
fields, exact human constraints, included record IDs, task identity/lens and selected
epic scope remain binding. Relevant dependencies/rescans are also bound by the unchanged
gap task identity. Navigation never becomes citation authority.

Explicit retry selects the latest saved failed/cancelled/interrupted/stale checkpoint
matching project, scope, task evidence key/lens, provider/model/account and research
permission at or before today's revision. No recent-project cutoff can hide an older
matching checkpoint. Each saved stage/final must match the new exact authoritative basis
before reuse; unrelated revision/navigation churn does not cause replay. Previously
validated navigation handles remain witnessed if later unrelated additions displace their
index entries. Records must still exist and be loaded before they can authorize citations.

Legacy work without bases is upgraded lazily **in the new retry job only**: reconstruct
the identified task and completed stages from the original immutable project revision,
verify every legacy exact wire hash and request, then derive the equivalent basis. The
verified original snapshot also establishes a missing legacy final-input revision; no
unknown dates, sessions or model provenance are fabricated. Unverifiable original contexts
block explicitly without overwriting evidence or replaying completed calls. Reopen performs
no inference or format rewrite; future basis/reuse formats reject reads without replacement.

New optional `retrievalWork.reuse` format **1** records source job/source revision, current
target revision, verified navigation-stage count and final-response reuse. Stage revisions,
wire hashes, session IDs, original output and original jobs remain intact, including mixed-
revision stage chains. The receipt describes checkpoint reuse, not a new model call at the
target revision. Cumulative attempts still enforce the same three-request bound. Source
revision in a reuse receipt names its immediate saved-job snapshot; the actual call's
revision remains on its stage/final record.

Receipts/checkpoints use existing immediate transactions with live-lease and current-job
expected-revision checks. A concurrent edit still stales the worker; explicit retry is
required even when the edit is unrelated. Saved final responses undergo current reference,
human authority, pending-question-budget and publication checks. Failure rolls back
publication and never consumes a gap check. Changed retrieved constraints retain previous
responses and block reuse rather than guessing or silently replaying them. Existing
approvals, implementation assessments and completed work retain their identities.

Deterministic upgrade/recovery checks cover repeated disk reopen with byte-preserved
legacy jobs, lazy adoption of navigation/final responses, unchanged original provenance,
unrelated revisions, displaced navigation hints, exact human-text preservation, lossless
representation equivalence, changed target/retrieved human constraints, model/account and
research isolation, unverifiable/future envelopes, current question quotas and an edit
during replay. The focused browser scenario now inserts unrelated revisions between
failure and retry and checks no-call replay, displayed provenance, reload and mobile width.
Verification: `npm run check`, all **402 deterministic tests**, UI production build,
`npm run test:browser:retrieval`, the full `npm run test:browser` suite and diff whitespace
checks passed. The focused browser scenario verifies cross-revision reuse provenance;
the full suite also retained its existing same-revision retrieval, approvals, history and
mobile checks. The previously observed tooltip timing flake was not reproduced on this
run and has not been fixed here. The existing large-JavaScript-chunk warning remains.
Checks used available Node **20.11**; Node 22.12+ and live-provider semantic/permission
qualification remain outstanding. No live model calls, user database writes, repository
commits or pushes were performed.

### Bounded multi-stage gap evidence retrieval (2026-10-20)

Historical same-revision policy; cross-revision retry above extends it without invalidating
its original checkpoints or completed work.

Source/target SQLite **3 → 3**, execution **1 → 1**, workspace **2 → 2**.
No project/source/submission/assessment transformation, DDL, startup backfill, backup
rewrite, approval replay or reassessment is required. Original IDs, human addenda,
history, completed gap checks, assessment fingerprints and delivered evidence remain
unchanged. `gap-evidence-v1` continues to identify bounded exploration opportunities,
not proof that all linked workspace motivation was reviewed. Old completed checks stay
compatible; uncompleted size-block receipts from `current-decisions-v1` are reconsidered
under `staged-evidence-v1`, because exact static motivation can now be requested later.
Old blocker receipts remain historical evidence, not rewritten completion claims.

Optional job `context.gapRetrieval` enables the new response alternative. Optional job
`retrievalWork` has its own **format 1**, separate from revision/CAS: research permission,
zero-to-three cumulative request attempts, zero-to-two committed navigation stages,
optional origin job, and optional final response. Each stage records immutable input
revision, exact context SHA-256, included IDs, strict request and optional runtime
session ID. Final responses retain their exact context hash and validated analysis;
normal publication independently validates references, approval authority and freshness.
`gapReport.modelCalls` now accepts 0–3; staged counts include attempts inherited from
explicit retries, not measured provider inference/token usage. Browser snapshots omit
saved final output while exposing stage/attempt progress.

Checkpoint writes are immediate transactions checking live running status, lease and
expected project revision. A failed write rolls back without discarding earlier stages.
Explicit retry creates a new attempt job and preserves the original; it reuses compatible
committed stages/final responses only against matching snapshot/model/research permission
and exact reconstructed input hashes. It never automatically repeats model calls on
startup or steals a live lease. Recovery selects the latest matching snapshot/task/lens/
permission checkpoint before loading its bounded payload, not a recent-project cutoff; no
cross-revision rebase or invented historical provenance occurs. Unsupported future
retrieval formats reject reads without replacing payloads. An uncheckpointed response
lost in a crash is not claimed as saved; another explicit attempt remains bounded.

Human constraints are retained in every stage; cumulative detailed evidence must fit
96,000 characters. Saved records only are retrievable, with eight requested displayed
IDs per stage. Retrieved facts are observations, never human preferences. Successful
publication alone consumes a gap check. Stage/request/context failures retain original
evidence and blockers, without changing approvals, coverage or implementation state.

Upgrade/recovery fixtures start from older saved projects/jobs without retrieval fields,
reopen twice, preserve exact snapshots/approvals and original failed jobs, and retry
without repeating a completed navigation request. Additional deterministic cases cover
oversized static closures, exact human addenda, unseen/duplicate/unknown/mixed requests,
unseen citations, stale/cancelled workers, cumulative evidence/request bounds, final
checkpoint publication failure, expired-lease/CAS rollback, permission changes,
over-budget expansion retry without replay, compacted navigation handles and future-format
refusal. Verification: type checking, all **391 deterministic tests**, UI production build
and the focused `npm run test:browser:retrieval` Playwright check passed. It covers stage
failure/explicit retry, reload without inference, exact record preservation and mobile
progress. The full browser suite passed twice including retrieval; its latest run stopped
at the existing unrelated tooltip timing assertion (`browser-check.ts`, implementation
settings), before reaching retrieval. That flake remains unresolved. The build retains its
large-JavaScript-chunk warning. Checks used available Node **20.11**, not the recommended
22.12+ baseline. No live model calls, user database writes, repository commits or pushes
were performed; semantic retrieval quality and live permission behavior remain unqualified.

### Current-decision projection and durable gap backlog (2026-10-20)

Source/target SQLite **3 → 3**, execution payload **1 → 1**, workspace **2 → 2**.
Project/submission JSON schemas, human evidence, revision counters, requirement and
assessment fingerprints, delivery evidence and workspace artifacts are unchanged.
There is no DDL migration or startup backfill. The deterministic backlog catalog is
derived from current project records; existing SQLite jobs are its durable ledger.
Additive optional job fields are independently versioned:

- `context.decisionProjection` format **1** lists omitted review IDs, retained exact
  note IDs and projected current generated receipts. It records a new request's view,
  not a transformation of saved sources. Unknown prose and older human addenda stay
  exact. Only explicit same-owner supersession and exact current decision/proposal
  matches allow historical omission or generated-receipt projection. Current approval
  facts preserve stable source/proposal IDs; omitted embedded history is not evidence.
- `context.gapExploration.check` format **1**, compatibility **gap-evidence-v1**,
  records the lens and relevant evidence hash independently of revision/UI metadata.
  Behavior, failure/recovery and acceptance checks are distinct tasks, not readiness
  or implementation assessments. Fingerprint changes retain earlier dated job evidence.
- `gapReport` format **1** stores input-scope counts, local blocker receipts and
  verified legacy-reuse receipts (each referencing the original completed job), plus
  zero/one adapter request attempts. It does not claim actual provider inference/token
  usage. No-call waiting/idle/blocked outcomes never manufacture completed model checks.

Forward compatibility is handled lazily on explicit exploration: an older bounded
`{ targetRecordID }` job can supply its behavior check only from its immutable input
snapshot, with equal evidence identity and a manifest containing today's required IDs.
The new report retains that original source-job ID; original payloads are untouched.
Broader unmarked jobs do not establish per-task completion. Equivalent representation
changes cannot force model replay. Genuinely changed relevant evidence creates a new
task identity while old outputs remain available. Conservative feature/dependency human
input changes and rescans can reopen checks; unrelated revisions/feature edits do not.
Existing implementation assessments and completed work are never invalidated by this
discovery policy. Initial interpretation remains broad; later general gap passes preserve
global interpretation/coverage rather than replacing them from a partial task.

Successful result publication and check completion share the existing SQLite transaction.
Malformed, failed, cancelled, expired or stale workers cannot consume a check. Planned
reports may remain as original attempt evidence after failure; they are not completion.
Saved blocker receipts prevent repeated over-budget preflight from starving later work
and are reconsidered on changed evidence/planner policy. Reopen performs no inference;
recovery requires explicit retry and preserves live leases. Job reads reject unsupported
future check/report/projection formats without rewriting them. No backup conversion,
data reset, approval replay or reassessment is required.

Upgrade checks seed older projects/jobs, preserve exact evidence and old job payloads,
reopen repeatedly, adopt a compatible legacy check using its original snapshot, and
exercise failures and future envelopes. A 1,000-requirement fixture keeps one request
bounded and preserves compatible checks when new proposals are added. Read-only planning
against Rust Grind Galaxy revision **1623** recognized **165** superseded snapshots and
**229** verified generated receipts across the saved project; the selected request was
**58,592 / 96,000 characters**, including exact retained human notes and selected feature
purposes, with **56** detailed
records. No user-database writes or live model calls were performed. Actual semantic gap
quality, adaptive multi-stage retrieval and larger real-world scaling remain unqualified.

Verification: type checking, all **383 deterministic tests**, UI production build and
Playwright browser checks passed, including three explicit gap lenses followed by
no-call reuse, evidence preservation, reload and mobile layout. One concurrent browser
attempt timed out in an existing tooltip check before the new scenario; isolated reruns
passed. The build retains its large-JavaScript-chunk warning. Checks used available Node
20.11; the development baseline remains Node 22.12+. No live model calls were made.

### Bounded next-gap exploration (2026-10-20)

Historical initial fallback, superseded by the task-sized/backlog policy above. Its
47,336-character observation preceded the stricter preservation of older human addenda.

Source/target SQLite **3 → 3**, execution payload **1 → 1**, workspace **2 → 2**.
New discovery jobs may add optional `context.gapExploration: { targetRecordID }`.
Existing job readers accept additive context metadata; absent means no recorded
bounded-gap selection, not missing work to backfill. The same original stable ID
also remains in `taskRecordIDs` and the exact included/omitted manifest. Successful
gap jobs alone influence future target rotation, not evidence freshness or reuse.

Project/submission JSON, schemas, optimistic revisions, requirement fingerprints,
assessment semantics, completed checks, delivery evidence and workspace artifacts
are unchanged. No forward rewrite, backup conversion, reset, reassessment, startup
inference or replay of completed work is necessary. Failed historical broad jobs
retain their original diagnostic and manifest; explicit retry plans fresh context.
Interrupted/failed/cancelled/stale attempts do not consume the target rotation.
There is no partially applied migration to recover. Existing transactional job
publication and expected-revision validation remain authoritative.

Upgrade tests seed legacy-shaped projects/jobs without the new marker, repeatedly
reopen SQLite and explore through the queue, preserving exact human evidence,
requirements, interpretation and old jobs while persisting successful rotation.
Read-only planning against Rust Grind Galaxy revision 1623 reduced the failing
562,745-character broad request to a 47,336-character task within 48,000; no user
data writes or live inference were needed. Live gap-question quality remains unverified.
Verification: type checking, all **370 deterministic tests** (including the new
bounded-exploration and legacy SQLite reopen checks), and whitespace checks passed.

### Resolved historical review attempts (2026-10-20)

Historical policy below; [requirement-level attention cleanup](#requirement-level-attention-cleanup)
subsequently broadened reconciliation to include notes/opposite decisions and prevent
old attempts returning after later edits. Original evidence remains unchanged.

Source/target SQLite **3 → 3**, execution payload **1 → 1**, workspace **2 → 2**;
project, submission and job JSON formats and all fingerprints are unchanged. This is
a computed workflow projection, not a persisted status migration. Original failed
attempts retain their IDs, status, input, timestamps, diagnostics and unapplied state;
later successful reviews retain their original source provenance. Browser review and
queue presentation classify equivalent superseded plain attempts as history. No
revisions, assessments, completed checks or delivery evidence are invalidated.

Classification requires a later completed/applied review with the same story/decision,
current exact requirement wording/scenarios/feature and a real non-superseded human
source. A failed attempt containing any nonblank note is never swept away. Current
status alone, older approvals, unfinished follow-up, changed records or unsupported
fingerprints cannot establish resolution. Later explicit approval of updated wording
can replace an older plain attempt without attributing approval to that failed attempt.

No database rewrite, backup transformation, schema bump, reset or model replay is
required. The projection is recomputed from saved evidence on polls/reload and queue
startup, so interruption has no partial upgrade to recover. Startup avoids creating a
pause solely for resolved attempts, but never clears saved pauses or resumes inference.
Existing raw submission APIs and historical activity remain truthful original records.

Verification: all 367 deterministic tests, type check, UI build and browser checks
passed. The legacy SQLite fixture reopens twice, verifies byte-for-byte submission
payload preservation, derived resolution and no startup inference/pause. Browser checks
verify live transition from three Submitted attempts to resolved history, queue counts,
navigation, reload and mobile width. No user-database writes or live model calls ran.

### Current decision-blocker recovery (2026-10-20)

Source/target SQLite **3 → 3**, execution payload **1 → 1**, workspace **2 → 2**;
project/submission/job JSON formats and evidence fingerprints are unchanged. Optional
blocking question IDs are computed in memory, not stored as new provenance. Existing
failed-review diagnostics remain byte-for-byte historical evidence; the UI recomputes
current availability rather than rewriting old warnings or applying saved decisions.
Restored review notes are UI drafts only until explicit resubmission. New failure
diagnostics distinguish existing rejection conditions without weakening those guards.

No forward transformation, backup rewrite, data reset, startup inference or replay of
completed checks is needed. Reload/reopen reads the same original records and repeats
only the read-only availability check; there is no partially applied migration to
recover. Legacy-shaped failed-review fixtures cover cleared and current blockers,
changed requirements, exact input preservation and no implicit application. Existing
SQLite upgrade/reopen, rollback and future-format tests remain applicable.
Verification: type check, all 350 deterministic tests (including upgrade/reopen tests),
UI build, browser recovery/navigation checks and whitespace checks passed. No live
model calls or writes to the user's database were performed.

### Completion-linked pending review reconciliation (2026-10-20)

Source/target SQLite **3 → 3**, execution payload **1 → 1**, workspace **2 → 2**.
Additive optional representations:

- Analysis/job results: `pendingChanges: { format: 1, changes: [...] }`, at most ten
  typed revise-question/revise-requirement/withdraw-requirement operations, each with
  current batch human source IDs and a bounded reason. Older successful jobs omit it
  and keep their original results. Unsupported future envelopes reject reads without
  rewriting original jobs; malformed live output is rejected before publication.
- Projects: optional `reviewUpdates: { format: 1, items: [...] }`, retaining the latest
  notice per stable record/type with outcome, job, response IDs and publication revision.
  Older notices remain in immutable revision snapshots. These are workflow/provenance
  notices, not human decisions or assessment evidence. No schema default fabricates
  notices for older projects; unsupported future envelopes reject project reads/writes.
- Submissions: optional `appliedRevision` records the **exact** revision that first
  applied their immutable source. New applications write it atomically with that source.
  For older already-applied responses, completion derives the exact insertion boundary
  from retained revisions rather than inventing a baseline or timestamp. Receipts are
  checked against both adjacent source snapshots before use. A missing historical
  boundary produces no invented input-impact claim. No startup backfill is required.
- Answer input: optional `fingerprint` or `reviewedRevision` establishes exact question
  wording/options and previous-answer identity. New browser requests reference the saved
  reviewed revision; storage derives/checks its fingerprint without duplicating large
  question/option text in the bounded HTTP body. Older inputs retain their existing
  question-text/source checks, without manufacturing a historical fingerprint.

Withdrawals reuse existing rejected-requirement/dismissed-proposal storage lifecycles,
with an explicit completion notice distinguishing them from human rejections/dismissals.
Records, IDs, original sources, prior wording, human choices and completed results remain
saved. Never-approved proposals may be withdrawn; approved behavior is not removed by
pendingChanges. Saved/unfinished responses prevent conflicting changes or retirement.
Unsaved drafts are renderer state and remain editable/reviewable when their item changes
or retires. Notice reasons are bounded summaries; original retirement reasons and record
history remain available separately.

No database rewrite, startup sweep, data reset or model replay occurs. Publication,
pending updates, withdrawals, notices and receipts share the existing immediate SQLite
transaction/expected-revision/lease checks. Failure rolls back the entire round and its
notices, preserving human input. Completion can be retried explicitly after failure;
already completed jobs cannot publish twice. Blocked pair results do not withdraw old
work. Optional candidate context cannot starve the original response.

The new project notices are excluded from model context and decision/assessment/cache
identity projections; compatible completed checks and delivered evidence remain valid.
Actual wording, choices, human sources or record eligibility changes still invalidate
the relevant evidence normally. There is no assessment compatibility/version bump.

Upgrade coverage includes old projects without notices, older applied-response shapes
without a revision receipt, two reopens with new notices/jobs intact, original historical
snapshots, unchanged context/assessment identities when only notices differ, and future
project/job envelope rejection without replacement. No additional startup recovery path
or paid reassessment is introduced.

Verification (2026-10-20): `npm run check` and all **343 deterministic tests** passed,
including the compatibility, atomic failure, stale-worker and retained-input cases above.
The UI build and Playwright checks passed, including retained drafts, completion notices
and reload without model replay.
Live-model reconciliation quality has not been qualified.

### Human decision availability and evidence bases (2026-10-20)

Source/target database **3 → 3**, execution **1 → 1**, workspace **2 → 2**. New queued
review submissions and individual wording proposals add optional
`decisionBasis: { format: 1, contextKey }`. The key identifies the exact target,
relevant current human source IDs, linked clarification state, feature/dependency
structure and confirmed dependency guardrails under `human-review-basis-v1`.
Plain independent same-feature approvals and unrelated features are excluded; nonblank
review addenda are conservatively feature-level guardrails. Browser review
inputs add optional `reviewedRevision`; storage derives the basis from that immutable
saved revision, not from a client-provided assertion of current evidence.
New ordinary confirmation/rejection sources also record optional `reviewAddendum`
from the actual submitted human note. AI cleanup/resolution explanations do not acquire
this marker and are not mistaken for wider human change requests. Legacy sources keep
their missing marker; upgrades do not reinterpret historical prose as structured scope.

This is an additive forward-compatible read with **no startup rewrite/backfill**.
Legacy submissions/proposals lacking this provenance retain their existing target
fingerprint rules plus the current pending-input/worker safety checks. Do not manufacture
a historical basis from today's state. New unsupported/malformed basis envelopes reject
reads/saves without replacing original data; schema format is separate from project
revision/CAS. Existing resolution identities, assessment/cache fingerprints and delivered
evidence are unchanged, and completed work is not invalidated just by upgrading.

New pending wording proposals become outdated only when captured relevant evidence
actually differs. A genuinely new context may produce a new proposal for otherwise
unchanged wording; old proposals/checks remain saved. This does not replay inference on
startup. A review that is no longer safe is retained as unapplied `needs-attention` with
`conflict: true` and its exact input/note; only explicit human re-review can replace it.
The enqueue/application checks and writes share SQLite immediate transactions. Failed
writes roll back normally; repeated opening needs no migration recovery or model calls.

Upgrade coverage includes legacy queued reviews without a basis, new bases through two
reopens, unchanged historical snapshots/completed work, and future-format rejection
without payload replacement. Concurrency checks use independent SQLite connections and
exercise both worker-first and human-first ordering. No production-data reset is needed.

Verification: type check, all 321 deterministic tests (including upgrade/reopen and
source/proposal provenance checks), UI build, Playwright browser checks and diff checks
passed on Node 20.11. The new safeguards perform no model calls, and no live provider
or additional Node 22/desktop qualification was attempted.

### Human duplicate removal and targeted proposal refresh (2026-10-20)

Source/target formats remain SQLite **3 → 3**, execution payload **1 → 1**, workspace
format **2 → 2**. No startup transformation, new schema field, fingerprint change,
backup rewrite, model replay or reassessment is introduced by upgrading. Existing
proposals, completed checks, assessments and delivery evidence keep their semantics.

An explicit duplicate-removal decision uses the existing rejected requirement,
rejection source (superseding prior confirmation where present), review note and
revision-history representation. The survivor ID is recorded in that evidence/note;
it is not a new structured relationship field. Original sources/IDs/history are not
rewritten. Only assessments citing the removed requirement are invalidated, as for
other requirement decisions; unrelated evidence and execution history remain saved.
Existing readers can read the result without migration. No cleanup runs on upgrade.

Targeted refresh uses existing single-target/pair job envelopes. On successful
non-blocked publication, stale proposals for that exact target/pair become dismissed
in the same SQLite transaction. Failure, cancellation, stale output, validation errors
and blocked outcomes do not retire the old proposal. Interrupted work is recovered by
existing lease rules and requires explicit retry; startup never repeats model calls.
Revisions remain the concurrency counter, not a migration version. Existing future-
format rejection and transaction recovery remain unchanged.

Coverage includes older saved project shapes with existing resolution proposals,
direct removal followed by two reopens and historical-revision reads, and successful/
blocked/failed/cancelled/stale refreshes. There is no new persisted format to transform.
Verification: type check, all 307 deterministic tests, UI build, Playwright browser
checks and diff whitespace check passed in the available Node 20.11 environment.
No live model calls or new Node 22/desktop qualification were performed.

### Processing refresh transport and rendering (2026-10-20)

Source/target: SQLite **3 → 3**, execution payload **1 → 1**, workspace format **2 → 2**.
No persisted transformation, backup or reassessment is needed. The optional authenticated
`X-Reqwizit-Snapshot` request/response header carries bounded SHA-256 content tokens for
top-level snapshot sections; only changed sections appear in the response body. These
are transient transport identities, unrelated to stored decision/assessment fingerprints.
Clients without this header retain full-response compatibility. Browser reloads begin
with an empty token set and receive all sections, including after a server restart.

Independent job, workspace, queue and projected interrupted-worker changes are hashed
from current content on every poll, not inferred from revision/version counters.
Only immutable revision payloads and their deterministic coverage reuse serialization.
Each client merges against its request baseline; stale/aborted/wrong-project responses
cannot overwrite newer accepted work. Rendering caches and lazy/paged queue history do
not alter saved submissions, input, IDs, assessments, provenance or outcomes. All
original history remains accessible through pagination. No startup model work is added.

Verification: all **288 deterministic tests** passed, including request-baseline
merging, same-counter worker changes, removed sections, malformed/oversized tokens,
legacy full responses, independent workspace/queue/job updates, project switching,
cancellation and out-of-order/stale refreshes. Existing storage migration/reopening
tests also passed; no saved-data upgrade path is introduced by this change.

### Targeted post-response resolution receipts v1 (2026-10-20)

Source/target: SQLite **3 → 3**, resolution envelopes **1 → 1**. Add optional
`Submission.overlapFollowup` (`format: 1`) with discovery job identity, affected IDs,
trigger sources, candidate count and up to three pair checkpoints. Pair manifests add
optional `includeUnapproved`/`triggerSourceIDs`; resolution proposals add optional
`resolutionTriggerSourceIDs`. Existing project snapshots, approvals, IDs, original
evidence, history, assessment/delivery state and workspace formats remain unchanged.
This is an additive forward-compatible reader/workflow change, not a bulk rewrite;
there is no schema-version increment, backfill, backup transformation or startup inference.
Legacy completed submissions lacking receipts remain completed and are not reprocessed.

The receipt commits atomically with successful discovery; failure rolls both back.
Pair calls run afterward and save checkpoints with a discovery/job compare-and-swap
guard so a late worker cannot replace a newer checkpoint. Startup preserves live
leases; interrupted pending receipts pause for explicit resume. Completed pair results
published before a crash are recovered without repeating their model call. A failed,
cancelled, stale or oversized-context check keeps discovery, human input and the
original review response; retry resumes only unfinished eligible work. Unsupported
future receipt formats reject reads without replacing stored payloads.

`resolution-evidence-v1` identities remain byte-equivalent when trigger sources are
already represented. Compatible completed approved-pair checks/proposals are reused;
new explicitly pinned evidence outside the old pair scope extends the identity and
corrections stale that new evidence, without manufacturing provenance for older work.
No assessment semantic version or freshness migration is needed.

Verified: `npm run check`, all 284 `npm test` tests, and `npm run test:browser`
(ordinary answer/review resolution without Refine, unchanged originals before approval,
failure/resume and count summaries). Upgrade tests include repeated disk reopen after
discovery publication, completed-pair crash recovery, legacy completed submissions/check
reuse, cross-connection checkpoint CAS and future-format payload preservation. No live
model calls were made; semantic resolution quality remains unqualified.

### Single Refine entry point (2026-10-20)

Source/target: SQLite **3 → 3**, resolution envelopes **1 → 1**, project/execution
payloads and workspace artifacts unchanged. Remove the separate session-only approved
audit UI and its redundant action. Refine retains the internal approved-pair candidate
scan, checkpointed model checks, pending/dismissed proposals and human approval flow.
No saved audit state existed to migrate; all saved evidence, approval status, history,
fingerprints and completed checks remain unchanged. This is presentation/navigation
cleanup, not a semantic invalidation or an instruction to repeat model calls.

The earlier approved-audit UI entry below records historical behavior; it is no longer
an available user action. Browser checks now enter resolution directly through Refine
and assert that the redundant section is absent. Core large-pair, cancellation and
upgrade-preservation checks remain in place for internal candidate planning.

### Resolution citation contract alignment (2026-10-20)

Source/target: SQLite **3 → 3**, resolution envelopes **1 → 1**; no serialization,
workspace, fingerprint, freshness or assessment compatibility change. The existing
source-only/current-evidence policy is shared between resolution prompts, basis-specific
schema enums and publication validation. Clarification question evidence IDs retain
their separate record-reference rules. This fixes unconstrained proposal citation
strings/ambiguous instructions and replaces the generic eligible-evidence failure with
a field/index/ID-specific reason; invalid references are never mapped or replaced.

There is no persisted-data transformation or startup inference. Original failures remain
historical failures; existing valid proposals, approvals, IDs and completed pair/individual
checks remain reusable. Explicit Refine retry handles the failed pair without resetting
data or replaying unchanged completed work. Regression checks cover valid source-only
citations, requirement/question/research IDs, duplicate/superseded/deferred/delegated and
outside-context sources, human-vs-workspace basis, prompt/validator agreement, empty
allowlists, atomic rejection and explicit retry. Existing reopen/upgrade checks remain
applicable; no new format recovery path is needed.

### Reviewable requirement resolutions v1 (2026-10-20)

Source/target: SQLite **3 → 3**, execution JSON **1 → 1**, existing project/refinement
records preserved. Add an optional `resolution` envelope (`format: 1`) to new refinement
proposals, with the second requirement ID, explicit consolidation/coordinated-revision
action, cited evidence and basis. Saved resolutions also require the second original
snapshot and a `resolutionContextKey`. Missing optional resolution fields on legacy
refinements mean ordinary cleanup, with unchanged semantics; no data backfill, new
approval, repeated individual cleanup/model call, reassessment or reset is required.
Unsupported future resolution formats and incomplete new provenance are rejected on
project load without rewriting evidence. Saved job readers also reject future resolution
formats rather than reusing them as completed checks.

New job manifests optionally contain `refinementPair`, and new pair results contain
`resolutionCheck` (`format: 1`, proposal/question/distinct/blocked). Existing completed
single-requirement checks retain their original fingerprint/context identity. Pair
checks use independent `resolution-evidence-v1` identity: exact requirement review
snapshots, immutable source IDs for linked/current applicable human evidence, active
area/dependency structure, and linked clarification statuses/answer IDs. Human sources
are append-only: corrections retain old evidence and get new IDs/supersedes links.
Workflow prose and app versions are not evidence changes. No identity/provenance is
invented for older checks; a new pair task is not a replay of an old individual check.
Unchanged completed/dismissed pair checks survive reopen; blocked/failed checks remain
explicitly retryable. Unanswered/deferred/delegated clarifications suppress re-asking.

Proposal publication uses existing revision/lease transactions and validates both exact
task IDs, full supporting context and current eligible citations. A workspace observation
cannot be cited as a human decision. Approval is a single existing CAS transaction:
check both original snapshots/current human context and pending input, add human approval
sources, then apply both changes or neither. Consolidation rejects (never deletes) the
redundant record and unions evidence on the survivor. Coordinated correction retains
both IDs and adds evidence/approval to each. Original proposals, snapshots, sources and
history remain inspectable. Changed behavior invalidates applicable coverage and existing
implementation/delivery freshness through the normal requirement/decision fingerprints;
untouched completed work is not globally invalidated. Workspace artifact formats stay
unchanged. Failure/cancellation never grants approval or repeats model calls at startup.

Upgrade checks exercise legacy ordinary proposals alongside new resolution proposals,
repeated SQLite reopening, approval after reopening, preservation of originals/history,
future formats and missing provenance. Deterministic checks also cover stale/atomic
rejection, malformed/missing/out-of-task evidence, pending reviews, cancellation/context
failure, completed-task reuse after failure, clarification follow-up and the 20-call bound.
Live model resolution quality remains unverified; fixtures do not establish semantic
correctness or subscription compatibility.

### Approved-requirement wording audit (2026-10-20)

Source/target: SQLite **3 → 3**, project/execution JSON and workspace artifacts
unchanged. The explicit bulk audit derives read-only candidate pairs from an in-memory
project snapshot. Results are session-only, revision-labelled, and not new saved
assessments, approvals, findings or freshness evidence. Revision changes show a stale
snapshot warning; reload/project switching clears the report. No startup rewrite,
migration transaction, model call, reset, reassessment or invalidation of valid completed
work is required. Cancellation/failure affects only the local check.

Legacy approved records participate without modification, including equivalent wording
with different IDs/scenarios. Existing upgrade/reopen tests now exercise the audit and
verify unchanged original snapshots/history and approvals. New tests cover eligible
active-feature scope, pair uniqueness, bounded output, cancellation, no-match results
and complete 500-requirement pair evaluation. Browser checks verify all-feature scope,
paging, lazy comparison details, unchanged state/history/jobs, stale results, reload,
mobile width and cancellation/retry. Similarity remains advisory, not semantic proof.

### Discovery wording-similarity safeguards (2026-10-20)

Source/target: SQLite **3 → 3**, project/execution JSON unchanged. New rounds use
Unicode NFC/case/whitespace/terminal-question-and-sentence-punctuation normalization
for duplicate wording checks. Internal punctuation, operators, numbers and negation
remain significant. Scans use the same key when skipping already-existing wording.
These checks apply only to new output; saved duplicates, approved wording, original
evidence, IDs, revisions, assessments, fingerprints and delivery records are not rewritten
or invalidated. No upgrade model calls or reassessment are required.

Related-record hints are optional bounded navigation context, recorded through existing
job manifest character counts/indexed IDs. They do not authorize evidence citations.
New question citations are checked against detailed context for concept projects as
well as scanned projects; saved question evidence is preserved, not revalidated or
invalidated on upgrade.
New round similarity notices use existing `roundChanges` strings. Review comparisons
are computed read-only from current records, including legacy records, without new
persisted state or a migration/startup transaction. Existing stale-result and atomic
publication checks remain authoritative. Failed discovery preserves saved input.

Checks: repeated SQLite reopening preserves original snapshots/history and approvals;
bounded-context, exact-duplicate atomicity, opposite-rule warnings and read-only review
tests pass. Similarity is lexical and advisory, not semantic reconciliation; saved
records are never automatically merged or rejected.

### Implementation planning v1 (2026-10-19)

Source/target: SQLite **3 → 3**, execution payload **1 → 1**. Add optional `planning`
and `planningHistory` envelopes with independent `format: 1`, and optional
`config.implementationOrder`. Missing fields mean the existing manual-planning workflow;
no data rewrite, model call, new approval requirement or evidence invalidation occurs on
upgrade. Startup validation rejects unsupported future planning formats, including
history, without replacing saved payloads.

Proposal checkpoints preserve original requirement IDs, evidence references, steps,
verification guidance, session IDs, model, specification revision, workspace binding,
settings identity and creation time. Approval records selected hard edges, notes and
approval time while retaining original proposals. Replacement/retry retains old plans.
Interrupted retries reuse completed packages only against the exact same planning
inputs; no missing provenance is invented. Approved dependencies use existing semantic
freshness rules; changed prerequisites can genuinely invalidate affected assessment
context. Ordering alone does not change assessment identity or delivered evidence.
Planning settings identity canonicalizes object keys and prerequisite/path sets; equivalent
serialization does not require repeating proposal calls. Execution order remains ordered.

Writes use existing transactional execution CAS/worker leases. Review also checks the
current specification revision and workspace binding; crashes leave checkpoints for
explicit retry and never automatically repeat model calls. Existing code/delivery runs
must be archived before a replacement plan. No workspace artifact format changes.
Deterministic checks exercise legacy migration preservation, unsupported planning
formats, failed/interrupted checkpoint retry, approved-plan repeated reopen, stale/CAS
rejection and browser review. Live planning output quality remains unqualified.

### Discovery glossary cleanup and validation diagnostics (2026-10-19)

Source/target formats unchanged: SQLite **3 → 3**, existing project/job JSON and
workspace formats unchanged. New discovery results may omit schema-malformed
individual concept annotations before strict analysis validation; valid annotations
and all substantive proposal fields remain validated normally. Existing phrase-reference
cleanup still applies. Omission counts use the existing revision `roundChanges`
strings; blocking failures use the existing job `diagnostic` string with bounded field
paths and expected-shape details, without model values.

No forward data transformation is needed. Existing snapshots, completed/failed jobs,
evidence, stable IDs, assessments, fingerprints and worker leases are untouched.
Reopening does not replay old failures or repeat model calls. Old failed rounds remain
failed and require explicit follow-up; this change does not reconstruct missing results
or certify them as applied. New result publication retains the existing revision/lease
checks and atomic transaction. Regression coverage exercises old completed work and
history preservation across repeated reopen, durable cleanup reporting, and atomic
rejection of substantive errors alongside malformed annotations.

Verification (2026-10-19): `npm run check`, all **235 tests** under `npm test`,
and scoped `git diff --check` passed. Read-only replay of the original failed
Rust Grind Galaxy response through the new parser omitted its single dummy entry,
retained its valid annotation, question and requirement, and passed schema validation.
This did not publish that response or make a live model call.

### Project activity index v1 (2026-10-19)

Source/target: SQLite **2 → 3** (older supported databases run migration 2 first).
Execution schema **1 → 1**, assessment semantics and freshness fingerprints unchanged.
Migration 3 adds `project_activity`, an indexed projection keyed by project/event ID
with an independent monotonic recording sequence. Original revision snapshots, human
input, jobs, submissions, execution payloads/CAS and workspace artifacts are untouched.
No reassessment or model call is needed.

- Backfill compares consecutive saved project snapshots by stable record ID, retaining
  before/after descriptions and feature names. It also projects saved stopped jobs,
  needs-attention submissions and retained assessment/implementation outcomes. Dates
  absent from historical revisions are left absent; known run start dates remain start
  dates. Revision entries are backfilled in revision order, then retained outcomes;
  cross-source historical chronology is not inferred.
- Linked job/run snapshots supply historical item and feature names. Missing linked
  snapshots fall back to retained IDs rather than substituting current wording. Old
  needs-attention submissions without a recorded context revision remain explicitly
  unlinked; the current specification revision is not substituted as their original
  event revision.
- Reads are bounded to adjacent snapshots, without holding an active SQLite cursor
  during writes. Index creation, backfill, migration ledger and `user_version` commit
  atomically under the ordered migration transaction. Failure rolls back the derived
  table and version; reopening retries against unchanged source evidence. Original
  evidence is its own rebuild source, so no additional source-payload backup is needed.
- New activity and its source changes commit in the same transaction. Event IDs make
  repeated saved outcomes idempotent; historical projections are not overwritten with
  today's feature names. New revision/job/submission entries carry their actual recording
  timestamp; backfill never substitutes the upgrade date for missing event provenance.
  Routine worker progress is not indexed. This additive upgrade
  does not expire leases or take ownership of another worker. Unsupported future
  database/payload formats retain the existing refusal-without-overwrite behavior.
- The authenticated read API applies highlight/type/feature/search filters in SQLite
  before its fixed 25-row limit. Anchored pages exclude later recording sequences;
  search treats punctuation literally. The existing revision API stays compatible.

Upgrade coverage includes a 1,000-revision v2 database, malformed-snapshot rollback,
repair/retry, exact preservation and repeated reopen. Existing execution upgrade tests
now also remove the new derived table when constructing pre-upgrade fixtures.
Verification (2026-10-19): `npm run check`, all 233 tests under `npm test`, and
`npm run test:browser` (including the UI build and 1,000-routine-revision activity
exercise) passed. The suite also checks historical labels, duplicate-outcome
preservation, stopped jobs/submissions, literal search, stale-page anchors and API
authentication/input bounds. These ran in the available Node 20.11 environment;
Node 22.12+ remains the development baseline. No live model calls were made.

### Operation coordination and citation diagnostics (2026-10-19)

Database **2 → 2**, execution envelope **1 → 1**, assessment compatibility and all
freshness/content fingerprints unchanged. No schema migration, payload rewrite,
reassessment or model call is required. Existing completed evidence, source IDs,
submission IDs, history and manual pause intent retain their meanings.

- Execution uses the existing lease table for a short project startup reservation
  (`startup:<project id>` resource), upgraded transactionally to the canonical Git
  common directory with the same owner. Other live owners are never displaced.
  Crashed startup reservations expire under the existing execution lease duration.
- Newly pending discovery/help/scan jobs populate the existing `leaseUntil` field
  before the runtime starts. Recovery also recognizes expired pending jobs. Legacy
  pending jobs with `leaseUntil: null` have no live-worker provenance and become
  interrupted during explicit recovery/startup; they are retained and never replayed
  automatically. Completed and live leased jobs remain untouched.
- Existing queued/saved submissions stay in their original formats. Automatic wake-up
  cannot apply them during execution; failed/cancelled workers pause waiting follow-up.
  An expired execution lease pauses automatic follow-up until explicit discovery/scan
  resume acknowledges only the expired reservation. Restart retains explicit resume.
- Evidence eligibility is unchanged; the prompt now shares the validator's allowlist,
  and diagnostics distinguish invalid references. Historical failure messages and
  previously completed work are not rewritten.

Regression coverage includes independent database connections, reopen with a live
owner, legacy null-lease pending recovery and repeated recovery, canonical-repository
contention, durable queued input, advisory help, manual/automatic follow-up preferences
and expired-worker explicit resume. Browser coverage exercises disabled actions with
focus/hover/touch, accessible descriptions, activation suppression and dialog Escape.
These checks passed in the 228-test deterministic suite and the Playwright browser
run on 2026-10-19; type checking and the UI build also passed. No live model calls or
user data resets were used.

### Additive assessment impact metadata v1 (2026-10-19)

Source/target: execution JSON envelope **1 → 1**, database **2 → 2** and assessment
semantics `assessment-evidence-v1` unchanged. This is an optional, independently
versioned cache extension; no existing field is reinterpreted and no startup rewrite
or new required representation is needed. Future footprint versions are rejected by
startup validation without overwriting data. An incompatible future envelope still
requires an ordered registry migration.

- Optional settings: `assessmentScopes`, `sharedAssessmentPaths` and
  `reuseEquivalentScopes`. Absent scopes retain repository-wide checking; absent
  equivalent-scope setting retains separate local/main inference. The browser enables
  equivalent-scope reuse for newly configured projects, without changing saved settings.
- New assessments store footprint version 1: normalized policy identity, captured
  path/hash/excerpt boundaries, an omission inventory digest and a content fingerprint.
  The footprint covers search scope, shared/configuration paths, prerequisite boundaries,
  referenced evidence and all detailed-window evidence. It is not synthesized from old
  citations. Snapshot/omission budgets and unknown evidence retain their existing limits.
  Only the app-owned excluded `.requirement-wizard` publication-directory inventory entry
  is omitted from this digest, since it need not exist in a detached main worktree;
  normative inputs are independently checked. Captured source bytes (including line
  endings), all other omission metadata and excerpt boundaries must still match.
- A compatible older checkpoint can acquire a footprint on an explicit normal check
  only if its exact saved capture fingerprint, requirement, relevant decisions, model
  and workflow match and no newly configured reviewed boundary requires a new search.
  This also permits HEAD-only changes with identical captured content. Original result,
  evidence, dates, commit and specification revision remain unchanged. When exact
  equivalence is unavailable, retain the old result and queue conservative reassessment.
- Per-run optional impact reasons/fingerprints and a `preview` flag describe the
  assessment queue. Preview performs no inference or main verification. Old runs are
  not reconstructed; absent impact metadata keeps the existing conservative fallback.
- Optional manual reassessment requests keep a unique token, date and reason. New
  checkpoints record the token they satisfied; local/main satisfy requests independently.
  Old assessments/delivery records are retained, not deleted or rewritten as missing.
- Opt-in cross-scope reuse requires compatible footprint and normative/model inputs
  matching the target capture. A copied target checkpoint records `semanticOrigin`
  (original scope, commit and capture date) and target snapshot identity; the original
  checkpoint is unchanged. Actual main check output and main delivery remain separate.
- Footprints and manual request tokens stay local to SQLite and are excluded from
  portable progress artifacts. Semantic origin is portable provenance. Workspace
  artifact format remains 2; no saved requirement IDs or human decisions change.

Enrichment/checkpoints use the existing atomic execution save, CAS and worker lease.
Interruption before saving leaves the old checkpoint intact; a saved checkpoint is
reusable on retry. Startup itself neither enriches nor repeats model calls. Reopening
validates optional footprint formats and retains histories and counters unchanged.
Existing migration transaction rollback and future-format rejection also cover malformed
or future footprint metadata. No data reset is needed.

Verification (2026-10-19): type checking, all **224 deterministic tests**, the UI build
and Playwright browser checks passed. Fixtures cover exact legacy enrichment,
preserved provenance across repeated startup, scoped additions/deletions/shared changes,
manual requests, equivalent local/main reuse with independent verification and divergent
code, failures/cancellation, new files appearing during a frozen capture, and future-format
rollback. Browser checks cover saved feature boundaries, preview requests/reasons,
manual marking, mobile width and a 500-requirement collapsed view. No live model calls
were made. Installer upgrades and the user's particular saved database were not exercised.

### Database 0/1 → 2; execution payload 0 → 1 (2026-10-19)

Implementation: `src/storage/migrations.ts`, called by `ProjectStore` before workspace
upgrades/publication. The base tables are initialized first for a new database.
An ordered registry applies migrations under one immediate SQLite transaction and
records each version/name/time in `migration_history`.

Transforms:

- Add explicit execution schema version, keeping all existing execution fields.
- Convert known legacy `[taskInputs, referencedPaths, fullSkillDocument]` identities
  to `decisions-v1`, using the **saved inputs**, never today's project state. This also
  normalizes legacy object-property ordering without reinterpreting decisions.
- Recognize the exact shipped assessment v1 document using its frozen SHA-256 digest.
  Only results also recording policy `requirement-isolation-v3` and the correct skill
  name/version receive `assessment-evidence-v1` compatibility metadata. Unknown
  documents/workflows and missing identities are retained without inventing metadata.
- Apply identity conversion to aggregate, workspace and main assessments, current
  delivery and delivery history. Save the original identity in
  `legacyContextFingerprint`. Retain original model/skill/policy, evidence, source
  hashes, dates, check output, current/archived coding runs and assessment runs.
- Keep an exact original execution payload and its concurrency version in
  `execution_migration_backups`, keyed by project and migration. These are local
  SQLite payload backups, not standalone full-database backups or portable exports.
- Advance each migrated execution row's concurrency counter once, so an already-open
  client cannot overwrite its new representation. Specification revisions do not change.
- Mark connected workspace artifacts dirty for normal conflict-aware publication.
  Portable artifact format stays at 2; local identities/backups are not exported.

Compatibility and reuse:

- Known equivalent legacy results keep current credit if their actual inputs still
  match. A changed human decision remains stale after migration.
- Older pre-skill policies, unknown skill documents and context projections not
  demonstrably equivalent are **not** automatically certified compatible. Dated
  results remain available. Legacy results without context identity retain their
  prior revision-bound freshness behavior but are not reusable inference checkpoints.
- Main verification commands still run on an explicit main check; an upgrade itself
  does not run commands, infer, fetch Git or resume a worker.

Failure/recovery:

- Live execution leases block the upgrade. Stop the owning worker and reopen; expired
  leases do not block it and are not otherwise modified by migration.
- Invalid JSON, unsupported future payloads or inconsistent row/payload concurrency
  versions stop the transaction. Payload edits, backup rows, migration history and
  database version roll back together. Reopening retries the upgrade safely.
- Repeated startup validates supported payload formats without reapplying migrations,
  duplicating backups or changing counters. Older app builds reject database version 2.
- On failure, keep the database and its WAL/SHM companions intact. Correct the reported
  blocker and retry. Original-payload backups support diagnosis/manual repair; there
  is no automatic downgrade or restore command. Copying only `projects.sqlite` while
  an app is writing is not a consistent external backup procedure.

Verification (2026-10-19): type checking, all 220 deterministic tests, the UI build
and Playwright browser checks passed. Desktop TypeScript compilation also passed.
After freezing the legacy skill test fixture independently of the current workflow,
the four migration tests and the real-local-Git incremental-check/upgrade test passed
again. Tests cover preserved evidence/main credit, repeated startup, stale CAS rejection,
changed decisions remaining stale, unknown/missing provenance, transactional rollback,
live-lease blocking/retry, malformed/future payload rejection and unknown-result reuse
without inference. Installer upgrade behavior and the user's particular saved data
have not been exercised by the deterministic fixtures. No live model calls were made.

## Existing migrations and follow-ups

The workspace artifact 1 → 2 conversion retains its existing publication journal and
external-edit checks; see [project-workspaces.md](project-workspaces.md). Older project
snapshots still use the existing schema-default/read normalization. Provider/settings
migrations retain their existing boundaries. This change does not claim those earlier
paths were retrofitted into the new execution migration registry.

Future database migrations append registry entries. Future execution representations
must add ordered transformations and increment their schema version; do not reinterpret
the CAS counter. Add curated old-data fixtures for each supported upgrade path.
