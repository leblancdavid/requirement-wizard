# Data migrations and upgrade compatibility

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
