# Data migrations and upgrade compatibility

## Linked question/answer discovery evidence (2026-11-12)

**Source → target: SQLite 69 → 70; conditional portable 43; local resolved-prefix
computation v3 → v4.** SQLite 70 is a transactional reader boundary, not a rewrite
of paid work. Original layouts, stable IDs, answers, options, completed stages,
drafts and spent attempts remain intact. Startup performs no model calls and does
not automatically continue blocked work. Older reviewed CPU planning receipts may
be adopted; older pending/blocked scheduling results are recomputed locally.

New dense questions-only schedules declare `question-answer-units-v1` and keep
explicit question/answer units in each relevant batch without reducing the original
mandatory evidence union. Existing paid layouts retain their original identity.
On explicit continuation, a saved validation-stage blocker naming an omitted linked
record can add exact question/options/answer evidence to that step. This uses the
original three-attempt ceiling (only steps with one or two spent attempts qualify)
and 96,000-character bound, never truncation or a fresh allowance. An authenticated
support record binds the original receipt prefix, frozen draft, added IDs and
before/after evidence hashes. Blocker prose is only a navigation hint: a new model
verdict must resolve the check before publication. Repeated supplemented semantic
rejection remains blocked. Unrelated transport errors are not repaired by this path.

Portable 43 is required only when grouping or linked-evidence recovery metadata is
exported. Older unchanged continuations retain their existing formats. Downgraded
or unsupported future markers are rejected without overwriting saved work. Failed
startup validation rolls back the migration; reopening retries safely. Cancellation
retains the paid ledger and allowance. A validated stale verdict is retained against
its original revision, not published; failed publication can reuse its checked final.

Logs/diagnostic exports project completed worker receipts with an unpublished
package blocker as `blocked`; durable worker status is unchanged.

Verification: ten focused deterministic recovery tests passed, including 69→70
interrupted upgrade/reopen, future-marker rejection, actual portable clone
continuation, tampering, capacity/exhaustion, cancellation, semantic rejection,
stale verdict and publication retry. Extended workspace-layout browser checks
passed, as did type checking, UI build and diff checking. The final full test
run passed 2,061 tests, including all ten focused recovery tests. No live subscription recovery
was exercised. The reported WebSocket 1006
transport failure remains unresolved and separate.

## Exact dependency-equivalent completed discovery (2026-11-12)

**Source → target: unchanged SQLite 69 / portable formats through 42; local
resolved-prefix computation v2 → v3.** A read-time proof can retain completed
questions-only v4/v5 workflow/boundary checks when record placement or broader
input bookkeeping changes without changing their actual evidence dependencies.
Original plans, input keys, final hashes, paid receipts, attempts and completed
results are never relabelled or rewritten. There is no startup conversion,
reassessment, model call, new usage permission or schema-version increment.

The proof reconstructs the source's immutable original revision and canonical
batch plan, independently replays every saved read/check, and authenticates its
final output, exact final context hash, evidence hash and publication inventory.
It then compares the entire expanded evidence union and every displayed global
instruction/guidance field against today's canonical candidate. Only whole-record
array ordering, batch placement/repetition and revision are representation-only.
Record content, human decisions, task/group identity, policy, focused areas,
guidance, dependency metadata and latest scan freshness must remain compatible;
unknown extra instructions are not ignored. Both an added and a removed
dependency prevent reuse. This is not semantic similarity, inferred independence,
or a claim that the old model compared every possible pair of records together.

Only fully published completed results qualify. Partial, failed, cancelled,
exhausted, blocked or unpublished work cannot obtain a new stage allowance through
this path. Existing exact-match resumption remains unchanged. Missing history or
unverifiable receipts never establish equivalence. The owned worker requests
historical revisions locally and preserves existing cancellation/deadline/stale
revision checks; a source-read failure starts no inference. On successful proof,
the planner marks the current candidate reviewed; it does not republish old drafts
or manufacture a new model receipt. Portable exports retain the original source
jobs/revisions under existing continuation rules, so clones can recompute the proof.
An inventory mismatch rejects reuse before loading history. The owned worker
retains at most two full source projects for these equivalence proofs and keeps
invocation-local proof results across lazy history retries, so rejected old
revisions neither accumulate full projects nor repeatedly replay earlier proofs.

V3 local resolved-prefix keys bind the same exact project/history/submission inputs
plus the new algorithm domain. Existing v1/v2 CPU receipts adopt only when those
original inputs still match; they are conservative proofs and remain valid. Context
packing caches and all paid-work identities are unchanged. Failed/interrupted local
proofs leave original evidence intact; explicit retries need no data reset.

Optional numeric diagnostics report completed-equivalence checks and matches for
the current planning worker. A later exact-input CPU-cache hit can report zero new
equivalence checks while still reusing reviewed packages. Staged proposal metrics
now count drafts actually appended after exact deduplication and proposals removed
by checks, including reconstruction across resumption. These counts describe the
package's receipt history, not just new requests in the current run; they do not
invent reasons for rejection. Older absent measurements remain unknown.

Implemented scope is completed-package equivalence only: changed-evidence partial
stage reuse, a semantic decision frontier and rejection-reason model output remain
future work. The supplied cycle changed human/other evidence, so its 205 requests
are not claimed avoidable by this narrower proof. Live speed remains unverified.
Regression coverage includes valid ordered/rebatched evidence, genuine evidence/
guidance/scan changes, corrupted/missing receipts, incomplete outcomes, repeated
reopen, saved-order compatibility and portable round-trip with no repeated calls.
The v2→v3 CPU-cache regression verifies adoption without context preparation or
rewriting paid work; another regression walks five historical candidates through
the two-project window with exactly one load/proof per revision.

Verification: the full `npm test` aggregate passed 2,049 tests (950 pretests,
819 main, 280 posttests) before the final bounded-history/cache-adoption hardening.
After those final changes, all 135 focused epic-review/planning/diagnostic tests
and type checking passed. UI build and diff check passed; browser automation and
the live project/model account were not exercised. The full aggregate was not
repeated after the final hardening.

## Shared exact historical-record computation (2026-11-12)

**Source → target: SQLite 68 → 69; disposable snapshot-cache generations 1/2 → 3;
portable formats remain through 42.** The ordered transactional startup migration
creates a local content-addressed record cache and invalidation triggers. It does
not rewrite original revisions, jobs, answers, paid receipts, assessments, protocol
keys or portable artifacts, and never starts inference. Unsupported future database
versions remain rejected by the existing startup boundary.

Generation 3 stores an integrity-checked manifest of exact serialized record hashes
instead of repeating full record strings in every historical snapshot. Each read
still reads/hashes original revision bytes and verifies the manifest; each distinct
record is decompressed and authenticated before reuse. A publication-scoped memo
retains at most an estimated 16 MiB of immutable strings/keys, not mutable projects.
Uncached records are always loaded; hitting the memo bound never omits evidence.
Record/manifest decompression and expanded record content retain a 64 MiB bound;
oversized disposable computations fall back to original normalization.

Existing valid generation-1/2 caches upgrade lazily without repeating normalization
or model calls. Each record/manifest write is one transaction. Interrupted upgrades
roll back and retry; corrupt, missing or unknown-generation computation rebuilds
from original saved evidence. Original revision replacement/deletion invalidates
both cache layers; appending a later revision preserves earlier computations.
Deleting a project cascades to its computation cache. This is disposable local
storage, never exported evidence; there is no new assessment/freshness semantics.

Publication diagnostics add optional numeric snapshot-cache read/hash/inflate/parse/
normalization/write times and cache/object reuse counts. Old measurements remain
absent, not manufactured zeroes. These submeasurements overlap the enclosing
snapshot-read timing and are not an exhaustive CPU profile. The export allowlist
continues to strip IDs, paths, text and arbitrary extra fields.

The synthetic 64-snapshot × 1,600-record benchmark verifies identical continuation
bytes, compares against an independent generation-2 reader and reports cold,
upgrade and warm costs. Initial measurements showed approximately halved warm
time, but increased cached payload storage (~3.93 MB versus ~0.92 MB); migration
and first publication are not warm-speed claims. The user's observed 37-second
publication is not requalified by this fixture. Live-project speed, disk overhead
and histories exceeding the memo budget still need real-world measurement.

Upgrade tests cover a saved generation-2 computation at schema 68, failed schema
upgrade rollback/retry, repeated startup, generation-1/2 promotion without
normalization, interrupted manifest writes, missing/corrupt objects, original-byte
replacement, unchanged revisions/jobs and byte-identical artifacts. A >8 MiB
snapshot regression also exceeds the memo budget and verifies that nonretained
records reload without another normalization or lost evidence.

Verification: type check, UI build, 62 focused cache/migration/workspace/diagnostic
tests and the four cache tests after strengthening the memory-bound regression
passed. `benchmark:continuation` passed its exact-output comparisons. The full
`npm test` aggregate passed all 2,045 tests (948 pretests, 817 main, 280 posttests).
Both CLI help checks and the diff check passed. Browser automation and the user's
live project/model account were not exercised.

## Superseded saved-answer attention reconciliation (2026-11-11)

**Source → target: unchanged SQLite 68 / portable formats through 42.** Older
databases can retain a failed applied answer next to later successfully processed
corrections. The shared history resolver previously reconciled requirement reviews
only, leaving the old answer in Design and workflow decisions after newer work
finished. Repeatedly saving the answer could therefore consume more model calls
without clearing the historical attention item.

An older failed answer is now treated as superseded only when durable submission
order, timestamps, exact saved answer kind/text and the same-question source
`supersedes` chain prove a later answer was applied. The replacement's own pending
or failed review remains actionable; this is not inferred AI completion, freshness,
requirement approval or a new recovery allowance. Missing/invalid provenance,
conflicting replacements and unfinished overlap work remain unresolved. A valid
unapplied queued correction is displayed in Submitted rather than duplicating its
previous failed answer in the UI; actual reconciliation waits for durable application.

This is a read-time compatibility projection, including existing saved projects.
No original submission payload, diagnostic, source, job, paid receipt, fingerprint,
portable format or migration version is rewritten. There is no conversion to
interrupt or retry and startup requires no model work. Repeated SQLite reopen
tests check unchanged records, no phantom queue pause or workflow decision, no
inference and preserved source evidence. Malformed/broken/cyclic chains fail closed.

Verification: type check, UI build, focused history/workflow/recovery tests and the
workspace browser regression passed. The full `npm test` attempt exceeded the
120-second tool timeout during pretests and is not reported as a complete pass.
The supplied log export was inspected read-only; the live project/database and
model account were not modified or called. Restart the backend and reload to use
the shared resolver; this fix does not require resaving or reprocessing an already
completed replacement.

## Saved-response publication support recovery (2026-11-11)

**Source → target: SQLite 67 → 68; portable state up to 41 → 42 only when the
new support-review marker is present.** The transactional SQLite upgrade is a
reader-capability boundary. Startup does not rewrite project revisions, old stage
plans/keys, paid receipts, attempts, answers, proposals or completed results, and
does not start model work. Older portable projects remain readable and keep their
original export format unless this recovery is actually used. Downgraded envelopes
carrying the new marker are rejected without overwriting saved work.

A fully checked saved-response draft could previously fail publication because a
refinement referenced a background requirement whose linked file evidence was
intentionally absent from the original context. Repeating the same completed
batches could not repair that omission. Explicit continuation now retains all
original batches and checks, loads the exact target requirements and supporting
sources, and requests a separate check of the unchanged frozen draft. Nothing is
published until that check passes. The support check cannot rewrite the draft or
turn historical/file evidence into human decision authority.

The optional `submissionWork.publicationSupport` marker binds the exact context,
frozen draft and original paid receipt prefix, and retains its own four-attempt
ceiling and dated model/job receipt. Cancelled and malformed requests stay charged;
an explicit retry uses the remaining attempts, never renews them. A rejected
verdict stops unchanged retries without further calls. Oversized or changed support
fails closed without truncating evidence or resetting original work. Existing
per-action request/time limits still apply. The new check is additional semantic
work, not a representation-only reassessment or a claim that omitted evidence was
already reviewed. No wider tools/research permissions are introduced.

Curated upgrade/service tests cover 67→68 repeated reopen with unchanged original
jobs, successful recovery with one additional request and no repeated paid stages,
rejected/cancelled/malformed checks, charged explicit retry, changed/oversized
evidence, exhausted allowance without renewal, failed final-write retry without
another check, missing/tampered receipts and portable 42 round-trip/downgrade rejection.
Unsupported future support metadata rolls back the capability upgrade and can be
reopened after restoring the original payload, without resetting saved attempts.
The full `npm test` run passed 2,028 tests (947 pretests, 802 main, 279 posttests).
After further strengthening the regression fixtures, all six support-recovery
cases passed again, including the additional failed-write reuse case. Type checking,
UI build, specification/question-batch browsers and diff checks passed. The full
browser aggregate was not rerun for this backend fix. The real user's database and
model account were not modified or called; live recovery remains unqualified.

## Question-focused Design presentation (2026-11-11)

No stored-format or migration-version change. The existing feature selection now
appears in a Design-only bottom discovery bar, alongside the existing epic-gap
action. No selection or consent is written on navigation. Saved answers, history,
preferences, jobs, evidence and assessment fingerprints retain their existing
representation and meaning; no reassessment or reset is needed. Bulk question
tools remain accessible in Logs. There is no data conversion to interrupt/retry.

## Project-focused workspace presentation (2026-11-11)

**Source → target: unchanged SQLite 67 / portable formats up to 41.** Processing
controls move to Logs; normal Continue uses the same explicit workflow operation
and existing resumable task endpoints. Modes, browser preferences, original answers,
spent allowances, checkpoint identities, assessments and approval history are not
rewritten. No forward migration or reassessment is required. Restart/reload starts
no work. Additional saved-response and exploration allowances still use their
existing explicit confirmation fields and finite limits, without renewal on view.

The new downloaded log-view envelope (`format: 1`) is an informational export only,
not an importable project/portable format. It discloses loaded-only scope, caps at
250 records and 64,000-character diagnostic previews, redacts common credentials
and warns that project information may remain. Originals remain in storage.
UI/render tests preserve original inputs/preferences; the real review-recovery browser
checks retained originals/history, stale writes and save failure. Snapshot-only
assistance-browser reload checks do not replace existing durable engine recovery tests.
See [implemented scope and verification limits](project-focused-workspace.md).

The specialist follow-up also changes presentation only: implementation filters,
plan-review ordering and locations of advanced assessment/history controls. Normal
build-setup saves retain hidden prerequisites, assessment scopes/shared paths and
the explicit `reuseEquivalentScopes: false` choice. The planning browser exercises
that preservation against real local storage, plus reload/continuation of saved
planning checkpoints. No fingerprint, assessment semantics, format/version or paid
attempt counters change; existing work needs no conversion or repeated model calls.

## Plain-language requirement resolution (2026-11-11)

**Source → target: unchanged SQLite 67 / portable formats up to 41.** A new explicit
human operation resolves two exact current requirements through remove, replace or
combine. It stores existing confirmation/rejection sources and revision history;
there are no new persisted envelope fields, authority kinds or freshness rules.
Older workspaces open unchanged, including paid checks, pending proposals, original
answers and assessments. Startup performs no resolution or model work. No reset or
reassessment is required just to use the revised UI.

The authenticated, same-origin `resolve-requirements` API requires the current
project revision, two distinct active IDs and an explicit choice. Existing job,
unfinished-input, execution and unresolved-question gates still apply. Remove and
replace retire only the chosen record; the other record is unchanged. Combine
requires the human-reviewed statement, rationale and complete acceptance list within
existing schema bounds. It retains one stable ID, both originals' supporting source
IDs, exact original snapshots in human evidence/history, and marks the combined
wording human-approved, never answer-derived. No AI synthesis or silent concatenation
is authorized by the operation. The editor supplies an editable draft; opening or
selecting it changes no project state. More than eight examples must be consolidated
explicitly, never truncated. Pending suggestions overtaken by the direct decision
are dismissed, not falsely recorded as approved in their original form.

Writes are transactional and revision-checked. Failed validation leaves originals
unchanged; a stale or lost-ack retry cannot apply the same retirement twice. A save
whose acknowledgement is uncertain tells the user to inspect current state, not
that nothing changed. Drafts are retained while the comparison remains open. A
project change disables saving until the person reviews the latest pair; their
text is kept and the choice is cleared for explicit reselection. Closing without
saving changes nothing.

Read-only review reasons distinguish new behavior, suggested changes, missing
decisions, outdated suggestions and unfinished checks. Wording similarity is still
only a possible overlap, not a confirmed duplicate or a new review requirement.
Shared-answer conflicts show only exactly linked affected requirements, never
similarity-inferred relationships. Historical generated prose is kept in details.

Upgrade tests reopen older saved pairs without new jobs, reject a failed operation
without data loss, combine explicitly, then reopen repeatedly and round-trip portable
requirements. Additional tests cover all three directions, complete supporting
evidence, stale retries, malformed/oversized combinations and unfinished input.
No live-model or reported-personal-project recovery is claimed by these checks.

## Requirement update holds and focused resolution (2026-11-11)

**Source → target: unchanged SQLite 67 / existing portable formats (up to 41).**
No schema migration, evidence/fingerprint rewrite, assessment invalidation, startup
model call or automatic retry is introduced. On explicit publication/continuation,
the automatic-update gate now uses the existing `refinementIsStale` predicate:
an outdated pending suggestion is not a current competing replacement. Current
proposals, unfinished related input and linked unresolved questions still hold
actual changes. Authorization, complete evidence, exact target scope and original
staged verification checks remain mandatory. Prior suggestions and receipts are
not overwritten; normal successful-completion reconciliation retains withdrawal
history. Already-outdated legacy suggestions may remain available for dismissal.

An exact revision no-op (same statement, rationale and ordered acceptance scenarios)
records no new requirement authority, source links, approval or replacement. Human
input remains saved. New hold explanations separate the actual gate reason from
the proposed change; old reasons remain intact and are labelled historical in UI.

UI recovery projects existing submission/proposal IDs directly. Duplicate search
and ranked choices are local navigation, not semantic matching or merge authority.
Selected pairs survive filtering and are rechecked against the current revision
and pending-work gates before the existing atomic duplicate removal. No bodies or
scenarios are truncated. No changes are made to the surviving requirement.

Regression coverage includes stale versus current proposals, exact no-ops with
waiting input, a 600-item bounded picker, original blocker visibility and historical
hold labels. Existing reopen/future-format and cancellation/stale-worker tests remain
applicable. The supplied metadata-only diagnostics cannot establish its exact
publication error; recovery of that particular live project is not qualified.

## Exact serialized portable-snapshot computation (2026-11-11)

**Source → target: unchanged SQLite 67 / portable formats (up to 41); disposable
`portable_snapshot_cache` generation 1 → 2.** Only the derived computation changes:
the compressed cache now stores ordered exact JSON strings for scalar fields and
individual array records. Exports compare those strings directly, decoding each
distinct retained delta object only once. They still select the same jobs, revisions
and original evidence and emit identical artifact bytes. No assessment, context,
fingerprint, paid receipt, history, spent attempt or project revision is rewritten.

On demand, a generation-1 entry with matching original-source and decompressed-payload
SHA-256 digests is converted without repeating schema normalization. Source bytes are
checked on every read; existing revision-change invalidation triggers remain. New
entries use fast level-1 compression. Entry decompression remains capped at 64 MiB;
larger computed representations are processed without caching, never truncated.
There is no unbounded process-wide historical-project cache. The existing bounded
per-publication digest memo remains; `serializedRecords` measures serialization in
the delta phase, excluding records encoded while building/upgrading the snapshot cache.

Each conversion is one atomic cache-row replacement. Failure leaves original
evidence and the old row intact for retry. Missing, corrupt, mismatched or unknown
disposable generations rebuild from the original normalized evidence; none authorize
freshness, grant calls or retry model work. Older app versions can rebuild their own
derived representation. Unsupported future **source/portable** formats retain the
existing rejection rules; a disposable cache generation is not an evidence version.

Verified: type checking, 39 targeted portable/cache/workspace tests, the portable
browser check and the complete `npm test` run (938 pre-test + 789 main + 279
post-test = 2,006 passing tests),
including generation-1 conversion, injected conversion-write failure/retry, repeated
file-backed reopen, unchanged original bytes, corrupt/stale caches, >8 MiB snapshots,
independent legacy artifact comparisons, clone/adoption and capped-heap publication.
The extended `npm run benchmark:continuation` checks all result bytes against an
independent generation-1 reader. In a synthetic 64-snapshot/1,600-record in-memory
SQLite fixture, cold computation was about 1.11s versus 1.27s; warm computation
about 0.48s versus 0.62s. Initial conversion was about 0.85s and performed zero schema
normalizations. A subsequent run measured about 0.46s versus 0.58s warm; compressed
cache rows occupied about 925kB versus 858kB (roughly 8% more). Faster compression
can trade additional disposable local storage for less CPU. These are fixture
timings, not resolution of the observed 45-second
real-project pause. No live calls or user database edits were made.

## Saved-response declaration guidance (2026-11-11)

**Source → target: unchanged SQLite 67 / portable formats (up to 41).** The
prompt-only saved-response draft schema now restricts question/requirement local
aliases to nonempty `new:` strings. Instructions recommend omitting unused aliases
and require uniqueness across both arrays, including retained draft declarations.
Cross-array uniqueness remains enforced by the existing acceptance validator;
schema guidance is not proof that a model will comply.

No migration or receipt rewrite is needed: the persisted response parser, accepted
draft semantics, exact context/plan keys, verification rules and request allowances
are unchanged. Invalid declarations still fail atomically, never receive fabricated
IDs, and do not publish a partial result. Explicit continuation retains the spent
attempt and saved schedule; startup does not retry a model call. This prevents a
prompt/schema mismatch, not automatic recovery of rejected response text.

Verified: type checking and 138 targeted saved-response, discovery, clarification
and workflow-resilience tests. Added tests cover omitted/valid/malformed aliases,
cross-array duplicates, no partial publication, two file-backed reopens and explicit
continuation charging attempt two. No live model call or user-data edit was made.

## Empty discovery completion and exact continuation computation (2026-11-11)

**Source → target: SQLite 66 → 67; conditional portable format 41.** This is an
ordered transactional reader-boundary migration. It validates bounded saved
empty-completion protocols, rejects future variants without committing the upgrade,
and does not rewrite any human input, paid receipt, assessment, exact context,
plan/evidence key, history, completed check or spent attempt. Repeated startup starts
no inference and never adopts the new policy for already-started work.

Only new staged discovery ledgers bind `completionPolicy: empty-proposals-v1`.
Every mandatory discovery batch must finish, even when early batches find no gaps.
If no questions/requirements remain after those reads, or a later verification
receipt removes the final proposal, the app saves the explicit terminal outcome
`emptyCompletion: no-surviving-proposals`. It does not create positive verdicts or
credit unrequested checks. Replaying the original receipts must prove that this is
the first eligible empty boundary and that the saved draft is exactly empty. A
surviving proposal still requires every original verification batch. Conflicts,
missing evidence, malformed output, stale inputs, cancellation and finite paid
attempts keep their existing safeguards. This is not a completeness/readiness or
implementation approval. Old ledgers continue their original full schedule with
unchanged counters; no completed work is invalidated or repeated for this upgrade.

Portable exports require 41 only when this new completion policy/report is present,
including unfinished new schedules. Older exports retain their existing formats;
new payloads cannot be relabelled as format 40 or earlier. Export/import retains
exact original receipts and evidence, and neither reload nor adoption starts calls.
The browser distinguishes an empty outcome from “all parts checked.” New local
metrics report current proposal counts and checks not requested; older metrics stay
unknown. No proposal text or IDs are added to the diagnostics export.

Continuation delta generation now serializes each historical array item once for
comparison/interning, and reuses exact-string SHA-256 results within that publication.
The disposable hash-key memo retains at most 8 MiB of UTF-16 key characters and
declines entries over 64k characters; uncached records are still fully processed.
No historical snapshot is deleted, no persisted cache format changes, and every
continuation delta/object/artifact byte remains identical to the prior encoder.
This computation cache does not establish semantic freshness or source authority.

Completed continuation builds now record selection, historical snapshot loading and
delta-processing durations plus serialization/hash counts. These numeric allowlisted
details are nested inside total publication time, not additional elapsed time.
Incomplete profiles are omitted after failure rather than manufacturing completed
phase timings. Snapshot selection/normalization inside the selection phase remains
included in selection time. The change does not yet move publication to another
thread or establish that the observed 44-second real export delay is resolved.

Synthetic measurements: empty 16-batch discovery used 16 actual calls rather than 32;
a proposal first found in the last batch still received every check. A 315-snapshot,
400-record continuation fixture produced identical output with 1,344 SHA-256
computations instead of 126,630, and about 0.88s versus 1.27s for the measured paths.
These are fixtures, not live semantic/latency qualification or user-project export
timings. `npm run benchmark:continuation` runs the no-model comparison.

Upgrade/recovery tests cover old paid empty ledgers, repeated reopen, retained spent
attempts, transactional failure/retry for future policy data, explicit new-format
portable round trips/downgrade rejection, late proposals, final-proposal removal,
stale/cancelled empty replies and no-call reuse of retained empty completion. Export
tests retain independent byte-for-byte comparison and capped-heap historical loading.
Verified: type checking; targeted boundary/upgrade tests; UI build; the benchmark;
the complete browser suite including post-test checks; and the full `npm test` run
(936 pre-test + 789 main + 277 post-test = 2,002 passing tests). An older pause fixture
now retains a proposal until verification instead of returning an empty draft that
correctly finishes early. Diff whitespace checks passed. No live model call or
user-database modification was made.

## Measured individual-answer packing and input-change diagnostics (2026-11-11)

**Source → target: unchanged SQLite 66 / portable formats (up to 40).** New
individual saved-input schedules use measured lossless wire size instead of the
36,000-character raw-record partition. The 96k input ceiling, complete 18k draft
reserve, 32-batch maximum, per-step attempts, exact evidence membership and mandatory
read/frozen-draft-check passes are unchanged. A small additional metadata reserve
covers later two-digit batch/step counters. Records are never truncated or omitted;
missing supporting originals still require the existing exact-evidence lookup.

No forward rewrite is needed: the existing persisted batch list and its plan key
already identify the exact schedule independently of the planning algorithm.
Previously started work resumes its saved batches, wire contexts, receipts and spent
attempts. Completed work is not invalidated. Startup/reopen does not repack schedules
or start model calls, and a failed request cannot obtain a fresh allowance through
this change. Existing publication, cancellation, stale-input and recovery rules apply.

Local discovery metrics gain optional allowlisted `epicSelection.inputChanges`
categories. For a new incompatible package check, compare its latest completed
same-package check with the current candidate: target records, human sources, other
detailed evidence, project guidance, context policy, batch layout and exact input key.
Evidence comparisons use the union of old/current detailed IDs and guardrail batches,
not every unrelated record. These are observed structural differences, not proof of
semantic impact or a complete causal explanation. Revision counters alone are not
evidence changes. Missing historical snapshots are explicitly unavailable; old
diagnostics remain unknown and are not backfilled. No IDs, hashes, text or model
identifiers are added to the diagnostics export; local metrics remain excluded from
portable continuation. Assessment/freshness identities and matching are unchanged.

Upgrade coverage builds an old 36k schedule using the previous algorithm, persists
paid work and two spent next-step attempts, reopens twice, resumes only unfinished
steps, and round-trips its unchanged ledger through portable export/import. New
packing tests check lossless expansion, complete read/check coverage and draft
headroom with both repeated and uncompressible text. Oversize/cancellation/stale
recovery coverage remains in the existing staged-input suite.

Measured synthetic benchmark: 153 records, 9 legacy batches / 18 minimum requests
versus 5 measured batches / 10 requests. This used a deterministic no-inference
adapter, not a user project or live latency qualification. Cross-feature answer
sharing, broader freshness reuse and portable publication acceleration are not
implemented by this change.

Verified so far: type check; focused staged-input, diagnostics and epic-review tests;
the updated shared-answer comparison; UI build; specification browser check including
oversized saved-review continuation/reload recovery; synthetic submission benchmark;
diff whitespace check. The `npm test` pre-test/main phases passed 935 and 785 tests;
its first post-test phase passed 276/277 after loading the old 90-request comparison
before that expectation was updated to the measured 50. The complete post-test
rerun passed 277/277 against the final files (1,997 tests across the three phases).
No live model call or user-database modification was made.

## Independent question generation and balanced scheduling (2026-11-11)

**Source → target: unchanged SQLite/portable formats.** No forward data migration is
needed: this changes dispatch instructions and feature scheduling only. No schema,
assessment semantics/fingerprint, material key, package identity, exact context data,
saved schedule, receipt, answer, question or counter is rewritten or invalidated.
Completed/saved results retain their original meaning; the app does not regenerate
existing questions or repeat paid work solely to apply the new guidance. Subsequent
model turns receive the new generation/selection guidance under their original budgets.

Feature packages with fewer unanswered decisions are considered first; equal counts
retain existing feature order and explicit focus remains enforced. Package contents,
dependency waiting checks and saved recovery protocols stay intact. Staged checks use
their existing unchanged-index subset protocol to remove overlapping/dependent draft
questions. One-shot paths have generation guidance, not a new verification request.
Semantic independence is model judgment, not a new readiness or consistency guarantee.

Deterministic coverage exercises scheduling for pending/deferred/delegated decisions,
explicit scope, unchanged source state, generation/check instructions, exact subset
selection and the existing reopen/paid-receipt recovery flows. Live model behavior
has not been qualified for this policy.

Verified: `npm run check`; 163 tests across core epic review, service epic planning,
readiness questions, question batches and provider ChatGPT fixtures; `git diff --check`.
No UI change or live model call was made.

## Union layouts use the already-adopted group budget (2026-11-11)

**Source → target: SQLite 65 → 66; conditional portable format 40.** Ordered,
transactional reader-boundary migration only: no project, assessment/fingerprint,
human decision, paid receipt, context, draft, plan identity or usage is rewritten.
Startup never adopts permissions or starts inference. Old layouts keep their exact
format and limits. Only newly saved v13 layouts require portable 40; downgraded
envelopes and unsupported future formats reject without replacement. Failed startup
rolls back the version/history, preserving payloads for supported reopen/retry.

After the user saved a repair-stage decision, the real revision-3401 run completed
one repair (122 replies/requests total) and needed a 69-page verification layout.
Union verification already had explicit prefix-bound adoption of the shared
256-page group budget, but v12 independently stopped layouts at 64. This was a
layout/step policy mismatch, not another product choice or an input-size verdict.

New v13 layouts may exceed 64 only at that adopted union verification cursor and
under existing guarded input adoption. Earlier v1–v11 layouts retain 32 and v12
retains 64. Ordinary reads and unadopted/legacy verification cannot use v13. Every
previous paid page still counts toward cumulative step/group limits; no request,
repair, attempt, layout, byte, 96k ordinary-input or guarded 200k ceiling increases.
The 32-request service window and cancellation charging remain unchanged. Every
page includes the complete repaired draft and required original support; all pages
must pass before publication. Historical old-draft checks never discharge new work.
Oversized indivisible pages still require fresh selected-model whole-prompt capacity
admission; v13 is admitted only as a check profile, not as a read/repair shortcut.

Read-only real-checkpoint preflight and full receipt/layout replay passed with
**122 paid replies, one repair decision, unchanged repaired draft, attempts and
request counters**. The new layout has **69 pages**; its first page is **94,732 /
96,000 characters**. Prior successful page replies total 103, including 65 against
the union cursor, so planning these 69 stays within the unchanged 256-page budgets.
No real database/folder writes, model calls or semantic verification verdicts were
made. An initial raw-JSON inspection lacked normal project schema normalization
and failed material-key validation; the app-equivalent schema-normalized inspection
passed without modifying saved data.

Tests cover complete >64-page verification with exact decoded originals/draft,
no premature completion, unchanged old layouts, adoption rejection, repeated
65→66 startup, paid-page reopen and empty-store clone continuation, downgrade,
future-format rollback/retry and prefix/page tampering. Verification passed in
stages: **932 pretests + 782 main tests**, followed by the final **277/277 posttest
rerun** (1,991 total), type check, 15 capacity tests, focused shared-answer browser
regression, UI/desktop build and diff check. Earlier full runs exposed historical
fixtures still using now-supported format 13 as their unsupported-future example;
those now use 14. One earlier timing-sensitive timeout test also failed, then passed
in both later posttest runs. The final full `npm test` invocation stopped at the
last obsolete future-format fixture; the complete posttest phase passed after its
correction. No full browser suite was rerun for this non-UI change. Desktop rebuild
passed after the user fully quit the app; no processes were terminated. Live
post-upgrade verification remains unqualified.

## Workspace entry point for saved-answer conflicts (2026-11-11)

UI-only discoverability fix; SQLite 65 / conditional portable 39 are unchanged.
No persisted data, fingerprints, budgets or saved evidence change, so no forward
migration is required. A workspace-level **Resolve saved-answer conflict** notice
opens the existing decision dialog directly from Design or any workspace tab.
It selects current revision/project jobs with annotated clarification and complete
current submission ownership; archived, superseded, completed, running and stale
cohorts do not surface. Multiple inputs in one cohort produce one action. Opening
or reloading starts no inference and establishes no product preference.

Read-only inspection of the actual revision-3401 snapshot produced exactly one
workspace action, retaining 121 paid replies and no saved repair decision. No real
project writes or model calls were made. Selector/render tests cover exclusion and
cohort grouping; the browser regression now enters from Design without locating a
requirement and exercises reload, explicit selection, save/continue and retained
paid work through the existing dialog.

Checks run for this UI fix: type check, all 31 review tests, focused shared-answer
browser regression, UI/desktop build and diff check passed. The desktop build first
hit a locked native module while Electron remained running; it passed after the
user fully quit the app, without terminating processes. The full browser suite and
postchecks also passed; live post-decision inference remains unverified.

## Human decisions during carried-draft repair conflicts (2026-11-10)

**Source → target: SQLite 64 → 65; conditional portable format 39.** This ordered,
transactional reader-boundary migration rewrites no snapshots, original answers,
drafts, paid receipts/contexts, usage, leases, material/plan identities or semantic
assessment fingerprints. Startup never invents a decision or resumes inference.
Old initial-read clarification formats and completed work remain compatible. Only
new `repairClarifications` require portable 39; downgraded envelopes reject without
replacement. Unsupported future note formats roll back startup and retain the
original payload; restoring supported evidence permits reopening/retry.

The actual revision-3401 task reached a genuine overlap between immediate summary
display for a connected partner waiting to appear and withholding a returning
player's summary until the outcome is confirmed. Neither original answer explicitly
settled precedence. The app correctly blocked rather than choosing, but its decision
form only handled initial reads. Pressing Play could not provide missing human intent.

The existing inline **Two earlier answers disagree** form now also supports a failed
**repair-stage** blocker with a carried draft and exact named original answers. It
shows the overlap reason, both saved questions/answers, unselected priority choices
and a custom exception field. **Save decision & continue** saves the explicit choice
then continues specification review; no extra Play click or coding starts. Reload
starts nothing, and durable-save/continuation failure still offers **Continue review**.
Generic check-stage blockers, exhausted safety limits and unidentifiable conflicts
are not silently admitted under this repair-only protocol.

Each append-only v2 repair note binds the exact blocked receipt prefix, source job,
conflicting-answer IDs and whole carried-draft hash. It opens that rejected repair
only, supplies no verification verdict, and preserves all paid reads, prior checks,
attempts and request/repair budgets. The complete note, original conflicting answers
and their support are detailed together. After two earlier repairs, a fresh saved
human decision is a distinct evidence witness for its supplied affected rules; it
is not another attempt allowance or permission to alter unrelated carried actions.
The repair must concretely change an affected statement/scenario or withdraw a wrong
affected draft edit. It need not cosmetically change an already-correct counterpart.
All original verification restarts after an actual repair, never from the new note alone.

Earlier model rejections are feedback, not human precedence. A new follow-up supersedes
only a prior note for the **same exact conflict**; disjoint decisions retain separate
scope/authority. Notes and both original answers remain evidence, with only current
unsuperseded decisions eligible to authorize updates. At most eight human notes total
are retained by this flow; all existing request, repair, page, input and ledger caps
remain in force. Workers cannot discard notes, change their prefix/draft or substitute
a decision. The existing authenticated/revision-checked save API and exact human-saved
parent/prefix checks also protect carried-draft notes and portable adoption.

A read-only real-checkpoint check admitted the decision form and a clearly marked
**non-product test note in memory only**. It preserved **all 121 paid replies, 121
requests, current attempt 2 and the carried draft**. Both conflicting answers and
the new test note fit in the complete repair at **124,427 / 200,000 characters**, and
the new human witness identified two detailed affected rules. No product choice,
real database/folder write, model request or semantic repair verdict was made.
The first redundant multi-replay measurement exceeded its 120-second shell timeout;
a smaller read-only check completed. Large-ledger validation can still be slow.

Verification passed: full `npm test` rerun (**932 pretests + 781 main tests + 272
posttests = 1,985 tests**, zero failures/skips), full browser suite/postchecks,
type checking, desktop/UI build and diff checking. Coverage includes initial and repair-stage decisions,
unselected choices, exact parent/draft/prefix preservation, one-target corrections,
withdrawal/no-op checks, full re-verification, cancellation, scoped follow-ups,
separate conflict authority, repeated reopening, actual empty-store cloning,
future-format rollback/retry and downgrade/tampering rejection. The first full run
found three older diagnostic-wording assertions and one unrelated timing-sensitive
timeout failure. Original initial-conflict wording was preserved; those tests and
the isolated timeout test passed, followed by the full passing rerun without browser
contention. The desktop was rebuilt after the user closed the app; no processes
were terminated. Live repair quality and installed packaging remain unqualified.

## Union verification shares the existing group page budget (2026-11-10)

**Source → target: SQLite 63 → 64; conditional portable format 38.** This is an
ordered transactional reader-boundary migration. Startup changes no snapshots,
assessment/material/plan identities, human evidence, paid packets, usage, grants or
leases, and does not adopt the policy or start inference. Existing selections and
completed valid work remain intact. Unsupported future policy formats roll back
startup without overwriting the original payload; restoring supported data allows
reopening/retry. Only work carrying `unionPageCapacity` requires portable 38; older
supported envelopes remain readable and downgrade rejects without replacement.

**Confirmed policy change, explicitly approved by the user.** After the next negative
verification and second successful repair, the revision-3401 group required 36 new
checks. Its 29 earlier paid checks plus 36 pending checks exceeded the cumulative
64-page *original-step* cap by one. Unlike the prior per-layout mismatch, this was a
real cumulative-budget stop: old checks still consume spend but cannot verify the
changed draft. A union combines 24 original read batches into one verification
cursor, making that cap tighter than the already-existing whole-group safeguards.

Explicit Play may now append `unionPageCapacity: { format: 1, fromReceipt, prefixKey }`
at the exact authenticated paid prefix of a Play-owned `union-v1` group. **Only its
combined verification cursor shares the existing 256-successful/pending-pages group
budget.** This is not a separate extra 256 pages: all earlier read and verification
pages remain counted against the same group ceiling. Read steps and legacy/unadopted
groups retain their 64-page cap. Repeated Play/continuation retains the first boundary;
workers cannot replace or discard it. Historical replay applies the old capacity
until that boundary, preserving every old layout and context hash byte-for-byte.

No request/attempt/work-window/repair allowance is increased or refunded. The 256-page
group ceiling, 256 Play-request cap, 64-page v12 layout ceiling, 128 layouts, 1,024
receipts, 2-MiB ledger, input bounds and fresh selected-model admission stay intact.
The normal 32-request bounded action still pauses for explicit continuation; owned
continuous Play keeps its existing window behavior. Full verification restarts after
each repair. No old-draft verdict is reused as approval of changed actions, and paid
original reading is not replayed. This remains potentially many model requests; it
does not establish semantic convergence or promise completion before global stops.

Diagnostics include the metadata-only activation receipt and report the current
page-budget scope as `shared-group` or `original-step`, with the effective step limit.
No prefix hash, source/job IDs or model/human prose enter the diagnostic projection.
The policy itself is local/portable continuation evidence, not a completeness score
or a new semantic assessment fingerprint.

Read-only actual-checkpoint replay preserved **80 paid replies / 80 requests** and
the complete twice-repaired draft. After in-memory adoption, all **36 current packets**
passed exact wire expansion for their detailed originals, full draft and every pin,
with all original read-batch records covered. Sizes were **75,002–106,768 characters**.
The simulated totals were **65 checks for the union step**, **103 / 256 group pages**
and **116 / 256 Play requests**; all old spend remained counted. Positive replies
were cursor simulations only: no real verdict was saved, user database/folder written
or model request made. Future model lookups/rejections may still change the work needed.

Verification passed: full `npm test` (**932 pretests + 781 main tests + 268 posttests
= 1,981 tests**, zero failures/skips), full browser suite/postchecks, type checking,
desktop/UI build and diff checking. Targeted coverage includes explicit Play
adoption, unchanged counters, no old-check reuse,
full checks across an unchanged 32-request work window, read/group caps, repeated
reopen, actual empty-database clone adoption, future-format rollback/retry and
downgrade/tampering rejection. Cancellation retains its charged request, exact
policy boundary and full draft; repeated adoption cannot renew it. Diagnostic
scope/redaction also passed. The desktop was rebuilt after the user closed the app;
no processes were terminated. Installed packaging and live model completion remain
unqualified.

## Joint layouts within the existing paid/pending step budget (2026-11-10)

**Source → target: SQLite 62 → 63; conditional portable format 37.** This ordered,
transactional reader-boundary migration rewrites no project, assessment, material/plan
identity, human answer, saved draft, paid reply, attempt, grant or lease. Existing
page formats 1–11 retain their exact rendering, packet hashes and 32-page layout cap.
New page format 12 requires portable 37; older supported envelopes remain readable.
Downgraded v12 envelopes reject; unsupported future page formats roll back startup
without overwriting payloads and permit reopening/retry after correction. Semantic
assessment freshness and evidence identities are unchanged. No reset or inference
is needed on upgrade; continuation is still explicit.

The revision-3401 repair succeeded and retained its paid reply. The restarted union
verification then required **36 complete pages**. Format 11 hit its independent
32-pages-per-layout cap, although the **10 earlier paid verification pages + 36
pending pages = 46** remain within the existing 64-paid/pending-pages-per-original-step
budget. Earlier checks still count as paid usage but do not verify a repaired draft.

V12 keeps v11's exact unit construction, lossless encoding, ordinary **96k packing
target**, complete-draft/pinned-answer rules and guarded **200k indivisible-unit ceiling**.
Only its per-layout capacity may reach the remaining existing step budget (at most
64). The cumulative **64 pages per step**, **256 successful/pending group pages**,
**128 layouts**, **1,024 receipts**, **2-MiB ledger**, attempt/request/repair limits and
model-capacity admission are unchanged. It does not fill background pages to 200k,
split indispensable comparisons, refund earlier pages, repeat reads or mark partial
verification complete. All mandatory pages must check the same frozen full draft.

Preparation retries v12 only for an otherwise eligible layout-cap stop with the
existing input-capacity policy active. Other work-capacity stops and genuinely unfit
units are not caught as layout recovery. The new plan is appended at the exact paid
prefix; historical layouts are not relabelled. Diagnostics recognize page format 12,
and oversized v12 requests pass the same fresh exact-model/whole-prompt admission as
v11 before session creation. Missing/small capacity still rejects without fallback.

A read-only traversal of **all 36 actual-checkpoint packets** completed an in-memory
cursor simulation, not a semantic/model verification. Independent wire expansion
matched every detailed original, the complete saved draft and every pinned answer in
every packet; all original read-batch records were covered. Packets measured **70,222–
105,371 characters**; three used the guarded ceiling. Exactly one new layout was
needed, preserving all **57 paid replies**, attempts and usage before simulation.
The simulated page total was 46 for this original step. No user database/folder was
written, no real verdict was recorded and no model call was made. This qualifies the
entire current layout, not future model verdicts or final specification completion.

Verification passed: full `npm test` rerun (**932 pretests + 781 main tests + 264
posttests = 1,977 tests**, zero failures/skips), full browser suite/postchecks,
type checking, desktop/UI build and diff checking. The initial full run had one
unrelated timeout assertion fail under concurrent browser load; it passed alone
and in the full rerun without browser contention. No unrelated test was weakened.
Tests cover exact full-packet expansion, no early completion, full original coverage,
the unchanged cumulative ceiling, old-layout rejection above 32, paid-page preservation,
future-format rollback/retry, repeated reopening, actual empty-database clone adoption,
downgrade/tampering rejection and v12 pre-session capacity admission. The desktop
was rebuilt after the user closed the app; no processes were terminated. Live model
verification/completion and installed packaging remain unqualified.

## Guarded capacity for complete rejected-comparison repairs (2026-11-10)

**Source → target: SQLite 61 → 62; conditional portable format 36.** This ordered,
transactional reader-boundary migration rewrites no project/assessment identities,
original answers, saved drafts, paid receipts, counters, leases or completed work.
Existing v1 repair contexts and their authenticated packet hashes stay unchanged.
New v2 repair contexts require portable 36; older formats remain readable, downgrade
rejects, and unsupported future repair formats roll back startup without overwriting
the original payload. Correcting that unsupported payload allows reopening/retry.
Startup performs no inference, publication or automatic continuation.

The revision-3401 five-answer group completed its original reading and rejected its
first frozen-draft verification. Its complete bounded repair measured **103,286 /
96,000 characters**. Unlike the earlier broad-background repair bug (SQLite 48),
this packet already contains only the selected rejected comparison, full pinned
answers/support and complete carried draft, using lossless encoding. The existing
200k policy covered indivisible read/check pages but not this indivisible repair.
The latest retry made zero model calls; its retained run has 56 paid replies.

New preparation first tries the unchanged v1 bounded repair. Only if that complete
packet overflows, and the exact Play/OpenCode model's existing input-capacity boundary
is active, may it append v2 at the current authenticated receipt prefix. The same
named originals and complete recursive support stay together with every pinned answer
and the entire draft. V2 uses the existing compact lossless grammar and **200,000 hard
ceiling**, not a larger ordinary packing target. It does not split comparisons,
discard draft actions, pick human precedence, renew attempts or repeat paid reads.
Without the capacity boundary, the existing 96k stop remains. A paid v1 context is
never silently relabelled or widened. All verification must restart after a repair.

Large repair dispatch carries an explicit v2 repair profile, separate from v11
read/check paging. The existing fresh selected-model/whole-prompt admission still runs
before creating any session or sending a prompt. Missing/insufficient metadata,
direct routes, mixed/wrong profiles and >200k inputs fail closed; no provider/model
fallback or truncation is introduced. The full advertised output reserve, runtime
headroom and conservative UTF-8 admission proxy remain unchanged. Bytes are not tokens
and advertised metadata does not qualify live account acceptance or model quality.

A read-only actual-checkpoint preflight now fits the same **103,286-character** packet
under that existing guarded ceiling. Independent wire expansion matched **all 46
detailed original records and the full saved draft**, with all pins present. All 56
paid replies, request count 56 and current attempt 1 remain unchanged. The complete
app prompt measured **132,828 characters / 132,920 UTF-8 bytes**; missing capacity
metadata correctly rejected it. No real database/folder writes or model calls were
made. This is layout/replay qualification, not a semantic repair/completion verdict.

Verification passed: `npm test` (**932 pretests + 781 main tests + 260 posttests =
1,973 tests**, zero failures/skips), full `npm run test:browser` including postchecks,
type checking, UI/desktop build and diff checking. Focused checks also covered exact
packet expansion, sufficient/missing/smaller capacity, pre-session rejection,
old-context compatibility, full re-verification, cancellation/malformed responses,
retained usage, future-format rollback/retry, repeated reopen, actual empty-database
clone adoption and downgrade/tampering. The first desktop build hit Windows `EPERM`
on the app-local SQLite native module; retry passed after the user closed Reqwizit.
No process was terminated. Installed packaging and live model completion remain
unqualified.

## Exact portable selection and initial lossless shared packing (2026-11-10)

**Source → target: SQLite 60 → 61; conditional portable format 35.** The transactional
reader-boundary migration rewrites no project snapshots, answers, human clarification
chains, assessments, paid ledgers, plan keys or usage. Existing schedules retain their
encoders and hashes. New service-created shared groups bind `packingPolicy: lossless-v1`
into the original plan key. Unknown future packing rolls back startup; restoring the
original supported payload permits retry. Earlier portable formats remain readable;
new packing requires 35 and rejects downgraded envelopes. No reset, reassessment or
automatic model request is needed for upgrade.

Queue grouping preflight now uses the same new union/lossless planner as dispatch,
rather than rejecting a group under the legacy encoder first. It uses the existing
compact exact-text/identifier/record-table grammar (including bounded literal phrase
pooling) from the first packet. The 96k ordinary limit, complete evidence, full 24k
draft-growth reserve and every verification/attempt limit remain unchanged. Packing
cannot split an indispensable joint comparison or omit a human answer. Old paid
groups are never relabelled to the new policy. Read-only revision-3384 preflight of the
reported five-answer set reproduces the old **97,358 / 96,000** failure; the new planner
fits all originals in **22 read batches**, with all 11 pins and 293 non-pinned records.
The first Play-owned packet also fits at **70,456 characters**, retaining the full
24,000-character draft reserve inside 96,000. Both checks ran in memory/read-only.
This is a layout check, not live model quality/completion or a promised call count.

Portable selection now uses the **existing engine refinement-currentness predicate**
for completed, unreferenced individual cleanup checks. Matching current outcomes stay;
known v2 mismatches and legacy mismatches authenticated against their original evidence
are omitted only from the derived export. Unknown identities/unavailable legacy proof
are retained conservatively. Previously retained unfinished work and explicitly linked
completed outcomes remain. Original SQLite history, stable IDs and dated evidence are untouched.
The identity code moved to `src/core/refinement-identity.ts`; service compatibility
exports and key bytes are unchanged. Legacy checks read all required source/question/
requirement/feature arrays in original order via a validated SQLite projection, not
unrelated large assessment payloads. This projection grants no authority to another task.

Required retrieval ancestors are now sanitized through one local graph walk instead
of recursively constructing full exports/snapshots and discarding everything but one
job. Ancestors remain even if not current standalone tasks; shared ancestors and cycles
do not repeat traversal. Retained job/snapshot formats and semantic fingerprints are
unchanged, so selection itself needs no new portable representation or history migration.

The real current checkpoint's read-only projection selected **396 jobs / 282 snapshots**
instead of its saved **1,501 jobs / 605 snapshots**, omitting 1,105 proven-stale completed
individual checks. Preparation/rendering took about **52.5 seconds** using existing
verified cache entries (zero full snapshot normalizations). The recorded application
publication was 184.7 seconds, but these are not controlled identical end-to-end runs.
The projected artifacts still total about **55.5 MB**; remaining cost is not claimed
fixed, and old cache rows are not deleted. No project database/folder was changed and
no inference was used by these measurements.

Workspace publication adds numeric selected-job/snapshot counts. Discovery diagnostic
exports can now include the **latest recorded workspace publication attempt** with
explicit scope, revision and current workspace status, independently of selected runs.
It is not necessarily a successful save or a measurement of the selected run.
Durations overlap phases and are not
automatically additive to job wall time. Old/missing/invalid measurements remain absent;
paths, errors, prompts, timestamps and other arbitrary fields are excluded.

Verification: type checking, desktop build, full `npm run test:browser` (including
postchecks), both CLI help commands, targeted packing/upgrade/portable checks and
full `npm test` passed (**932 pretests + 781 tests + 253 posttests = 1,966 tests**,
zero failures/skips). `git diff --check` also passed. Coverage includes exact
Unicode/whitespace expansion, unchanged input/reserve bounds, future-policy rollback,
old/new paid work reopening, downgrade rejection, current/unknown/linked outcomes,
legacy proof, missing required evidence and ancestor cycles. Shared question discovery
remains a documented proposal, not a
new live protocol. No installed-app or live-model qualification is claimed.

## Follow-up decisions after a rejected clarification (2026-11-10)

**Source → target: SQLite 59 → 60; conditional portable format 34.** The transactional
reader boundary retains the original singleton `humanClarification` verbatim. Only
an explicit new human action appends `humanClarificationFollowups`; startup never
rewrites notes, paid replies, original context hashes, input/plan identities, attempts,
assessments or completed work. Existing portable formats through 33 remain readable.
Follow-up ledgers require 34; downgrade/future formats fail without overwriting data.

This closes a real UI trap: after a model rejected the first clarification as unclear,
the earlier card offered only continuation of the same blocked note. If the unfinished
initial read still has no completed draft/read/check and allowance remains, another
blocked reply now exposes **Your decision needs clarification**, the earlier note,
current feedback and fresh unselected priority/exception choices. A follow-up explicitly
replaces the previous clarification for that conflict, not either original answer or
unrelated decisions. The earlier note and blocked replies remain dated evidence.

Each appended note has a new stable source ID, `supersedes` pointing to the prior human
note, and its own exact blocked-reply/prefix boundary and human-saved parent. Only one
note can be saved per blocked reply; ordering, unique IDs, ancestry and retained
prefixes are validated across checkpoint, replay, reopening and portable adoption.
At most eight human notes can be retained; existing request/failure limits still apply
and no allowance is renewed. Later conflicts with completed drafts/checks remain out
of scope. If follow-up feedback omits UUIDs, the card retains the already named conflict's
scope rather than inventing another unnamed conflict or interpreting prose as priority.

Every resumed packet contains the full original conflict evidence and saved notes,
with explicit current replacement authority. Dispatch authorization now includes the
current human note as concrete input; historical notes remain non-authorizing. This
corrects request advice only, not historical paid packet bodies or verdicts. Publication
adds all dated notes and the verified result atomically, preserving the supersession
chain. No semantic resolution is inferred merely because a human note exists.

**Checks:** deterministic 59→60 preservation/repeated startup, invalid future-format
rollback/retry, exact prefix/supersession tampering, portable 34/downgrade/clone,
retained attempts and complete post-follow-up verification passed. The targeted browser
check reproduces a rejected first clarification with UUID-free feedback, fresh choices,
save/continuation recovery, retained first note and checked replacement wording. Type
check and UI build passed. All 219 relevant answer-group, specification, migration,
portable, UI and API tests passed, as did the full `npm run test:browser` main and
posttest suites.
No live provider calls or private project data edits were made.

## Inline shared decisions and explicit continuation (2026-11-10)

**Compatibility: SQLite remains 59; portable format remains conditional 33.** This is
an additive UI/API workflow over the existing `humanClarification` representation,
not a new evidence format, fingerprint or assessment interpretation. Existing answers,
paid receipts, attempt counters, checkpoints, saved decisions and completed results
are not migrated or regenerated. Opening/reloading a project starts no model work.

Blocked requirements now show the exact original questions/answers inline, with no
preselected choice. Selecting an original answer records explicit user-selected
precedence only for overlapping cases, retaining its exact text/question and stable
source IDs. A custom exception/different rule remains available. No model generates
or chooses the user's answer. Oversized or missing originals cannot become selected
precedence through a truncated note; users can write their decision instead.

**Save decision & continue** calls the existing clarification route with explicit AI
consent, expected project revision and displayed workflow settings version. Stale or
missing consent/version rejects before saving. After the transactional save succeeds,
the service invokes the existing Play action. A continuation failure acknowledges
`saved: true, continued: false`, rather than misreporting a failed save; the UI can
explicitly continue without replacing/re-entering the durable decision. The legacy
save-only request remains valid and makes no model calls. A repeated combined save
cannot silently rearm work. Provider errors and genuine remaining ambiguity still
stop; input, quota and complete-verification bounds remain unchanged.

Inline progress follows the affected cohort, not an unrelated active job. A requirement
being resolved stays visible through completion and reports changed/unchanged wording
only after its affected responses are completed. These display selections/comparison
snapshots are transient UI state, not persisted assessments or proof of readiness.
The initial-conflict eligibility boundary from the migration below is unchanged;
later carried-draft conflicts are not newly supported.

**Checks:** deterministic consent/version guards, durable continuation-failure
acknowledgement, exact original-choice serialization, custom exceptions, no default
choice, escaping and cohort matching added. Targeted Chromium verification passed
for one-action inline review, original history/attempt retention, progress/completion,
mobile, reload, an explicit source choice, and save-success/continue-failure recovery
without a second decision write. Type check, UI build and relevant UI/API tests passed.
The full `npm run test:browser` main and posttest suites also passed, including the
new inline path and durable continuation recovery. These fixture results do not
establish that any particular private project's semantic conflict is resolved.
No live model calls or private project data changes were made.

## Initial shared conflict human clarification (2026-11-10)

**Source → target: SQLite 58 → 59; conditional portable format 33.** This ordered,
transactional reader boundary does not rewrite historical project JSON, existing
shared protocols, paid receipts, context/plan hashes, attempts, assessments or completed
work. Startup/reload makes no model calls. Older portable formats remain readable;
ledgers carrying `humanClarification` require 33 and reject downgraded envelopes.
Unsupported future structures fail validation without overwriting evidence.

An initial shared read that names two to eight conflicting saved answers, before any
draft/read/check completion, now offers an explicit human clarification. Saving checks
the expected project revision, exact latest intact cohort and failed job, no active
worker, text bounds and exact packet fit in one transaction. It appends a stable note
ID/body and exact conflicting-source IDs at an authenticated paid-prefix boundary.
Original answers, blocked reply, schedules, historical context bodies and spent usage
are unchanged. The note remains durable job evidence before publication; it is not a
new project specification revision, an approval or a claimed model verdict.

The save-only API starts no inference. **Play** is still required. Resumed packets pin
the exact note alongside both conflicting originals and their complete question/answer
support. The model must still decide whether the human text actually settles the
conflict; an ambiguous clarification stops honestly. All original reads and verification
remain mandatory. Worker checkpoints cannot invent, replace or discard the human
evidence. Atomic publication validates replay first, then adds the note source and
result together. Failure/cancellation retains the note and charged attempts without
publishing partial changes. Portable continuation retains the human-saved parent and
paid prefix; clone adoption does not repeat the blocked reply.

**Scope:** one clarification for an initial-read conflict only. No-draft eligibility is
intentional: later draft/check conflicts need a separate evidence-bound correction
design, not treating old checks as current after a new decision. Exhausted work/safety
limits are not renewed. This change does not resolve the user's gameplay preference or
edit their existing project data automatically. Restart the updated app to load it.

**Verification:** deterministic initial-conflict upgrade/reopen, exact prefix tampering,
portable 33/downgrade/clone publication, API authentication/origin/revision/input guards,
and paged cancellation checks added. The targeted Chromium shared-answer browser check
passed: save without inference, reload, Play, full original verification and retained
paid attempts, including the requirement's **Process blocking input** route. Type
check, UI build, `npm test` and both CLI `--help` smoke checks passed. A broader
browser run exposed a future-clarification leak into pre-Play historical replay;
that boundary was corrected and the focused browser check passed with an original
Play-owned blocker. The full browser rerun passed its main suite, then a follow-up
runner stopped at page navigation with Chromium `ERR_NO_BUFFER_SPACE` (not an
assertion failure); the complete follow-up group passed when rerun separately with
`npm run posttest:browser`. The final answer-group suite passed all 66 tests.
No live provider or user's private project run
was performed.

## Union answer verification and portable snapshot cache (2026-11-10)

**Source → target: SQLite 57 → 58; conditional portable format 32.** Startup creates
only a disposable `portable_snapshot_cache` table. It does not rewrite original
answers, historical snapshots, jobs, assessments, paid receipts, plan keys or usage,
and does not start model work. Migration and protocol validation are transactional;
an unsupported future shared-work policy rolls back the upgrade. Reopening/retrying
after restoring supported evidence preserves the original ledger. Older portable
formats remain readable; union ledgers require 32 and reject downgraded envelopes.

New service-created shared-answer work records `verificationPolicy: union-v1` in
its original plan identity. Reading retains the existing exact original batches.
Verification is **one paged union of all original batches and every draft-referenced
original**, with complete recursive source/question/answer support, the full frozen
draft and all pinned human answers. Each page checks only its detailed units; every
unit/page must pass before atomic publication. Explicit indispensable joint comparisons
remain atomic and may block. Corrections invalidate the entire verification pass,
not paid reads. All existing request, attempt, page, input and output ceilings remain.
Original-step progress is read-batch count plus one union verification step; actual
page replies/requests remain separately counted. This is not semantic independence
or permission to approve unseen interactions.

Already-started work **keeps its old verification schedule**, context hashes and
spent attempts. It is not relabelled or repacked to obtain fresh allowances. Valid
completed work remains complete. The union marker is bound into the plan key;
adding/removing it on a saved ledger fails replay. No user reset or reassessment is
required. New service work uses union verification; the low-level legacy planner
remains available for historical protocol fixtures/reconstruction.

Portable snapshot cache generation **1** is separate from database schema and
optimistic-concurrency revisions. Each compressed entry binds exact original SQLite
snapshot bytes by SHA-256 and checks the normalized payload digest before reuse.
Revision update/delete triggers invalidate the project's cache, including potential
lazy assessment-origin dependencies. Inserting an older/restored snapshot invalidates
cached revisions at or above it; ordinary append-only revisions retain older entries.
Only successfully normalized, account-redacted snapshots of at most 64 MiB are cached.
Missing, corrupt, incompatible-generation or same-revision-replaced entries rebuild
from original evidence; absent originals still reject. The cache is local/disposable,
not exported provenance, and must change generation if normalization semantics change.
The first publication still pays cold normalization/compression; later publications
reuse it across process reopen. No historical job or required snapshot is dropped.
Cache storage is additive: large histories can consume hundreds of MiB of local
disk. There is a per-entry size bound, not a claimed small total-cache footprint.

Coordinator-owned workflow windows now defer folder publication until their final
release, including Pause/failure, while SQLite checkpoints remain immediate. This
uses the existing nested per-project deferral boundary. Publication still runs
synchronously at that boundary; this is **not** off-thread I/O or a guarantee of an
instant first export. Workspace binding metadata adds optional numeric
`publicationMetrics` (format 1, revision, total/history/continuation/render/file-stage
durations). Missing old measurements remain absent. Totals include overlapping work;
the final binding write is excluded. Artifacts and assessment fingerprints do not change.

Verification: `npm test` passed all **1,953 tests** (931 pretests, 777 main tests,
245 posttests). Type checking, the desktop build (including UI build), the full browser
suite/postchecks, seven focused union/upgrade/recovery tests and 17 cache/workspace
checks passed. After final dependency-invalidation trigger hardening, all 57 storage/
migration/portable/workspace checks and four focused union tests passed again; the
desktop build was rerun. Browser checks use deterministic adapters, not live inference.
New coverage exercises complete mandatory evidence, page omission/tampering, correction
restart, legacy marker refusal, 57→58 rollback/repeated reopen, portable 32 downgrade
rejection and paid-read clone continuation. Cache tests cover warm reuse across reopen,
caller mutation, corruption, generation changes, >8 MiB snapshots, source-byte replacement
and byte-identical cached/uncached artifacts.

Real-checkpoint read-only reconstruction retained 1,032 jobs, 219 original snapshots
and all 1,045 artifacts (55,538,073 bytes). With a separate **memory-only** compressed
cache, cold preparation/rendering took about **88.1 s**, warm **42.3 s**, and warm
snapshot normalization calls fell to **zero**. Whole-output hashes matched exactly.
Compressed cache content was **432,531,027 bytes** (~413 MiB). This did not publish
files, upgrade/write the original database, call a model or measure end-to-end desktop
latency. An earlier 8 MiB cache threshold missed most real snapshots; the shipped
64 MiB bound and a regression for larger originals address that measured limitation.
Remaining export/delta/I/O cost and first-export delay are **not** claimed fixed.
No live inference or installed desktop qualification is claimed.

## Distinct omitted-resolution reviews (2026-11-09)

**Source → target: SQLite 56 → 57; conditional portable format 31.** The first live
resolution review succeeded: its saved model receipt cites the explicit human
departure-resolution answer, and processing then completed all **21 original read
steps**. The first verification step subsequently stopped on a different historical
materials conflict. Read-only inspection found another already-answered explicit
precedence question selecting full material retention and replacing the 50% penalty;
its original answer/question were omitted from the blocked verification packet.
This is source-backed evidence, not a new product choice inferred from accepted text.

The v1 one-review-per-cohort bound was too coarse. Explicit Play may now append
**v2 `blockerReviews`** for distinct **disjoint cited-human-answer conflicts**, up to
**eight total reviews** (the original singleton plus at most seven appended reviews).
Keep the old `blockerReview` singleton and all earlier bodies/hashes exactly as saved;
never convert, replace or re-run its paid review. Rewording, adding/removing cited
sources or any overlap with a reviewed conflict's cited answers cannot renew review.
This conservative structural rule can still stop a genuinely different but overlapping
conflict; it does not claim to recognize every semantic conflict. Omitted reverse-linked
answered questions remain candidates only, not authority. All v1 constraints remain:
full exact questions/answers and draft, no original-step/page credit or edits during
review, explicit human-resolution citations, unchanged 96k review bound, shared
256-request/three-failure backstops, no resets and mandatory original verification.

All successful review evidence remains detailed beside its conflicting originals in
later packets, including transitive dependencies when one review's candidates include
an older conflict's original answer. Adding a second review must not hide the first resolution or alter its
historical prompt/context hashes. New layouts may repack only unfinished verification.
Previously paid reads/checks/repairs and request/failure counters remain retained. An
unresolved, repeated, oversized, unsupported or exhausted review still stops; this is
not automatic conflict clearance or an unlimited review loop.

Startup is a transactional reader-boundary migration only. No original evidence,
completed v1 review, accepted requirements, assessments, history, leases or usage is
rewritten. Portable 31 is conditional on appended v2 boundaries; v1-only work still
uses 30 (or its otherwise-required format). Downgrade/future-format data rejects
without overwrite, with repeated reopen/rollback/retry supported. SQLite checkpoints
enforce append-only v2 prefixes and retain the immutable v1 singleton. The existing
metadata-only review reply category still grants no progress or exported prose.

Read-only actual-checkpoint preflight passed: **45 paid replies/requests**, current
attempt **1**, failure count **1**, all **21 read steps** and the completed departure
review remained unchanged. The complete new review packet is **69,820 / 96,000
characters**, containing seven exact linked candidate answers/questions including the
explicit materials-resolution answer. A local fixture-only positive reply (not
inference or a semantic verdict) repacked only the unfinished first original check
into **six exact pages**, each within 96k (maximum **95,043 characters**). The first
page is 75,105 characters and contains no cited materials-conflict source; every page
that does contain one also retains the entire materials review evidence and the
earlier departure resolution needed by a cross-linked candidate. No paid original
step was reset or credited by review. Retained-prefix replay, every new-layout page
and fixture-only completion of that one original check passed. No real-project writes or live model calls
were performed.

Verification: type check, diff check and **14 focused review tests** passed. New tests cover
the second distinct verification conflict, unchanged successful v1 review and all read
progress, exact original-body/draft expansion, both resolutions staying alongside their
own originals (including transitive candidate support), full verification with no repeated reads, second unresolved/malformed/
cancelled review, repeated/reworded/overlapping conflict rejection and the review cap.
Upgrade tests cover 56→57 repeated startup, pending v2 reopen and actual portable clone
adoption, append-prefix/hash/order/overlap tampering, downgrade rejection and transactional
future-format failure followed by recovery. Full `npm test` passed, including **239
posttests**. The browser regression suite (UI build and all postchecks) passed, with
only the existing Vite chunk-size warning. A final **99-test** focused recovery/
diagnostics run passed after the transitive-dependency refinement, including its new
exact-body regression. Live materials review quality, final specification completion and installed
desktop packaging remain unqualified.

## Omitted human-resolution evidence review (2026-11-09)

The original one-review-per-cohort limit described here is historical; the bounded
distinct-conflict extension above preserves all of this v1 work without re-running it.

**Source → target: SQLite 55 → 56; conditional portable format 30.** Startup adds a
transactional reader boundary only, without changing original answers, accepted
requirements, drafts, assessments, paid receipts/context hashes, request/failure
counters, history or leases. Explicit **Play** can prepare one `blockerReview` per
retained shared-answer cohort when an authenticated conflict names at least two
original human answer IDs and an omitted answered question in the existing evidence
catalogue structurally references a cited answer. Its current source must be an exact
linked human answer. Reverse links locate candidates only; they do not establish
precedence. No semantic resolution is inferred from text matching or chronology.

The boundary binds the exact paid prefix, complete frozen draft, candidate/conflict
IDs, exact record hashes and spent activation counters. The review packet contains
every cited conflict answer and its complete question, the candidate answers and their
complete questions/options, all current pinned answers and the full draft. It must
fit **96k** whole, without truncation or using the 200k exception. No additional
candidate/review cycle can be manufactured after this cohort's boundary is recorded.
Retries after interruption remain charged to the same overall request/failure limits;
Play never replenishes them. Candidates already detailed in the blocked packet do
not qualify as an omission. Missing/unlinked/oversized evidence or safety exhaustion
leaves work stopped rather than selecting a preference.

The exclusive `answerGroupBlockerReview` response cannot edit the draft, approve
requirements, or count as an original read/check/page. A positive review must cite
distinct supplied candidate human answer IDs and explain the explicit human decision
resolving this exact situation; links, model notes, accepted wording, chronology and
question-rationale assertions alone are not authority. A negative review retains a
human blocker and cannot rearm review. Model semantic correctness remains a live
qualification limit, not a deterministic guarantee. A positive receipt resumes only
the unfinished original stage; when cited conflicting originals appear in later
packets, their complete reviewed resolution evidence is served alongside them. Every
original read and verification remains mandatory. No completed step is repeated merely
to adopt this capability; the previously blocked unfinished request is reconsidered
with genuinely different evidence.

Portable 30 is conditional on the new boundary/receipt. Downgrade envelopes and future
review formats reject without overwriting saved work. Reopen/clone preserves pending
and completed review evidence, with portable adoption still paused. SQLite checkpoints
cannot replace the original boundary. Diagnostics project its reply to a boolean
marker only, retaining position without exporting content or crediting progress.

Read-only revision-3354 preflight preserved **23 paid replies/requests**, the current
spent attempt/failure counters, full draft replay and **four completed original steps**.
The exact candidate review is **51,237 / 96,000 characters** and contains the existing
human precedence answer. A local fixture-only positive response (not inference or a
semantic finding) produced a **90,765 / 96,000** unfinished original packet with that
resolution beside the old answers and no original progress credited by review. No
real project writes or live model calls were made. This implements evidence-backed
recovery of the departure blocker below, not automatic clearance of human ambiguity.

Verification so far: type checking, diff checking and **25 focused tests** passed, including review
completion followed by all original checks, unresolved/malformed/cancelled review,
spent counters and no rearming, bad citations/draft edits, tampered boundaries,
missing draft/exhausted limits/oversized complete evidence failing before inference,
55→56 repeated reopen, actual portable clone adoption, downgrade/future-format rollback
and authenticated private diagnostics export. The full `npm test` passed, including
**233 posttests**, and the full browser suite (UI build and postchecks) passed with
only the existing Vite chunk-size warning. A final **74-test** focused recovery run
also passed, including exact expansion of the review's full draft and original bodies.
Live review quality, final specification completion and installed desktop
packaging remain unqualified.

## Diagnostics projection compatibility (2026-11-09)

**No persisted-format change for this earlier fix; SQLite 55 / conditional portable
29 were current at the time.** The subsequent resolution review above uses 56 / 30.
The metadata-only diagnostics SQL projection and its validation now recognize retained
`answerGroupLoadPlan`, `answerGroupInspection` and `answerGroupComparisons` receipts.
Previously these became null responses and caused export validation to fail. Each is
projected to an allowlisted boolean marker, retaining its ledger position but exporting
no body, identifiers or prose. None counts as a completed original step/page or approval.
Unknown future categories still reject rather than fabricate progress. No jobs,
evidence, paid-prefix hashes, counters, assessments or portable files are rewritten;
there is no data migration or need to repeat calls.

Verification: reproduced the user's failure through the production export method on
a read-only SQLite connection without constructing a store (startup may write). After
the fix the same saved run exported successfully with four completed original steps
and eleven successful page replies distinguished. Type check and all **18 diagnostics
tests** passed, including the authenticated API, auxiliary-reply/page accounting,
privacy, unchanged saved payload/project, unknown-category rejection and existing
reopen/future-envelope tests. No live model calls or real-project writes were made.

The separate departure blocker is **not cleared by this export fix**. Read-only source
inspection found an already-answered explicit precedence question and an accepted
requirement preserving departure until safe appearance. Those resolving records were
omitted from the blocked request. The old contradictory answers remain original
evidence, not authority to ask the same settled decision again. Safe evidence-backed
blocker recovery was still needed at this point; see the implementation and remaining
qualification limits above. Do not reset saved work or
silently override genuine human conflicts.

## Guarded 200k joint-evidence exception (2026-11-09)

**Source → target: SQLite 54 → 55; conditional portable format 29.** Startup is a
transactional reader-boundary upgrade only: no originals, paid replies, inspection
notes/group plans, drafts, completed reads/checks, assessments, history, usage or live
leases are rewritten. Explicit **Play** adds immutable `inputCapacity` metadata at
the exact paid prefix, bound to the original OpenCode `openai` model, authorizing a
**200,000-character ceiling only for indivisible read/check units**. Normal packing
still targets 96,000 characters. Direct selections do not adopt this policy; no model,
connection, credential or output-format fallback is introduced.

The user approved 200k as a guarded exception after capacity investigation. The live
inspection pass retained 14 paid replies/requests at revision 3354 and current attempt
11, but every inspection conservatively flagged all seven peers. The accepted plan
therefore legitimately retained the same eight-original joint set. This did not prove
all originals semantically interdependent, but the app must honor the retained flags;
it cannot discard them or repeat paid inspection/planning to manufacture smaller groups.

New evidence-page **format 11** uses v10's exact lossless encoding. Only after ordinary
96k packing and v10 fail can it place a single indivisible original/support or joint
comparison unit alone on an exception page. It never fills a large page with unrelated
background. The original full draft-growth reserve (up to 24,000 characters) and page
metadata reserve remain required. A unit that exceeds 200k including those reserves
still stops. Every actual page is measured again; ordinary pages in a v11 layout keep
their 96k dispatch budget. Repair/inspection/clarification profiles retain their existing
bounds; this change does not broadly enlarge other workflows.

Every actual >96k dispatch additionally performs a **fresh native model catalog GET**
for the explicitly selected model before session creation or inference. The complete
generated app prompt must contain the exact evidence packet and fit an independent
admission check: UTF-8 byte length is used as a deliberately conservative text proxy
for this OpenAI route, **not an exact tokenizer count**. Reserve the model's entire
advertised output allowance (including reasoning), 32,768 tokens for runtime/system/
framing overhead, and leave 20% of both input and total context capacity unused.
Unknown/disabled/mismatched/inconsistent or insufficient limits reject without model
fallback, truncation or another inference attempt. No catalog/provider settings or
credentials are persisted. Advertised limits and this proxy do not qualify account-
specific acceptance, arbitrary hidden overhead or model review quality.

Portable 29 is required only for `inputCapacity` or v11 pages. Older envelopes carrying
them reject without overwriting work; future capacity/page formats roll back startup
and can reopen/retry after correction. SQLite checkpoints cannot replace a saved
capacity boundary. Replay preserves all earlier page formats, receipt/context hashes
and semantic assessment fingerprints; legacy future-page fixtures now use unsupported
format 12. No original step, completed page receipt, spent attempt, request/failure
allowance or mandatory verification is reset. Repeated preparation reuses a valid v11
layout rather than appending duplicate layouts. Full original verification remains
mandatory before publication.

Read-only actual-checkpoint preflight passed at revision **3354**: **14 paid replies**,
**14 requests**, current **attempt 11**, complete draft replay and completed original
steps/page receipts were preserved. The new three-page layout details the entire
flagged joint set together on its first page at **119,127 / 200,000 characters**;
independent expansion matched every detailed original exactly and retained all pinned
answers. No inspection/planning reply was repeated. The full prompt measures 152,078
characters / **152,168 UTF-8 bytes**. Fresh selected-model metadata again advertised
628,000 context / 500,000 input / 128,000 output tokens; admission passed with a 400,000
input budget and 502,400 combined budget before subtracting output/runtime reserves.
No real project data was written and no live inference was performed.

Verification in progress: type checking, diff checking and **75 focused tests** passed, covering
atomic joint completion/full verification, unchanged paid prefixes/counters, 96k normal
packing, the 200k hard stop, Unicode/whole-prompt overhead, unknown/smaller metadata,
exact route/model checks, cancellation during metadata loading, pre-session
rejection/owned cleanup, and 54→55 repeated
reopen, portable adoption, downgrade/tampering rejection and future-format rollback.
The full browser suite passed, including UI build and postchecks (only the existing
Vite chunk-size warning). The first full test run found two historical export
assertions expecting portable 24 after explicit Play; current adoption correctly
exports 29. Those expectations now assert 29 and the new policy while preserving
all paid-work/upgrade checks. The full `npm test` rerun passed, including the
pretest/main suites and all **226 posttests** with zero failures. Live larger-input acceptance,
semantic completion and installed desktop packaging remain unqualified.

## Proposed selected-model input capacity (2026-11-09)

**Historical investigation/proposal; superseded by the approved guarded 200k policy above.**
At investigation time SQLite was 54 and conditional portable format 28 was current.
The user initially authorized read-only
capacity investigation, not an automatic budget increase. Native selected-model
metadata and exact prompt measurements support proposing a 160,000-character shared
evidence ceiling with separate whole-prompt/model-capacity admission. See
[measurements and limitations](runtime-spike.md#selected-model-capacity-investigation-2026-11-09-metadata-only).

If approved, implement a new explicit reader boundary and paid-prefix capacity policy;
do not globally mutate old context construction, receipt hashes, layout validation or
fingerprints. Preserve all 14 accepted replies (including eight inspections and their
joint-group plan), current attempt 11 and spent request count 14. Repack only after
the retained prefix; never reread/re-plan paid units just to adopt capacity. The
all-original group remains atomic, and full verification remains mandatory. Old
assessment identities/evidence must stay valid. Unsupported older/future envelopes
must reject without overwriting work. Reopen/portable/downgrade/failure tests will be
required alongside any implementation. The subsequent implementation allocates SQLite
55 / portable 29 as recorded above; the original 160k proposal was not implemented.

## Evidence-first blocked-lookup inspection (2026-11-09)

**Source → target: SQLite 53 → 54; conditional portable format 28.** This is an
ordered transactional reader-boundary upgrade only. No original answers, paid
replies, blockers, completed reads/checks, drafts/repairs, assessments, delivery
evidence, usage or live leases are rewritten. Existing page formats 1–10 and lookup
review formats 1–2 retain their exact historical contexts/hashes. New inspection
boundaries or inspection/comparison replies require portable 28; a downgraded envelope
rejects without overwriting saved work. Unsupported future inspection formats roll
back startup and can reopen/retry after correction. Semantic assessment identities
and freshness rules are unchanged. No startup/polling inference is introduced.

At revision **3354**, the earlier v2 clarification returned a sound refusal: the
original omitted bodies had not yet been read, so it could not certify that separate
loads preserved every indispensable comparison. This was not a new human product
question. The cohort retains **five paid replies/requests**, current **attempt 2**,
one completed original read step and its original 42-step schedule. The user approved
an evidence-first pass; no product choices or independence were delegated by that
approval. Repeating the same evidence-poor clarification would not solve the blocker.

Explicit Play can now prepare a single immutable `lookupInspections` boundary after
an exclusive v2 clarification blocker. Preparation binds the original lookup, full
frozen draft, paid receipt prefix and activation attempt/request/failure counters;
all original-plus-ALL-counterpart packets must fit before preparation is accepted.
The original blocked reply remains dated evidence, not presumed resolved. Only the
new evidence-acquisition stage may proceed. Generic/product blockers outside this
exclusive retrieval boundary are not eligible. A later inspection blocker or exhausted
safety stop cannot renew the pass, and existing paid inspection replies never repeat
on Pause/reload/reopen/explicit continuation.

Each requested original is inspected once beside its **complete recursive support,
ALL original counterparts/support, full unchanged draft and EVERY pinned answer**.
The new `answerGroupInspection` response records a bounded retrieval note and distinct
requested peer IDs requiring an exact joint comparison. It cannot edit the draft,
grant approval or complete any original read/check/page. Unknown peers reject; uncertain
peers must be flagged conservatively. Notes are retrieval hints, never replacement
evidence, human preferences, semantic independence or assessments. Original evidence
and paid responses are never shortened to make a packet fit.

To avoid another evidence-poor UUID-only planning turn, inspection/planning packets
also carry an exact peer identity index: complete original statement/text/title fields,
never generated summaries or sliced snippets. This index is explicitly not full peer
evidence/support or coverage. Each original's complete body and recursive support must
still receive its own inspection; no independence or verdict can be based on an index.

After all inspections, one `answerGroupComparisons` turn proposes conservative groups.
Every requested original must be covered; every inspection's original **plus ALL of
its flagged peers** must occur together in at least one group. Separate pairwise
checks do not discharge a larger flagged set. Groups may overlap or grow, but may not
discard flags to fit. Each group subsequently receives an exact original-body
read/check with all original counterparts and support. A valid paid grouping reply is
saved even when it honestly requires an oversized joint group; packing then stops
before another model call instead of discarding that reply or repeating planning.
All original verification steps and complete post-repair checks remain mandatory.

This is one acquisition pass, not a retry reset: at most eight inspections plus one
planning turn per eligible lookup, at most eight distinct inspection boundaries, all
within the inherited **256 total requests**, three-failure stop and existing
page/layout/receipt/storage bounds. Attempts and failed/cancelled requests remain
charged. Saved boundaries are append-only in SQLite; replay authenticates every
inspection packet and cannot adopt another draft or paid prefix. Dispatch remains
JSON-only/no-tools under the selected model. Progress messages explicitly distinguish
inspection/planning from completed verification.

Read-only actual-checkpoint preflight passed: all five paid replies, attempt 2 and
five requests were unchanged during preparation. Using explicitly hypothetical,
unpersisted inspection replies solely to measure geometry, all eight full-original
inspection packets, including the exact peer identity index, fit
**41,506–70,196 / 96,000 characters**. Independent expansion
matched every detailed original exactly, retained the complete draft and all pinned
answers, and left original coverage unchanged throughout. The planning packet with
these geometry placeholders measures 40,508 characters; real notes are separately
bounded/measured. No model grouping decision or live completion is established by
this preflight. No real project data was written and no inference was performed.

Verification: the full `npm test` run passed, including all **215 posttests** and
the pretest/main suites. After the final exact-peer-index addition, the focused lookup
suite passed **23 tests**, including
evidence-first grouped completion/full verification, rejected premature verdicts or
weakened groups, preserved oversized joint plans, cancellation/retry without repeated
accepted inspection, malformed/genuine-conflict stops, and 53→54 repeated reopen,
partial-inspection and accepted-group-plan portable adoption, downgrade/tampering
rejection and future-format rollback.
Type checking and diff checking passed. Two browser runs passed their first checks but
then stopped on Windows `EBUSY` while removing a generated assessment-recovery
fixture directory; these are cleanup failures, not passing full suites. That runner
now retries only its own generated fixture removal five times with a 100-ms linear
backoff, after browser/app/store close. A persistent cleanup error still fails; no
application assertions were removed. The affected assessment-history browser check
then passed independently, including cleanup. The full browser rerun subsequently
passed, including UI build and all postchecks (only the existing Vite chunk-size
warning). Live model
correctness/completion and installed desktop packaging remain unqualified.

## Counterpart-preserving lookup clarification (2026-11-09)

**Source → target: SQLite 52 → 53; conditional portable format 27.** This is a
transactional reader-boundary upgrade only. No original answers, paid replies,
completed reads, drafts, repairs, assessments, spent attempts/requests, history or
live leases are rewritten. No startup/model calls are introduced. Pending or resolved
lookup-review **format 2** requires portable 27; older envelopes carrying it reject
without overwriting work. Future review formats reject transactionally and allow
reopen/retry after correction. Existing review v1 prompts, context hashes and receipts
remain unchanged, as do evidence-page formats 1–10 and semantic assessment identities.

The revision-3354 report is a **new five-answer cohort**, retaining four paid
replies/requests, one completed original read step, three completed page replies and
current attempt 1. Its lookup asks for eight requirements with two counterparts:
one pinned current answer and one non-pinned original confirmation. The exact joint
input measured **119,668 + 128 = 119,796 / 96,000 characters**; even v10 lossless
pooling measured **119,127 + 128 = 119,255**. Existing pin-only clarification correctly
did not apply. The user explicitly approved a broader, model-confirmed clarification
on 2026-11-09; this is not permission to split indispensable comparisons silently.

Play now offers one bounded, charged v2 clarification for an eligible oversized
multi-original lookup with non-pinned counterparts. The model receives its exact
authenticated prior working packet and unchanged lookup, not substituted evidence.
It must explicitly confirm that **each requested original can be compared separately
with ALL original `withRecordIDs` counterparts**, their full recursive support, the
complete draft and every pinned answer. If the requested bodies really must be
together, or the prior evidence is insufficient to decide, it must block. Clarification
earns no read/check verdict, product decision or draft edit and preserves the paid
lookup. Invalid/cancelled responses remain charged; attempts and original coverage
are not reset. There is no inference during preparation or preflight.

Only after the valid reply, the planner schedules indivisible original-plus-ALL-
counterparts units. Shared counterparts do not force those independently confirmed
units into one union, and they are never dropped as already-read evidence. Unit
constraints survive partial page completion, relayout, restart and portable adoption
through the original step. Later specific joint requests remain atomic. V2 refuses
repeated comparisons (including reordered ID lists), other unresolved joint requests,
or any original-plus-counterparts unit that cannot fit. Eight total lookup reviews,
the existing request/page/storage ceilings and full post-repair verification remain
mandatory; no budget or repair allowance was increased.

Read-only actual-checkpoint preflight preserved all four original replies, spent
attempt 1, four requests and complete draft replay. The exact clarification packet
fits **36,198 / 96,000**. A **hypothetical, unpersisted** confirmation produces five
remaining pages: the eight requested originals occur on three comparison pages,
each retaining both counterparts and all pinned answers; the other two pages are
remaining background. Independent expansion matched every detailed original exactly
on every page. All pages fit below 74,000 characters in this geometry check; the
actual first post-confirmation dispatch packet measures **71,460 / 96,000**. These
measurements do not establish a model's clarification decision or live completion.

Type checking and `git diff --check` passed (Git emitted only Windows line-ending
conversion warnings). The combined bounded-repair/lookup regression run passed all
42 tests; the final expanded lookup suite passed all 16 tests, including check-phase
counterpart comparisons. The full browser suite, including UI build and postchecks,
passed (only the existing Vite chunk-size warning). Full `npm test` passed, including
the pretest/main suites and all 208 posttests with zero failures.
Focused deterministic tests cover confirmed comparison
completion/full verification, exact non-pinned support, no split/read/refund on genuine
joint blockers/malformed output/cancellation, partial-page relayout, repeated-lookup
rejection, oversized single comparisons, and 52→53 preservation across repeated reopen,
pending/resolved portable adoption, downgrade rejection and future-format rollback.
No real project data was written or live inference performed. Installed desktop
packaging and live specification completion remain unqualified.

## Lossless joint-evidence phrase pooling (2026-11-08)

**Source → target: SQLite 51 → 52; conditional portable format 26.** This is a
transactional reader-boundary upgrade only. Startup changes no original evidence,
paid replies, read coverage, attempts, assessments, leases or usage and never starts
inference. Only continuations carrying new evidence-page format **10** require portable
26. Older envelopes carrying v10 reject without overwriting work. Unsupported future
page formats roll back startup and can reopen/retry after the payload is corrected.
Material, plan, original-source and assessment identities are unchanged.

The reported revision-3337 stop involves a **real non-pinned joint comparison**, unlike
the earlier pin-relative lookup. Two consecutive lookups on the unfinished page require
existing requirements and their complete original support together. The exact packet
measured **99,720 + 128 metadata reserve = 99,848 / 96,000 characters**. The run made no
new call, but the retained cohort already contains ten paid replies/requests, a complete
6,511-character draft and two spent attempts on the current page. It is not safe to
drop a counterpart, split this joint set, clear coverage or reuse the pin-only waiver.

Play-owned work now tries a **new versioned lossless layout** before asking for any
lookup clarification or reporting another packing stop. V10 uses the existing
`sharedTextID` / ordered `textParts` decoding grammar to pool literal repeated phrases,
then applies the existing identifier/record-table encodings. No wording is summarized,
trimmed, paraphrased or removed. Every joint body and full recursive support remains
detailed together; the complete carried draft and all original human answers remain
present. The actual resulting JSON must fit the unchanged 96,000-character cap.
Incompressible or genuinely oversized joint inputs still stop before inference.

The opt-in `joint-v1` text policy scans at most 250,000 characters, considers exact
8/16/32-word substrings of 80–1,024 characters, bounds its candidate map at 16,384 and
selects at most 256 profitable repeated phrases (two or more occurrences). Ties use
deterministic binary ordering, not machine locale. Replacement preserves exact literal
slice offsets, punctuation, whitespace and Unicode. Only used strings enter the wire
table; an encoding is kept only when its full serialized envelope is smaller. These
bounds limit local work, not evidence: unpooled original text remains literal in full.
All earlier text policies and page formats retain their original behavior/hashes.

V10 activates at a new exact paid-prefix page boundary; no old receipt or layout is
rewritten. Active v10 pages keep that format on retry/reopen instead of downgrading to
v9. The original step schedule, source authorization, explicit joint constraint,
current spent attempts, total requests, read coverage and required verification are
unchanged. There is no new model planning turn, semantic independence claim, repair
allowance or budget increase. Diagnostics now recognize page format 10 without changing
the historical metrics format. Repairs/checks and all request/page/storage ceilings
remain mandatory.

Read-only actual-checkpoint preflight passed at revision **3337**, with **ten paid
replies**, **ten total requests** and current **attempt 2** unchanged. The new two-page
layout's joint first packet fits **95,693 / 96,000 characters**. Independent wire
expansion matched every detailed original source/question/requirement/research record
exactly; all requested joint IDs were together, all original answers were present,
the original paid prefix was unchanged and complete draft replay matched. No real
project data was written and no model inference was used. This qualifies exact
representation/geometry, not live model quality or final specification completion.

Verification: type checking and the full browser suite (including UI build and
postchecks) passed; 47 focused working-set/lookup tests passed, including exact
Unicode/whitespace round-trip, atomic joint completion and 51→52 repeated reopen,
portable adoption, downgrade rejection and future-format rollback/recovery. The first
full test run exposed seven obsolete future-format assertions in historical tests:
they used newly supported page format 10 as an invalid sentinel. Those fixtures now
use unsupported format 11, retaining the same rejection/preservation assertions.
The full `npm test` rerun passed, including all 200 posttests and the preceding
pretest/main suites. Type checking and `git diff --check` also passed (Git reports
only existing Windows line-ending conversion warnings). Installed desktop packaging and live completion remain
unqualified. No inference or real-project writes were performed during these checks.

## Oversized pin-relative lookup clarification (2026-11-08)

**Source → target: SQLite 50 → 51; conditional portable format 25.** Startup is a
transactional reader-boundary upgrade only; no original inputs, paid lookups, completed
reads, drafts, repairs, assessments, usage or live leases are rewritten or reset. Future
lookup-review formats reject transactionally and can reopen/retry after correction.
Portable 25 is required only for `lookupReviews` or their `answerGroupLoadPlan` replies;
older envelopes carrying this new state reject without overwriting evidence.

The reported failure was a **new three-answer group at revision 3320**, not lost
progress from the earlier repaired cohort. Two read pages and a lookup were accepted.
The model then requested eight original requirements with three human-answer source
IDs as `withRecordIDs`. Those counterparts were already pinned on every page. The
existing contract treated the entire request as one explicit joint set, measuring
**130,533 + 128 metadata reserve = 130,661 / 96,000 characters**. Each original unit
could fit separately, but that fact alone does not authorize silently splitting a
declared joint comparison or asserting semantic independence.

Play-owned progress-policy work now has a narrow **model clarification turn** for this
case. It is eligible only when a saved last lookup has multiple requested originals,
every explicit counterpart is an always-pinned original, the combined packet exceeds
the input cap, and each complete original unit/support can fit with the full draft,
all pinned answers and metadata. Non-pinned joint counterparts, a genuinely unfit single
unit, legacy work without explicit policy adoption and unrelated failures retain their
existing stop. There are at most eight such review boundaries within the unchanged
request, consecutive-failure, page, receipt and storage ceilings.

The review is bound to the exact normalized paid prefix and original lookup receipt.
It supplies the exact original pre-lookup working packet, including the full draft and
every human answer, plus the retained lookup and explicit retrieval-scope instructions.
No omitted requested body is presented as read. The only successful response is a
charged `answerGroupLoadPlan` explicitly confirming separate original-unit retrieval
beside **all** original pins; otherwise the model must block an indispensable joint
comparison. It cannot edit the draft, repeat the lookup, grant a read/check verdict or
choose a product preference. Malformed replies keep the same charged attempts and
three-failure guard. The app never fabricates confirmation or makes this choice from
IDs/size alone.

Only after actual model confirmation is that specific old all-at-once retrieval
constraint replaced by separate loads. Every requested original and its full recursive
support stays scheduled, including explicitly requested originals already read on
another page. The old lookup remains byte-for-byte evidence. The clarification is not
a completed read, repair, verification pass or assertion of semantic independence.
The complete draft and all answers remain present; every original check still runs.
Any later specific joint request retains its own atomic constraint and must fit.
Model refusal remains a saved blocker, not permission to relax the comparison.

Pending/resolved reviews replay at their exact receipt boundaries; historical contexts
and assessment identities are unchanged. Cancellation/reopen retains the original
lookup and charged attempt. Explicit retry resumes clarification, not another original
lookup request. Portable clones retain the review and required existing parents, start
paused, and need no native runtime session to continue this protocol.

Read-only actual-checkpoint preflight passed with **three paid replies**, **two saved
read pages**, current **attempt 1**, **three total requests** and the unchanged draft.
The clarification packet fits **43,692 / 96,000 characters** and replays unchanged.
A clearly hypothetical, in-memory confirmation (never persisted or represented as
model evidence) produced five bounded pages, with the first at **59,968 characters**;
its draft replay also matched. No real project data was written and no live inference
was used. This qualifies packet geometry, not the future model's confirmation or
semantic correctness; an actually indispensable oversized comparison still stops.

Verification: `npm test` pretests (**930**) and main tests (**776**) passed. Its first
posttest pass exposed an incorrect test expectation that a fully published job's
activity ledger must be exported; portable projections intentionally omit unnecessary
completed archives. The test was corrected to verify both pending clarification and
accepted-but-unfinished clarification, including actual clone adoption. The final
`npm run posttest` passed **198 / 198**, and the focused six-test lookup suite passed.
The full browser suite/postchecks, UI build, type check and diff check passed. New
regressions cover explicit scope confirmation followed by all reads/checks, forbidden
draft/verdict envelopes, refusal, malformed output, cancellation/charged explicit retry,
non-pinned atomic counterparts, repeated reopen, pending/resolved portable continuation,
downgrade/tamper rejection and unsupported-format rollback/retry. Installed desktop
packaging and live model clarification remain unqualified. Relaunch the development
app and press **Play**; no reset, re-entered answers or separate allowance is needed.

## Progress-based shared-answer corrections (2026-11-08)

**Source → target: SQLite 49 → 50; conditional portable format 24.** The user
explicitly approved replacing the flat two-repair cap with bounded progress-based
technical recovery. Startup only upgrades the transactional reader boundary. It
rewrites no original answers, receipts, attempts, repairs, assessments, leases or
usage, and never starts work. Explicit **Play** activates `repairPolicy` at the exact
normalized paid-prefix boundary, retaining the number of pre-existing repair layouts.
Old receipts still render under their original policy; legacy work without activation
keeps the two-repair behavior. No historical assessment or semantic identity changes.

The reported saved output was successfully recovered as repair two. Six verification
pages passed, then a different supplied decision exposed an omitted exception: a
returning partner who is connected but waiting to appear must not prevent departure.
The previous repair had preserved the survivor and disconnected-partner exceptions,
but its general restriction for two living connected players omitted this already
settled waiting-partner exception. This was another faithful-reconciliation task,
not a missing gameplay answer. The flat two-repair cap prevented correction even
though there were no consecutive failures and original human evidence was available.

Under the new policy, **additional** corrections beyond the first two require:

- An authenticated negative verification naming an existing target already revised
  by the full carried draft, and concrete current human answer/note evidence.
- The cited human evidence must have been detailed in that exact rejected packet,
  not invented, superseded, delegated, unavailable or merely listed in a catalogue.
- Every named target must have at least one new target/evidence comparison not already
  followed by an accepted repair. Rephrasing the same failure does not renew it.
- The repair packet contains all pinned original answers, the whole saved draft,
  named originals and their full recursive support. Unrelated actions and other
  non-summary draft fields must remain unchanged. Only the named existing target
  actions may be corrected; equivalent absent/empty optional collections do not count
  as unrelated changes. The normal current-batch authorization rules still apply.
- Each target must actually change its statement/acceptance behavior. Unchanged
  corrections and exact earlier target versions stop immediately, without three
  identical validation retries. Hash/string checks are conservative loop guards,
  not proof that two differently worded drafts have different semantics.

The first two repairs retain compatible existing behavior. There is a hard backstop
of **eight total accepted repairs**, including the earlier two, inside the unchanged
**256 total request** ceiling, three consecutive-failure guard, input/output/storage
and page bounds. No spent request or failed attempt is refunded. Repeated Play, Pause,
Stop, reopen and portable adoption cannot replace the activation boundary or reset
those counters. Actual human blockers remain explicit stops; IDs in model feedback
are selection hints, not authority to resolve conflicting human intent.

Every accepted correction still restarts **all** original verification batches/pages.
Paid reads remain reusable; old verdicts and drafts remain dated history, not proof
that the new draft is consistent. Dispatch-only guidance asks the model to preserve
every supplied exception and prior explicit conflict resolution, rather than fixing
the latest exception by broadening a restriction over another. Native saved-response
recovery is not broken by activation: a pending paid reply retains its exact original
prompt/policy until accepted; the new policy can activate afterward.

Portable 24 is required only for the new policy. Downgraded envelopes carrying it
reject without overwriting data. Unsupported future policy formats roll back the
49→50 startup upgrade transactionally; restoring the supported payload permits retry.
Repeated startup preserves the old stopped job byte-for-byte. Pending policy/layouts,
original provenance, counters and required existing parents survive actual portable
clone adoption. Native sessions remain machine-local under the earlier export rules.

Read-only actual-checkpoint preflight at revision **3304** passed with **113 replies**,
**two accepted repairs**, current **attempt 1**, **13 total Play requests**, zero
consecutive failures, two affected draft targets and two current human witnesses.
The correction packet fits **82,806 / 96,000 characters**. The full draft, all original
answers, paid receipt prefix and source work object were unchanged; adoption and layout
replay matched. No real project data was written and no model request was made.
This verifies eligibility/geometry/replay, not the next model's semantic quality or
final specification completion. Installed desktop packaging remains unqualified.

Verification passed: full `npm test` (930 pretests, 776 main tests, 189 posttests),
followed by the final expanded posttest rerun (**192 passed**) and a final 27-test
bounded-repair/recovery run after dispatch-guidance updates. The full browser suite
and postchecks, UI build, type checking and diff checking also passed. New regressions
cover third-repair/full-check completion, repeated comparisons, no-op/cycling/unrelated
drafts, genuine blockers, unidentified/invented/unloaded evidence, malformed output,
eight-repair backstop, cancellation/charged retry, empty optional collection equivalence,
49→50 preservation/repeated reopen, actual portable clone adoption, downgrade/tamper
rejection and future-format rollback/retry. No live inference was used. Relaunch the
development app and press **Play**; do not reset the project or re-enter settled answers.

## Shared-answer output capacity and completed-reply recovery (2026-11-08)

**Source → target: SQLite 48 → 49; conditional portable format 23.** Startup is a
transactional reader-boundary upgrade only. No existing payload, answer, receipt,
attempt, lease, assessment identity or usage is rewritten; startup never rearms work
or calls a model. Unsupported future capacity/recovery formats roll back and can be
reopened after correction. No reset or repeat assessment is required. Portable 23 is
required only when the new capacity, pending recovery or recovered receipt is present;
older envelopes carrying those fields reject without overwriting work.

The reported complete repair was **26,733 serialized response characters**, including
a **26,711-character full draft**. The old 24,000-character aggregate output limit—not
the response wrapper or 96,000-character input limit—rejected it three times. Play
therefore retained 105 accepted replies, one accepted repair, attempt 4, six total
automation requests and three consecutive failures. Raising a limit must not refund
those requests or silently renew a no-progress stop.

Explicit Play now appends a versioned **48,000-character aggregate output capacity**
at the exact normalized receipt-prefix boundary. Earlier receipts keep their original
24,000-character validation and rendering. Dispatch-only output advice changes no
working-evidence hashes. The original input packing reserve remains separate from
output capacity: every actual subsequent working-evidence packet, with the full carried
draft and human answers, still must fit **96,000 characters**; otherwise it is repacked or stops before
inference. Saved-work byte/page/request/repair ceilings remain enforced. A returned
capacity error stops immediately, rather than automatically repeating unchanged advice.

For this specific completed-output failure, explicit Play prepares a **read-only
completed-reply recovery**, even at the consecutive-failure stop. This is not permission
for another model request. The adapter reads the original OpenCode session without
prompting, changing models, waiting/resuming a session or calling tools. It requires
exactly one matching original text-only user prompt (all bytes, including the old output
instruction and exact working evidence), the selected model throughout, completed
error-free assistants, one successful terminal idle record, no intervening prompts,
attachments, synthetic context or tools. Missing/unavailable/incompatible sessions
stop without falling back to inference. Direct-provider selections never fall back
to OpenCode. This hook is explicitly forwarded through both adapter wrappers.

Pending recovery binds the paid prefix, original source job, spent attempt and total
requests. A recovered receipt adds hashed prompt/message provenance and the source job
but no native session ID. Acceptance retains attempt 4 and the six original requests;
only genuinely accepted progress clears consecutive failures. An actual repair still
invalidates every earlier check and requires every original verification batch/page
again. Cancellation, mismatch or stale inputs preserve the pending boundary and original
work. No receipt or correction is published on a failed read. Parent checks prevent
orphaned recovery, and portable exports retain only necessary parent evidence. Native
session IDs stay machine-local: a pending recovery on a clone without that session
stops honestly; an already recovered reply can continue from its portable receipt.

Read-only inspection of the reported saved session verified the exact original prompt,
completion/model/no-tools contract and all five prior actions unchanged verbatim.
All five answer outcomes remain the same; four draft receipt explanations are identical
and one explanation changes with the correction (the original human answers remain
pinned unchanged). In-memory acceptance/replay of the complete reply passed under the
compatible capacity. No real project-data writes or live model calls were made.
The in-memory recovered receipt remains **attempt 4**, total requests remain **6**,
and the first mandatory recheck packet fits **95,460 / 96,000 characters**. No synthetic
check was recorded as semantic verification of the real specification.
This is local recovery qualification, not proof of semantic correctness or final
specification completion. Full verification remains required after the user presses Play.

Verification passed: full `npm test` (930 pretests, 776 main tests and 176 posttests),
the full browser suite/postchecks and UI build, followed by 28 focused tests after
adding cancellation/resume, stale-edit, no-identical-retry and adapter-class forwarding
coverage. The final posttest rerun passed all **179** tests, and the 14-test bounded
repair/recovery file passed again after tightening parent/history validation.
Type checking and diff checking passed. Upgrade regressions cover 48→49
unchanged failures, repeated reopen, pending portable export without session IDs,
future-format transactional rollback/retry and downgrade/tamper rejection. Tests also
cover exact prompt/model/completion, intervening activity/tools/attachments, no paid
fallback, full post-repair verification and durable usage/provenance. Installed desktop
packaging and final live semantic completion remain unqualified.

## Bounded rejected-comparison repair contexts (2026-11-08)

**Source → target: SQLite 47 → 48; conditional portable format 22.** This is a
transactional reader-boundary migration only. Startup rewrites no project, answers,
paid replies, attempts, completed reads/checks, assessments, grants or leases and
never starts work. Existing material/plan/assessment identities and old receipt
rendering remain unchanged. Only jobs carrying new `repairContexts` require portable
22; downgraded envelopes reject without overwriting saved state. Unsupported future
repair-context formats reject transactionally, retain database version 47, and can
retry after the unsupported payload is corrected. No repeat assessment is required.

The reported Play run accepted its first repair, restarted verification, passed one
page and found another overlapping departure rule needing the same settled survivor
exception. Constructing the next repair mistakenly restored the entire broad original
background batch beside the now-larger draft, instead of the affected comparison.
That packet measured **103,502 / 96,000** characters. This was a repair-packing stop,
not proof that the original human constraints alone could not fit, and not a request
to reconfirm settled gameplay choices.

An oversized repair can now append a deterministic bounded context at its exact
receipt boundary. It binds the normalized paid prefix, original negative check,
whole saved draft fingerprint, original step and ordered exact record IDs. It supplies
the existing original rules/evidence named by that authenticated feedback and their
complete source/question/current-answer closure, beside **every pinned human answer
and the full carried draft**. A named rule can be retrieved from the group's original
catalogue even if only its confirmation/quotation was on the rejected page. IDs in
model prose are retrieval hints, not product authority or permission to fetch invented
records. If no existing rule is named, the complete rejected packet is retained rather
than guessing a smaller target. Named joint counterparts remain atomic; genuinely
unfit complete repair evidence still stops before inference with a repair-specific
size diagnostic.

Unrelated draft actions must remain unchanged unless their full originals are loaded;
validation covers removals as well as additions/edits. Indispensable new counterparts
remain explicitly loadable and their full closures are measured again. No earlier
read, reply, successful repair, attempt or check is discarded/refunded. No new user
authorization, extra repair allowance, automatic conflict precedence or verification
skip is introduced. An actual repair still restarts **all** original verification
batches/pages. Subsequent repair cycles retain separate ordered layouts (at most the
existing two accepted repairs); old contexts and paid hashes replay unchanged.

Pre-dispatch overflow now checkpoints the retained shared work together with its
exclusive stage manifest. This also prevents saving an unreadable stage-only failed
job when the first packet of a resumed run genuinely cannot fit. The size stop remains
readable and charged counters remain unchanged; recording its diagnostic grants no call.

Read-only actual-checkpoint preflight passed at revision **3304**, **105 replies**,
**1 accepted repair**, **attempt 1** of the current stage. The new repair context
measured **55,682 / 96,000** characters with 17 complete original records, all pinned
answers, the named overlapping rule and the unchanged full draft. The original work
object was unchanged, the real SQLite connection was read-only, no layout/grant was
persisted and no model request was made. This qualifies packing/replay geometry, not
the next model's semantic repair quality or final specification completion.

Six focused deterministic tests passed: retained second-repair/full-check completion,
retrieval of a named original outside the rejected page, preservation of unloaded
draft actions, cancellation/malformed charged recovery, genuine atomic overflow with
zero inference and readable failure state, unknown-ID conservative fallback, 47→48 repeated reopen, saved-layout portable
roundtrip/downgrade rejection, tamper rejection and unsupported-format rollback/retry.
Full `npm test` passed (930 pretests, 776 main tests, 171 posttests), as did the
full browser suite/postchecks, UI build, type checking and diff checking. The first
regression run exposed the stage-only pre-dispatch failure bug described above;
after its fix both the focused tests and full rerun passed. No live inference or
real project writes were used during implementation or verification.
Live repair and installed desktop packaging remain unqualified. Close/relaunch the
development app (`npm run desktop` or `npm run app`) and press **Play**; do not reset
the project, re-enter answers or grant another repair permission.

## Play-owned specification processing (2026-11-08)

**Source → target: SQLite 46 → 47; conditional portable format 21.** Startup is a
transactional reader-boundary upgrade only: it rewrites no answers, projects, paid
receipts, attempts, assessments, leases or workflow grants, and never arms work.
Unsupported future automation formats reject transactionally; the saved original
can be restored and startup retried without resetting the project. Assessment and
semantic checkpoint identities remain unchanged. Old advanced APIs/protocols retain
their original semantics; explicit **Play** is required to adopt the new policy.

The user approved replacing routine technical permission management with Play,
Pause and Stop. Play binds a shared-answer automation policy to the exact original
receipt prefix, project revision, original support fingerprints and retained parent.
Adoption/restoration of each intact cohort is transactional and checks the current
project/settings revision. No historical request is refunded: the reported exhausted
attempt 4 remains attempt 4; a later repair is attempt 5, not a fresh attempt 1.
The new policy owns faithful `revise` reconciliation of existing original requirements
across feature boundaries using concrete pinned answers and full detailed support.
It cannot authorize new out-of-feature records, retirements, approvals or resolution
of genuinely conflicting human decisions. Only conservatively recognized historical
scope/missing-original blockers can be re-evaluated; unknown blockers stay retained.

New shared requests are reserved durably before dispatch. Useful lookups count
toward total usage rather than exhausting a four-request repair step. Internal bounds
are 256 requests per adopted task, three consecutive failed reservations/validation
attempts and the existing two accepted repairs plus unchanged packet/storage/page
limits. Accepted progress clears only consecutive failures. Reopen, Pause, Stop and
Play do not renew an exhausted task limit. The coordinator also stops at 256 reserved
requests per run. Transport/auth errors and cancellation are not silently retried.
Malformed output retries are bounded by the same durable consecutive-failure guard.

Pause saves an in-flight shared reply and waits before dispatching another request;
Stop cancels immediately and disarms the coordinator. Shutdown cancels and requires
explicit Play after reopen. All original verification steps remain mandatory after
repair. Portable 21 retains consent/automation parents and validates exact prefixes;
downgraded envelopes reject without overwriting saved state. Machine-local workflow
arming is not exported. The completed work remains dated evidence, not a fresh grant.

Read-only preflight of the actual revision **3304** checkpoint passed on a cloned
work object: all **102 receipts**, **24/34** original steps, **0 repairs** and
**attempt 4** remained intact. The Play repair input measured **91,848 / 96,000**
characters. No live database was migrated, no grant was persisted and no model call
was made. Live repair quality, full live completion and desktop packaging remain
unqualified. This slice simplifies shared-answer processing; other specialized
engines still retain their earlier safety/recovery semantics and can stop technically.

Deterministic coverage includes scope adoption without a checkbox, useful lookup
followed by repair beyond attempt 4, mandatory full rechecks, no-progress exhaustion
without renewal, cooperative Pause/owned Stop, repeated 46→47 reopen, portable
roundtrip/downgrade rejection and unsupported-format rollback/retry. The normal browser
fixture verifies collapsed advanced controls, Play without per-rule consent, preserved
paid history, full recheck, Stop/reload and mobile. Legacy browser fixtures explicitly
expand advanced actions to continue testing their old APIs.

Verification: full `npm test` passed (930 pretests, 776 main tests, 165 posttests).
Full `npm run test:browser`, including all postchecks, passed after updating the
historical runners to use the new header labels or explicitly open advanced actions.
The final focused 14-test permission/Play suite and 13-test queue/UI suite passed,
as did type checking, UI build, CLI help smoke checks and diff checking. The focused
tests additionally cover already-prepared saved cohorts, before-dispatch counters,
self-origin Pause/resume and no-call recovery after atomic publication failure.
No live provider requests or real project writes were used; desktop packaging was
not rebuilt. Restart the development app (`npm run desktop` or `npm run app`), then
use **Play**—do not reset the project or resubmit its settled answers.

## Exact rule-scoped shared repair permission (2026-11-08)

**Source → target: SQLite 45 → 46; conditional portable format 20.** The
transactional reader-boundary migration rewrites no project, answer, paid reply,
attempt, completed read/check, assessment or lease. Old work retains its original
replay semantics. Only work carrying the new permission requires portable 20;
older envelopes cannot carry it. Unsupported future permission formats reject
without advancing the database version; correcting the unsupported input permits
startup retry. Deterministic tests cover repeated startup, rollback/retry, retained
grants, portable reopen/adoption and missing-parent/downgrade rejection.

An eligible current-revision failed repair can offer **Allow repair of this affected
rule** only when its retained scope/permission blocker names exactly one detailed,
active accepted/needs-review original requirement outside the group's feature, and
repair/request allowance remains. The browser displays the existing rule and
feature. Its checkbox starts unchecked and resets when the preview changes or the
view reloads. The separate authenticated consent action binds the job, requirement,
complete saved work and project revision through an exact preview key, plus project
revision/settings CAS. Opening the view, polling, Continue or the model's complaint
cannot grant permission.

The metadata-only grant preserves the blocker, whole draft, original receipt prefix,
spent attempts and support fingerprints. It pauses without inference; **Continue
specification** remains a separate action. Permission activates only after the saved
blocker boundary and permits only `specificationUpdates.changes` / `type: revise`
for the named existing rule. It does not authorize another target, new records,
questions, retirement, refinements, pending changes, gameplay decisions, replacement
wording approval or precedence between conflicting human decisions. Complete original
support must fit; request inputs remain capped at 96,000 characters. Every original
verification batch must pass after an actual repair. No attempts are added/refunded,
including cancellation or malformed output on the final attempt. Checkpoint and
publication require the retained failed consent parent and unchanged paid prefix;
portable export retains that parent and import checks the relationship.

A read-only preflight of the reported revision **3304** checkpoint passed using a
cloned work object only: **101 receipts**, **24/34** original steps, **0 repairs**,
**attempt 3**, **1 remaining attempt**; the permission-bound repair input measured
**85,997 / 96,000** characters with the complete target/support present. The real
database was opened read-only, not migrated or granted permission; no provider call
was made. Live repair quality, full live completion, desktop packaging and the
previous post-request latency remain unqualified.

Focused deterministic tests and the shared browser fixture passed: exact consent,
auth/CAS/staleness, scope/source restrictions, paid-prefix replay, final-attempt
repair followed by rechecks, cancellation/malformed exhaustion and upgrade recovery.
The browser additionally verifies unchecked/reload consent and no-call grant/reload.
Full `npm test` and `npm run test:browser` (including postchecks), type checking,
UI build and diff checking passed. The final focused seven-test permission run
also covers atomic rollback/retry of an interrupted grant write and conservative
preview eligibility. Tests use isolated fixtures only; these results do not qualify
live provider repair quality or installed desktop packaging.
Close/relaunch the development app (`npm run desktop` or `npm run app`) to load the
updated backend and UI; then review/check the named rule permission, grant it, and
continue explicitly. Do not reset the project or resubmit its settled answers.

## Separately started shared packing continuation (2026-11-08)

**Compatibility:** SQLite **45** and portable **19** remain unchanged. No stored
format, assessment fingerprint, source provenance, paid ledger or completed result
changes. This corrects explicit continuation eligibility and a derived browser offer;
startup/reload/polling still cannot resume work or grant model calls.

The first tight-read fix proved that the saved packet fits, but ordinary Continue
still recovered only input jobs owned by its earlier coordinator step. A shared
group started through separate response processing could remain `needs-attention`
outside that job list. The saved-input decisions also hid Continue while the
coordinator was armed and waiting, so the same historical packing notice remained
visible without a fresh shared job. Restarting alone could not fix this routing bug.

Explicit **Continue specification** can now adopt a separately started shared
packing-only stop when the entire original cohort is active, nonconflicting,
unresolved, linked to that exact failed job, current-revision and unexhausted.
The job must retain an oversized context marker and exact replay must prove a newly
fitting layout through `canPageAnswerGroup` **before** any response is requeued.
Original grouping, stable submissions, paid replies and spent step attempts are
retained; the next request spends the next attempt. Existing coordinator-owned
interruption/repair/preparation recovery remains unchanged.

The browser exposes a cheap structural **candidate** to keep Continue visible
beside the retained size stop; it says that the exact layout will be rechecked.
Polling does not perform expensive full receipt replay or treat the offer as model
authority. The explicit action still performs exact freshness, replay, scope and
packing validation. Genuine generic failures, exhausted stages, actual human
blockers, changed inputs, archived/conflicting or incomplete cohorts do not receive
this separate-job recovery. **Review changes** does not adopt these failed groups.
An old completed input-loop pointer may reopen only for this explicit input
continuation; no old completed job/verdict is rewritten. Restored inputs clear only
the coordinator's obsolete review-checkpoint routing, not saved findings or checks.

Read-only inspection of the reported state found database **45**, the same failed
shared job at revision **3304**, **60 receipts**, **attempt 1**, and the old v8
110,189-character failure envelope. Exact current-code packing preflight passed.
All five active answers pointed to that job, while the coordinator's completed
input pointer excluded it. There was no newer shared job. No workflow was started,
no model was called and no user data was written during this inspection.

If a storage interruption persists only part of the input-status restoration,
those original already-applied `saved` members may remain beside the same group's
`needs-attention` members. A subsequent explicit Continue revalidates the whole
cohort and finishes restoration without regrouping or inference during the failed
configuration. Different job links, new/unapplied input, conflicts or archival
still prevent adoption. No background worker is armed by the interrupted action.

Regression coverage exercises the separately started group, including a completed
input-loop key, preserved paid prefix/next attempt, and a later genuine semantic
blocker that cannot be revived. Negative cases cover generic failures, exhaustion,
conflicts, archival, partial cohorts and review-only actions. UI checks cover the
otherwise-hidden Continue button; the shared browser fixture now begins with a
separately owned packing stop and verifies explicit continuation/Pause/reload.

Verification: `npm test` passed (930 pretests, 776 main tests, 151 posttests), as
did the full browser suite/postchecks, UI build, type checking and diff checking.
Final focused continuation/UI tests additionally passed with an injected second
status-write failure and explicit recovery; the shared browser runner passed
again. No live model calls, user-data changes or installed desktop rebuilds were
performed. Close/relaunch the development app (`npm run desktop` or `npm run app`)
to load both updated backend code and UI; a browser refresh alone is insufficient.

## Measured current-draft read units (2026-11-08)

**Source → target: SQLite 44 → 45; conditional portable format 19.** This is a
transactional reader-boundary migration only: startup changes no saved answers,
drafts, paid receipts, attempts, schedules, completed work, assessments or leases.
Formats 1–8 replay with their original rendering/packing semantics. Unsupported
future formats reject transactionally and can retry after the unsupported input is
resolved; downgraded portable envelopes cannot import v9 work as an older protocol.
No assessment fingerprint, revision identity or existing verdict is invalidated.

Read format **9** retains v8's full original-support closures, carried draft, pinned
answers, paid coverage, atomic explicit joint comparisons and unchanged-action
validation. Ordinary packing still reserves the full remaining growth to the
24,000-character draft limit. If **one indivisible read unit** cannot fit solely
because of that speculative reserve, and a complete draft already exists, it may
stand alone using its **measured current input plus 128 metadata-reserve characters**.
It is never joined to other optional units to fill that tight page. No original
body or draft action is removed, summarized, truncated or approved by packing.

This permits reading an exact comparison that actually fits today; it does **not**
guarantee that every possible future draft will fit. Dispatch advice explains the
tight capacity: retain unchanged actions, use Keep when no change is justified,
and block honestly if an indispensable revised draft cannot fit. The existing
24,000-character response bound and all attempt/page/work limits are unchanged.
Every subsequent actual request is measured afresh against **96,000 characters**;
a newly accepted bounded draft remains saved if a later packet genuinely cannot
fit. All original verification steps remain mandatory before atomic publication.
A tight read does not issue a verification verdict or establish unseen consistency.
Actual current-input overflow still blocks without splitting the declared joint set.

Compatible failed reserve-only stops use ordinary **Continue specification** after
updating. The new layout appends to the authenticated old receipt prefix; it grants
no fresh allowance and does not replay paid reads. Startup alone starts no model
work. No reset, answer re-entry or new recovery grant is required.

The reported revision-3304 checkpoint was inspected **read-only**. Its latest
lookup requests six records with three detailed counterparts, expanding to 46
original support records. V8 required **94,762 input + 15,299 speculative growth +
128 metadata = 110,189 / 96,000 characters**. V9 packs the same complete comparison
at **94,762 / 96,000**, as the first of two mandatory remaining read pages for that
original step. All **60 receipts**, the complete **8,701-character draft**, **one
spent attempt** and **1/34 completed original steps** replay unchanged. Normal
continuation preflight passed. These are layout/replay checks, not model verdicts
or a promise that future changes/joint requests fit. No live inference or user-data
write/upgrade was performed.

The 44→45 regression reproduces a genuine v8 reserve-only failure, preserves old
payloads across repeated startup, rejects a future format with rollback/retry,
retains the whole joint unit and paid prefix, decodes portable 19 and refuses a
downgraded envelope. A one-request service continuation spends the next original
attempt without publishing partial work; a larger genuinely unfit joint lookup
remains saved and blocks rather than being split.

Verification: `npm test` passed (930 pretests, 776 main tests, 143 posttests), along
with type checking, focused v8/v9 upgrade/packing tests, the shared-answer browser
runner and `git diff --check`. The real checkpoint's exact v9 layout/replay was
checked locally without creating receipts, dispatching inference or writing user
data. Live model behavior and installed desktop packaging were not exercised.

## Stable shared reads and exact staged planning (2026-11-07)

**Source → target: SQLite 43 → 44; conditional portable format 18.** Startup is a
transactional reader-boundary upgrade, not a data rewrite or a model call. Original
answers, receipt prefixes, schedules, completed work, assessments and live leases
are retained. Formats 1–7 and existing staged policies retain their original packet
rendering/replay and verification meaning. No allowance is increased or refunded.
Unsupported future formats and downgraded portable envelopes reject without overwrite.
No assessment or completion fingerprint changes, and no reassessment is required.

Explicit continuation can append **read-page format 8** to unfinished shared reads.
Each primary unit expands the complete recursive requirement.sourceIDs /
source.questionID / question.sourceID support before measuring fit. Every pinned
answer and the complete carried draft remain present. Successful read-page coverage
is derived from authenticated receipt/layout prefixes, not merely requested IDs.
Relayouts retain completed primary units (and v8 detailed support coverage), while
uncompleted pages and newly requested bodies remain mandatory. Historical paid
replies are never rewritten or relabelled as verification. Every original check
step still follows, using the existing v7 check protocol.

Unchanged draft actions do not require repeated history reconstruction. New/changed
actions still require detailed bodies; v8 also rejects removing an old action whose
references are unavailable. Previously completed units cannot be requested again
without explicit `withRecordIDs` naming currently detailed counterparts for a
specific indispensable joint comparison. Those full closures stay atomic and
genuinely oversized comparisons still block. This is not permission to assume that
separate evidence agrees or to replace any original body with a draft or summary.

The **staged-dense-records-v5** questions-only fallback packs new work by actual
encoded input size plus the existing full 8,000-character draft/envelope reserve,
instead of the v4 raw 50,000-character grouping threshold. It retains v4's exact
mandatory evidence union, pins, no-load/no-research restrictions and all-batch
read/check publication gate. Saved v4 schedules are reconstructed **before** the
new policy is considered; their plan keys, replies and spent attempts survive.
Binary prefix probes need not find a mathematically optimal packing, but every
selected packet independently passes the unchanged 96,000-character bound.

Derived local context checkpoints now support a **staged** bundle: complete computed
review/batches, never model output or approval. Cache keys bind the entire exact
project snapshot (including revision), review, policy and algorithm/budget version.
Changed evidence, scope or revision recomputes. Copies prevent caller mutation;
reopening preserves wire metadata and review identities. Bundles share the existing
128-entry/16-MiB success pool, separate from the bounded failure pool. Overlarge
bundles simply proceed uncached. Pending model work and paid stage ledgers still
undergo the normal exact matching, attempt, stale-input and publication checks.
Disposable cache contents are not exported as project evidence.

Context-computation storage generations are separate from resolved task receipts:
changing saved job progress no longer evicts exact project/review computations.
Resolved task receipts remain bound to jobs, focus and submissions; they cannot
silently skip new model work. Inner staged keys still require the **entire exact
snapshot**, even where older individual context computations support proven
bookkeeping-only revision rebinding. Old job-bound context generations can be
adopted only through their matching original input keys. No model ledger is moved,
rewritten or refunded by this derived-cache adoption.

Optional metadata-only `publicationMs` measurements separate shared publication
replay, completion-input reconstruction, review-history reads and reconciliation.
Submission progress/revision checks are also measured. These are nested local
timings, not additive wall-time attribution; missing old timings remain unknown.
The previously observed unexplained completion tail is **not yet attributed or
claimed fixed**. Planned scheduler yields are described as continuation into the
next work window, not request failures. Actual failure, timeout, Pause and human
decision boundaries remain unchanged.

Deterministic comparison: one 30-note fixture uses **4 dense batches vs 6 v4
batches** with identical exact evidence coverage (8 vs 12 scheduled read/check
requests). Exact-snapshot replay uses **0 new context preparations vs 21 cold**.
These are fixture measurements, not live latency or semantic-quality qualification.
No live provider inference or user-project write is needed for these changes.

Verification completed: `npm test` passed (930 pretests, 776 main tests, 142
posttests), along with type checking, the full browser suite/postchecks, final UI
build, focused shared-answer/question-collection browser checks and diff checks.
The 43→44 fixture preserves old paid work across repeated startup, rejects a future
page format transactionally and safely retries after restoring the original bytes.
Read relayout, exact support closure, portable 18/downgrade rejection, cache copies,
changed snapshots, repeated cache reopen, and saved v4 attempt/schedule preservation
are covered. A real service continuation with changed job receipts and a SQLite
reopen performs zero new context preparations while retaining its spent attempt.
No live latency check, user-data migration/write or installed desktop rebuild was
performed; the post-request tail still needs measurements from a subsequent run.

## Scoped original-unit shared verification (2026-11-07)

**Source → target:** SQLite **42 → 43** preserves all payloads, frozen drafts,
material/plan identities, historical verdicts, spent attempts and completed work.
Startup is a reader-boundary migration only. Formats 1–6 keep their exact original
rendering/replay; older checks with broader supplied evidence are not invalidated
merely because later packets gain a more bounded scope. Explicit continuation may
append format **7** to an unfinished check. No inference starts at upgrade, and no
attempt or recovery allowance is created, renewed or refunded.

V4–6 detailed every draft-referenced original and its history in **every** check
packet. That can make one unrelated background rule appear indivisible even though
its own full provenance fits beside the complete draft and human answers. V7 makes
the comparison scope explicit: a primary original unit, its **whole requirement
`sourceIDs` / source `questionID` / question `sourceID` closure**, the **entire frozen
draft** and **every pinned human answer**. Closure traversal is recursive and rejects
missing authenticated support. Other `evidenceIDs`/dependencies remain references,
not implicitly reviewed bodies; indispensable interactions require an explicit joint
lookup. No wording, source body, acceptance scenario, provenance or draft action is
summarized, truncated or replaced by a citation.

Every original batch record **and every draft-referenced original/support record**
is scheduled across the mandatory pages of each new scoped original check step,
rather than supplied globally on every page. Units are packed using their actual
full closures, so a rule is never approved with its source/question/answer history
split onto another page. A positive verdict asserts agreement only between the full
unchanged draft/answers and the detailed units, not unseen rules or global consistency.
Every remaining unit/page/batch must pass before atomic publication. Actual conflicts
still reject the draft, invalidate its check pass and route to bounded repair.

Explicit `withRecordIDs` comparisons retain their complete requested and counterpart
closures as one atomic first unit. A genuinely unfit joint set still blocks; scoped
packing cannot silently convert it into separate passing checks. Preparation of an
old missing-original blocker still produces its exact v6 evidence-complete cohort.
If scoped continuation is chosen, that **entire authenticated cohort remains atomic
for the first reevaluation**, until a successful page verdict (or a real draft repair),
not merely until a lookup is requested. The old blocker receipt remains in history
and feedback; preparation never supplies approval or a product preference.

Original schedules/receipt keys and paid original steps are unchanged. Compatible
saved unit-overflow failures use ordinary **Continue specification**; no answer
re-entry, reset, repeat preparation or extra grant is needed. Character, draft,
attempt, page/layout/receipt and ledger-byte ceilings remain unchanged. Conditional
portable **format 17** protects v7 scopes; formats **1–16 remain readable**. Exact
recovery parents and receipt prefixes remain required, and unsupported future formats
or downgraded envelopes reject without overwriting data. This changes future check
scope, not assessment fingerprints, specification revisions or valid completed work.

Read-only inspection of the real checkpoint retained **136 replies**, **28/34
original steps** and **attempt 0** (no request spent on the next original step).
Its v6 packet required **103,320 complete-input characters**. Additional exact phrase
sharing still exceeded **102,000**, so this is not another small wire-header fix.
The current rule with its own whole support, full draft and pinned answers measured
about **73,752 characters** in a geometry-only projection. Actual v7 packing/replay
produced a **93,262 / 96,000-character** first packet and two mandatory packets for
the unfinished original step, with the draft/counters unchanged and ordinary
continuation admitted.

A separate **geometry-only** inspection packed all six remaining initial check
layouts against the unchanged draft: 2, 2, 1, 2, 2 and 1 pages; first-packet sizes
were 93,262, 93,489, 90,424, 95,512, 94,448 and 82,876 characters. It created no
receipts or semantic verdicts, invoked no provider and wrote no user data. It does
**not** qualify future model-requested joint comparisons or promise completion.

Verification: `npm test` passed (928 pretests, 776 main tests, 141 posttests), as did
the UI build, full browser suite/postchecks, final focused shared browser runner,
type checking and focused preparation/scoped-upgrade tests. The 42→43 fixture
reproduces a v6 whole-unit overflow, retains old bytes across repeated startup,
continues at attempt 1 without replaying paid steps, checks every batch/draft-original
unit with its complete support and full draft, retains real negative verdicts and
refuses to split an unfit declared four-history joint comparison. Portable 17 decoding
and downgraded-envelope rejection pass. Legacy protocol tests remain explicit where
their original global-pin semantics matter. No live provider inference, actual
user-data upgrade/write or installed desktop rebuild was performed.

## Compact lossless shared-page wire instructions (2026-11-07)

**Source → target:** SQLite **41 → 42** is a reader boundary. It does not rewrite
historical packets, replies, draft/task identities, grants, counters or completed work.
Formats 1–5 retain exact original replay. Explicit continuation can append format
**6**, using the existing compact explanations in the three lossless wire encoders
(shared text, identifier dictionaries and record tables). Source text, question and
answer bodies, draft content, IDs, ordering and missing-versus-null values do not
change. Shorter explanation overhead can also make an existing exact record-table
representation worth selecting where its longer explanation was not. This is wire
packing, not semantic compression, truncation or assessment/freshness rebasing.

V5's complete joint evidence could fit just below 96,000 characters while conservative
candidate-page metadata and its reserve pushed the packing estimate over the limit.
V6 reduces explanatory overhead without removing the reserve, raising the bound,
separating the joint comparison or skipping any background verification. New v6 fit
errors separately state measured complete-input characters, draft reserve and page
metadata reserve; they do not claim that human constraints alone are oversized.
All prior attempt/work limits and exact-original/joint-first checks remain in force.

Portable formats **1–15 remain supported**; v6 pages require **format 16**. Unknown
future page formats and downgraded envelopes reject without overwriting data. Upgrade
tests preserve a paid v5 lookup/context across repeated 41→42 startup, transactionally
reject future format 7, retry after restoring supported data, and expand compact record
tables to prove unchanged evidence/IDs/array order/null and absent fields. Original
recovery parents remain mandatory. There is no new recovery grant: compatible saved
size stops use ordinary **Continue specification**, retaining the paid lookup and
the next charged attempt. A genuinely unfit complete joint set still blocks.

Read-only inspection of the latest real checkpoint found **133 replies**, **27/34
original steps** and **attempt 1**. Its minimal full comparison measured **95,960
characters**, while conservative candidate metadata/reserve produced the reported
**96,149** stop. V6 packs the next complete joint comparison at **95,682 / 96,000**
with three required packets in the replacement layout. No user-data writes/migration
or provider calls were performed. Historical replay alone took approximately **30
seconds** in this local preflight; it is not pure model time or a cross-machine
benchmark. An earlier combined multi-replay preflight timed out at 120 seconds;
splitting metadata-only replay/packing inspection avoided claiming that timeout as
a passing check. This verifies local packing only, not future semantic verdicts or
every possible later evidence request.

Verification: `npm test` passed (928 pretests, 776 main tests, 140 posttests), as did
the final 48 shared-answer tests, type checking, UI build, full browser suite/postchecks,
CLI help entry points and diff checking. The expanded v6 ledger replay and ordinary
continuation admission both passed read-only against all 133 real replies, preserving
the frozen draft and attempt 1. Upgrade tests compare expanded tables rather than
raw wire objects because compact overhead can enable an additional lossless table;
decoded evidence remains identical. No live model call, actual user-data upgrade/write
or installed desktop rebuild was performed.

## Atomic joint-first evidence pages (2026-11-07)

**Source → target:** SQLite **40 → 41** is a reader boundary only. Startup retains
all payloads, paid replies, blockers, grants, attempts, draft and task identities.
Formats 1–4 keep their original replay/packing rules; no completed work is rebased.
Explicit continuation may append format **5** to an unfinished overflowing layout.
No additional attempts, inference consent or automatic retry is introduced.

V4 pinned a pending `withRecordIDs` comparison beside **every** proposed background
page. This could reject a joint comparison that fits by itself because an unrelated
single background record could not fit beside it. V5 places the complete requested
bodies and named counterparts in one **atomic first unit**. All frozen-draft original
references/support remain pinned on every page. Temporary joint bodies release only
after the first page's positive local check; every remaining background page and
original batch must still pass before publication. A negative verdict still routes
to repair, and a genuinely unfit joint unit still blocks without splitting bodies.
Multiple unfinished joint lookups remain combined until a successful page verdict;
re-layout cannot silently discard a paid comparison. Character and work limits do
not change. A finished joint page is not a group-wide consistency certificate.

Compatible saved v4 fit failures use ordinary **Continue specification** after the
update; no second verification preparation or recovery grant is needed. The exact
paid lookup remains in the receipt prefix and the next request uses the next charged
attempt. An interrupted/failed continuation cannot refresh the per-page allowance.

Portable formats **1–14 remain supported**; v5 layouts require **format 15**. Exact
recovery parents, ordering and ledger prefixes remain mandatory. Future page formats
and downgraded envelopes reject without overwriting work. Assessment semantics and
freshness are unchanged. Upgrade tests cover repeated 40→41 reopen with a paid v4
joint lookup, original page/verification-recovery parents, format-15 portable decoding,
unchanged attempts/replies, rejection after co-location, and temporary-pin release
only after the complete joint page passes while background remains unfinished.

A read-only real-checkpoint audit found a **93,803-character** minimal complete
comparison, despite the **101,596-character** failure when an unrelated unit was
added. The new planner replays all **83 retained replies**, keeps **attempt 2**, and
prepares an exact joint first packet at **94,081 / 96,000 characters**, with three
mandatory packets in the replacement layout. Ordinary continuation admission succeeds.
No user-database migration/write or model call was performed. This is local packing
qualification, not a guarantee of future semantic verdicts, lookups or completion.

Verification: `npm test` passed (928 pretests, 776 main tests, 139 posttests), as did
type checking, the UI build, full browser suite/postchecks and the focused shared
browser runner. The focused 40→41 upgrade/portable/continuation test also passed
after adding actual service continuation at the next charged attempt, with no read
or lookup replay. Earlier fixture failures distinguished the old spurious v4 unit
failure from a genuinely oversized complete joint set and corrected the fixture's
required historical recovery parents. No live provider or installed desktop build
was exercised; all inference behavior in automated checks used deterministic adapters.

## Evidence-complete shared verification (2026-11-07)

**Source → target:** SQLite **39 → 40** is a reader-boundary migration; startup
does not rewrite work, rebase evidence, grant attempts, resolve blockers or invoke a
provider. Original formats 1–3 still replay their exact historical context. New
format **4** check layouts include every existing record directly referenced or
changed by the frozen draft, original sources of affected requirements and linked
question/current-answer bodies in every packet. Whole bodies remain exact and the
96,000-character budget and paid/pending capacity ceilings remain unchanged. An
indispensable set that cannot fit blocks rather than being truncated or split.

V4 check instructions explicitly limit a positive verdict to supplied page constraints
and those mandatory originals; **all** other pages and original batches remain
mandatory before atomic publication. Scheduled background is not described as text
belonging to the current page. Specific joint lookups may request scheduled missing
bodies and name already detailed counterparts via `withRecordIDs`; the next packet
must co-locate both sets. Read-phase scheduled lookup protection is unchanged.

Existing blocked checks with missing originals offer **Prepare evidence-complete
verification**. This is an authenticated, revision/workflow-version checked local
transaction, not AI consent or a passing verdict. It appends a v4 layout and provenance
(exact receipt-prefix hash, original job/revision, prior attempts and original-record
fingerprints). It retains the original blocker receipt, all read/check replies and the
frozen draft. Only that authenticated boundary permits reevaluation; prior blocker
feedback is included in the new packet and can still produce rejection or a new
blocker. **No extra attempts** are granted. Explicit Continue is required for inference.
Preparation is one-time, cannot revive an exhausted check and rolls back on fit or
validation failure. Reopen/retry retain committed metadata without repeating calls.

Portable formats **1–13 remain readable**; format **14** protects v4 layouts and
verification-preparation metadata. Continuation retains and validates the exact
blocked parent, prefix replies and spent attempts. Future formats and downgraded
envelopes reject without overwriting existing data. Assessment identities/freshness
and completed work are unaffected; this is not a semantic assessment migration.

A read-only real-checkpoint preflight preserved **82 replies**, **17/34 original
steps**, **attempt 1** and the unchanged frozen draft; it supplied **38 original
records** in a **94,921 / 96,000-character** packet (two remaining packets in the
new layout). No user-database writes/migrations or provider calls were performed.
This demonstrates exact local replay/fit, not live semantic verification or completion.

Verification: type checking, UI build, the full browser suite/postchecks and the
focused shared-answer browser runner passed. The deterministic suites passed as
928 pretests, 776 main tests and a final separate `npm run posttest` (139 tests).
Earlier runs exposed an empty-layout regression (fixed) and a new fixture requesting
an intentionally unfit joint set; the fixture now asserts that honest budget stop
and separately exercises a fitting scheduled-body/counterpart lookup. Upgrade tests
cover repeated 39→40 reopen, unchanged paid evidence, rollback after a simulated
interrupted preparation write, stale revision/settings rejection, portable 14,
earlier page-recovery ancestry, every check packet's original-record closure and
real negative verdicts after preparation. No live provider call or installed desktop
rebuild was performed; live semantic behavior remains unqualified.

## Paid/pending page capacity and accurate shared progress (2026-11-07)

**Source → target:** SQLite **38 → 39** is a transactional reader boundary only.
Startup retains original snapshots, batches, material/plan/context identities, replies,
attempts, grants and finished work. It neither invokes models nor changes project
revisions or assessment freshness. Explicit continuation can append page **format 3**
to a compatible unfinished ledger. Formats 1/2 still replay using their original
packing/capacity rules, including their historical 32-extra-page bound. No old page
layout or receipt is rewritten to make it look newly validated.

The prior cap summed `pages.length - 1` for **every historical layout**, including
abandoned future pages after a replacement layout. It also used that global layout
sum to throw an ordinary input-size error even when whole units could fit. New v3
packing counts actual successful page replies and the proposed remaining packets:
at most **64 paid/pending pages per original step**, **256 successful/pending pages
per group**, **128 retained layouts**, **32 packets per layout**, and **1,024 accepted
replies**. Already completed pages count even after re-layout or draft repair; only
unexecuted superseded plans stop consuming future capacity. Real per-page attempt
limits, the one-time recovery spend and workflow request consent are unchanged.
The existing **2-MiB saved-ledger bound** is checked with a full next-reply UTF-8
reserve before dispatch, so the larger layout ceiling cannot create work that the
startup/portable readers refuse on reopen.
No unused attempts are refunded and no new four-request allowance is introduced.
New capacity failures have a distinct bounded-work explanation, not a claim that
human constraints exceed 96,000 characters. A genuinely unfit whole unit still
reports its exact packet plus draft/metadata reserve without truncating evidence.

Shared diagnostics formerly counted all successful page replies as original completed
steps and could falsely report verification underway. Export now reconstructs the
same cursor as the engine from a **metadata-only SQLite projection** (step numbers,
response-kind booleans and page counts, never model output). `completedBatches`,
`remainingSteps` and `phase` refer to original steps; `pageAccounting` separately
reports successful page replies, current-step replies, layout count and historical
planned extras. Superseded plan totals are not spent calls or available allowances.
New measured request contexts optionally record the original step/phase and page
number/count/format. Older measurements remain unchanged; absent page details are
not invented. The diagnostic envelope remains format 1 with additive fields and
corrected shared-progress semantics; no saved evidence is rebased.

**Portable:** formats **1–12 remain supported**; v3 pages require **format 13**.
Ordering, historical replies, original recovery parents and compatible continuations
survive export/adoption. Unknown future page/measurement formats reject without
overwriting data. Interrupted upgrade retries preserve supported original bytes.

A metadata-only local inspection confirmed a real size-labelled stop with 16 layouts
and 32 historical planned extras. Its 30 successful page replies represented **6 of
34 original steps**, still reading, not 30 original steps/four remaining checks. A
bounded read-only preflight validated all 53 saved replies and packed the next input
at **76,571 / 96,000 characters**, retaining the spent attempt and original draft.
No user-database migration/write or provider call was performed for that inspection;
this qualifies exact local continuation/fit, not future model reasoning or completion.

Verification: `npm test` passed (928 pretests, 776 main tests and 137 posttests),
as did type checking, the full browser suite/postchecks on retry, final 45 shared-answer
regressions, the focused shared browser runner and diff checking. The first browser
run hit a Windows `EBUSY` cleanup lock after its recovery assertions passed; the full
rerun completed. Upgrade tests retain a legacy size-labelled capacity stop across
repeated 38→39 reopen, continue at the next charged attempt without replaying saved
pages, verify accurate original/page diagnostic counts, preserve portable format-13
continuation and reject a downgraded envelope. A final read-only check found the real
checkpoint's 98,070-byte ledger safely within the next-reply reserve. No provider
inference, user-data upgrade/write or installed desktop rebuild was performed.

## Requested-first pages and explicit loop recovery (2026-11-07)

**Source → target:** SQLite **37 → 38** is a transactional reader boundary; no
startup job conversion, new consent, reset or model call. Page **format 1** remains
replayable byte-for-byte. New page **format 2** orders unresolved requested records
before background evidence and explicitly identifies bodies already scheduled for
later pages. Those IDs remain unreviewed, but are excluded from repeat-lookup schema
enums and validation. Read drafts remain provisional until every original page and
check completes; missing indispensable joint bodies still block rather than approve.
An unfinished, unexhausted v1 page may append a v2 layout at the same receipt boundary.
No original batch, material key, paid receipt or context body is rewritten.

The defect reproduced a paid load → overflowing union → unchanged first page →
same load cycle. Merely fitting the first page was insufficient. V2 packet sizing
includes the actual scheduling advice and full draft reserve. Already completed
pages are not pulled back in as newly requested records. Existing limits, pinned
input and whole linked-support units remain enforced.

V1 prefix hashes also depended on receipt property insertion order before SQLite
checkpoint parsing normalized it. Replay now recognizes only the known original
producer ordering, database ordering, or a database prefix plus the final producer
job's suffix. Every receipt body/model/context/attempt is still validated; changed
values do not gain equivalence. V2 plans and new recovery metadata hash schema-
normalized receipt prefixes instead. Original bytes and historical hashes are kept.

An exhausted first v1 page can offer **Authorize page recovery · up to 4 requests**
only for a retained same-step lookup loop. The grant transaction checks exact current
inputs, original history, identical detailed bodies across the last two paid loads
and the stalled result, and that the new bounded layout actually details previously
requested evidence. Generic failures, conflicts, changed evidence, completed pages,
other projects and groups with an existing recovery allowance are excluded. The
authenticated revision/settings-CAS action preserves four spent attempts and every
reply, adds one format-1 `pageRecovery` grant and an authenticated v2 layout, and
pauses without inference. A later explicit Continue spends attempts **5–8**, not
1–4. Cancellation/reopen retain that spend. Successful page completion opens the
next ordinary four-attempt page; failure at eight cannot renew the grant. Original
source recovery cannot stack with page-loop recovery. All verification remains required.

**Portable:** formats **1–11 remain supported**. V2 pages or page-loop recovery
require **format 12** with original ordering, snapshots, plans and paid receipts.
The grant's original failed four-request parent is retained and authenticated during
decode; clone adoption cannot mint another allowance. Unsupported future page/grant
formats roll back startup unchanged and can be retried after restoring supported data.
Project revisions, assessment identities and concurrency counters are not migrated.

Regression coverage reproduces the repeated first-page loop and mixed-job checkpoint
ordering, verifies actual requested-body delivery and deferred lookup rejection, and
exercises no-call explicit consent, attempt five/eight, exhaustion, changed-input/CAS/
origin/auth rejection, repeated reopen, future-format rollback, portable missing-parent
rejection and actual clone completion. Live semantics and the private user's exact
project are not qualified by these fixtures.

Verification: type checking, `npm test` (928 pretests, 776 main tests and 135
posttests), all default browser runners/postchecks and diff checking passed. The
shared browser check separately exercises the new recovery action, no inference on
consent/reload, requested-body delivery, attempt-five cancellation, attempt-six retry,
full verification and mobile. No live provider calls, user-data edits or installed
desktop rebuild were performed.

## Bounded shared-answer evidence pages (2026-11-07)

**Source → target:** SQLite **36 → 37** is a transactional reader boundary only.
Startup does not rewrite jobs, reset attempts, renew consent or make model calls.
Existing material keys, frozen batch schedules and receipt/context hashes remain
unchanged. New schedules target 54,000 estimated evidence characters rather than
36,000, then split any packet that fails exact sizing with the full 24,000-character
draft reserve. This affects new work only, not paid schedules or assessment freshness.

A format-1 shared ledger can now append optional `evidencePages`, each with its own
format-1 marker, exact receipt-prefix hash/activation index, original read/check step
and ordered whole-record pages. On explicit continuation, an unfinished overflowing
read/check can partition its current evidence and any outstanding pages while retaining
all pinned answers, the full draft, exact linked support and the paid lookup. Replay
recomputes each page plan at its original boundary before accepting later receipts;
changed/omitted pages and future formats reject. No original step finishes until all
its pages succeed. A revised draft still requires the full original verification pass;
old page checks do not survive a repair. Each successful page is a distinct bounded
request step; its first attempt inherits the unfinished page's spent attempts, and
only its successful completion opens the next page's ordinary four-attempt allowance.
Repartitioning, reload, cancellation or retry never refunds an unfinished attempt.
There are at most 32 additional page steps across the ledger, and every actual call
still enforces the unchanged 96,000-character cap and coordinator request consent.

Oversized pinned constraints, an indivisible record with its required support, and
oversized repairs still stop without truncation or partial publication. Page guidance
requires an explicit blocker or original-body lookup when a joint comparison cannot
be established from the carried draft; paging does not presume semantic independence.

**Portable:** formats **1–10 remain supported**. Ledgers containing evidence pages
require **format 11**, preserving exact record order, original snapshots, lookup
receipts and attempts. Older readers reject the new envelope. Unknown page formats
roll back the SQLite upgrade; restoring supported bytes allows retry. No project
revision, assessment identity or workflow-concurrency version is migrated.

Regression coverage includes overflowing read/check lookups, unchanged receipt
prefixes and schedules, whole-record coverage, per-page bounded requests, delayed
original-step completion, tampered/future page rejection, repeated 36→37 reopening,
transactional future-format rollback, partial-page continuation and actual portable
clone completion. The diagnostic attachment is metadata-only: tests reproduce the
failure class, not the user's exact private project or live model reasoning.

Verification: `npm test` passed (928 pretests, 776 main tests, 131 posttests), as
did type checking, the complete browser suite/postchecks and final focused shared/
workflow regressions. Browser coverage includes real Continue admission of a saved
overflow, bounded page display, charged Pause/reload/resume and complete publication;
save-first coverage holds workspace responses while saving five answers. No live
provider calls, user-database migration or installed-desktop rebuild was performed.

## Original shared-answer support and explicit recovery (2026-11-06)

**Source → target:** SQLite **35 → 36** is a transactional reader boundary with no
startup payload conversion, consent, model calls or counter resets. The format-1
shared-answer ledger gains optional versioned `sourceSupport`: a receipt activation
boundary, the exact preceding receipt hash, ordered original-record fingerprints,
and (only for explicit recovery) its target IDs and one-time grant. Existing jobs,
completed work, original material/plan keys and pre-boundary context hashes remain
unchanged. An explicit recovery action appends grant metadata to the latest blocked
parent job; its original four spent requests, outcome, diagnostic, timestamps and
every reply remain intact. Subsequent worker jobs inherit that metadata and history.

The underlying defect was a mismatch between background current-decision projection
and edit validation: a proven superseded confirmation could be omitted from the task,
but a revision still required every original target source body. New shared plans
retain a separately fingerprinted catalogue of those exact original sources (and
linked original question bodies). Batch sizing accounts for linked-source cost, and
new batches render their targets' original support without treating it as current
authorization. The legacy material projection is deliberately unchanged for replay.
Historical evidence cannot authorize a new requirement or silently revive an old rule.

For an existing exhausted group, **Authorize source recovery · up to 4 requests**
is available only when stored feedback identifies an original same-feature target,
its original supporting source exists but was omitted, the group has four spent
requests and no previous source-support/recovery grant, and the ordinary two-repair
ceiling remains. The authenticated workflow action checks the current project
revision, settings version, latest group membership, absence of active execution/
workers and exact replay/fit inside one transaction. It records metadata and pauses;
it does not enable a disabled workflow, call a model or silently continue work.
Continue/process saved responses remains a separate explicit action.

The new allowance is **four additional requests once**, not a refund: the correction
step continues at attempt **5**, stops at **8 cumulative**, and cannot be granted
again. After a successful correction, ordinary verification steps retain their own
four-request ceilings. A grant activates only after the preserved blocked prefix;
it does not erase that blocker. A new genuine blocker remains terminal. Every original
evidence batch must check the corrected draft again. Source fingerprints and ordinary
material checks reject changed evidence without discarding history. Compatible later
revision numbers alone do not invalidate equivalent saved work.

Recovery details the edit target and its support during correction. Other batches
retain their original paid layout; exact historical support remains requestable when
needed during verification. Do not expand every background answer's question/history
into each request. Fit forecasts use the exact saved draft (lossless encoding is
non-monotonic), and each actual corrected-draft request still enforces 96,000 characters
without truncation. Publication's evidence union includes only original paid reads and
actually detailed supplemental support, never the whole unseen expanded catalogue.

**Portable:** envelopes **1–9 remain supported**; jobs with `sourceSupport` require
**format 10**, retaining exact record order. Their original grant parent is included,
and decoding validates its four spent requests, exact reply prefix and grant against
the continuation. Clone adoption cannot mint another allowance or repeat paid reads/
an accepted repair. Older readers reject format 10 rather than overwrite it. Future
support formats reject/roll back the SQLite reader boundary; restoring supported
payloads permits a retry without reset. Schema versions remain separate from revision
and workflow-concurrency counters.

Tests cover the superseded-confirmation omission, exact support without authority,
metadata-only authenticated/CAS-bound consent, stale grant rejection, attempt 5/8,
one-time exhaustion, preserved blockers/answers, bounded background layouts, changed
sources, byte-preserving 35→36 reopen, future-format rollback, portable downgrade and
missing-parent rejection, and actual clone continuation. Browser checks exercise the
separate authorization/Continue actions, no inference on authorization/reload, retained
four attempts, correction/reverification and mobile layout.

Verification: full `npm test` passed **1,829 tests** (928 pretest, 775 main,
126 posttest), and full `npm run test:browser` passed, including source recovery.
After the final coordinator retry adjustment, the focused shared-answer, diagnostic
and workflow run passed **113 tests**, and `npm run check` passed. The full suites
were not rerun after that adjustment. `npm run build:desktop` passed UI building and
desktop TypeScript compilation, but staged dependency installation failed with
`EPERM` unlinking `dist/desktop-app/node_modules/better-sqlite3/prebuilds/win32-x64.node`.
The binary may be held by a running desktop app; no process was terminated or forced
cleanup attempted. Complete desktop staging remains unverified until the lock is
released and the build is retried.

A read-only dry run against the reported saved group at revision 3272 confirmed
eligibility and the exact missing source in a **70,414 / 96,000-character** repair
request, with all nine saved-draft verification layouts fitting. No grant was saved,
no project data was changed and no model was called. This qualifies structural recovery
and fit only, not live repair quality. The separate post-request latency remains open.

## Shared-answer lookup request contract (2026-11-06)

**Source → target:** SQLite **35 → 35**; no schema, persisted payload, portable
format, material/plan/context identity, assessment or freshness migration is needed.
The dispatch-only shared-answer response schema now enumerates **only this request's
missing original IDs**, rather than advertising arbitrary strings. The prompt separately
identifies already detailed original IDs and explains that `availableEvidenceIDs` is
the overall task inventory, not permission to reload those bodies. Encoded identifier
indexes/aliases are not lookup IDs. With no missing evidence, the lookup response is
not offered. This view is derived from the existing manifest; it does not modify the
saved context data or any old receipt's hash. Overlapping/duplicate manifest inventories
reject rather than manufacture lookup authority.

The engine's existing atomic rejection of unavailable, duplicate or already loaded
lookup IDs is unchanged; these now have separate explanatory diagnostics. No failed
request is turned into a valid lookup, normalized, partially accepted or refunded.
Existing accepted receipts retain their original validity and replay exactly. A saved
repair at three spent attempts still has just its fourth attempt; updated prompting
does not extend it. A repair that genuinely needs further requests can still hit that
limit. Already exhausted groups remain exhausted. No startup inference or automatic
replay of the failed request is introduced.

Deterministic tests cover refreshed requestable enums after a paid load, original IDs
versus encoded references, absent lookup branches for fully loaded contexts, unchanged
old context/receipt data, invalid mixed requests, inconsistent manifests, and a saved
three-attempt repair completing on its fourth request using the retained load before
full re-verification. Verification passed: 106 focused shared-answer/diagnostic/workflow
tests, type checking, UI/desktop builds, the shared-answer repair browser check and
`git diff --check`. The full unit/default-browser suites were not repeated for this
dispatch-only follow-up. These fixtures do not establish live model compliance.
No real project data or provider was used.

## Bounded shared-answer draft repair (2026-11-06)

**Source → target:** SQLite **34 → 35**, a transactional reader boundary. No tables,
original job payloads, completed results, source IDs, context/material/plan keys,
assessments or paid attempts are rewritten on startup. The existing shared-answer
format-1 ledger gains an additive `answerGroupRepair` response and `repair` stage.
An original negative verification receipt is retained verbatim and now exposes a
corrective stage on explicit continuation, rather than remaining an unrecoverable
terminal rejection. Historical completed groups retain their exact semantics/bytes.
Explicit `answerGroupBlocked` receipts remain terminal; they are not repair authority.

Repairs append a complete validated draft and retain every original read/lookup,
rejected draft and check receipt. All checks of an earlier draft lose current authority
after a repair; **every original evidence batch must pass again**. Earlier reads remain
paid and are not dispatched again. Exact supporting evidence is still required for
changed actions. Feedback is a model finding, never a human preference or permission
to choose precedence. Two accepted repairs per original group are the durable ceiling;
the existing four-attempt step allowance includes its rejected check and repair
attempts, with no reset on Continue, cancellation, reopen or cloning. A successful
repair starts a new verification cycle, not a new group. The bounded receipt capacity
is 520 (32 read batches + three 32-batch check cycles + two repairs, each at most four
requests), retaining the original 256-receipt histories unchanged.

Explicit coordinator continuation may recover its own failed shared job only when it
is awaiting repair, has remaining attempts/repairs and no explicit blocked receipt.
It does not recover unrelated failures or grant review-only actions input-processing
authority. The historical completed-input marker is cleared only when explicitly
recovering that coordinator's unfinished job; newly interrupted/failed input passes
are no longer marked completed. Startup still does not arm workers or make calls.

**Portable compatibility:** the format-9 envelope and format-1 ledger remain; the new
response/stage variants travel with their original receipts and are replay-validated.
Older readers reject the unknown repair variants rather than reinterpret or overwrite
them; use an updated reader on the receiving machine. Existing exports and completed
work need no conversion. Future work formats roll back the 34→35 reader boundary and
retain original data for recovery. No fingerprint or freshness rule changes.

Upgrade tests cover byte-preserving repeated startup from a saved rejected v1 group,
future-format rollback/retry, explicit-only recovery, canceled repair/recheck attempts,
portable decoding and actual clone adoption without repeating reads or accepted repair.
Behavioral tests cover a late rejection, complete re-verification, existing acceptance
scenario correction, preserved unrelated answers, exact-source/scope rejection,
malformed and exhausted repair budgets, terminal genuine conflicts, and the historical
completed-input marker. Exact same-batch supplemental bodies remain available across
repair cycles; only the old verdict loses authority. Stage-specific request schemas
avoid duplicating the large draft schema in verification prompts; persisted receipt
validation retains the full union, and no original context hashes change.

**Verification:** full `npm test` passed 1,820 tests (928 pretest, 775 main, 117
posttest), with zero failures. The final 42 focused shared-answer/diagnostic checks,
type checking, UI/desktop builds, full default/post-browser suite and separate
coordinator/Guided browser checks passed. Browser repair checks cover visible progress,
Pause/reload/explicit resume during correction, preserved charged attempts, retained
reads and atomic publication after full re-verification. Existing bundle-size,
React-key and experimental timer warnings remain unrelated qualification limits.

This addresses the rejected-draft dead end, not the separately observed 112-second
post-request delay. No live model call or real-user-data write is part of verification.

## Continuous collection windows and diagnostic attribution (2026-11-06)

**Source → target:** SQLite **33 → 34** is a transactional reader boundary, with no
table changes or startup payload conversion. Workflow readers accept original
format-1 question collection unchanged and additive policy/progress **format 2**.
Only explicit continuous continuation adopts policy 2: original cumulative package
and request counts become the first current window's spent counts, preserving the
starting revision, current exact input binding, remaining time and all paid jobs.
Later window rollovers reset only their scheduling window counters, never cumulative
spend, task identities, stage receipts, failed attempts or grant/request-run receipts.
Active interval recovery remains conservative. Startup, reopen and reads do not opt
in or dispatch work. Old bounded grants and explicit review-only work remain bounded.

Policy 2 windows yield under the same continuous grant at successful work boundaries;
they do not renew a failed request's allowance. Cooperative time checks permit an
in-flight request/ordinary package to finish; actual per-request timeout failures
still stop with charged attempts. Staged budget pauses require the engine's explicit
request/time pause marker and accepted-step state before automatic continuation.
Input changes at a publication or window boundary stop rather than silently adopt
new product input. No legacy context/freshness hash or assessment identity changes.

New optional format-1 diagnostics retain allowlisted answer-selection/epic-selection
reasons, request gap timings, post-request tail timing and numeric bookkeeping costs.
The request-duration meaning stays unchanged. Final metrics persistence is excluded
from its own timing; earlier metric-write costs are measured without more writes.
Phase/gap/bookkeeping timings overlap and are not additive CPU attribution. Old
missing fields remain absent, not reconstructed as zero. New optional workflow
`stopReason` is copied into the worker's final run receipt and linked diagnostically
only through its recorded job IDs. Older receipts remain unchanged and export unknown
reasons. Future formats/reasons and invalid window/cumulative counts reject rather
than overwrite saved state. Capability versions stay independent of revision/CAS.

**Portable compatibility:** no envelope change. Collection consent/counters, stop
metadata and discovery timing/selection metadata are machine-local and excluded.
All underlying paid jobs, original snapshots and exact continuation ledgers keep
their existing portable rules; no repeat assessment/model calls are required solely
because the scheduling representation changed.

Deterministic coverage includes rollover beyond sixteen cumulative requests and five
passes, exact stage reuse, cooperative time rollover versus actual request timeout,
Pause/restart, source edits, held new input, retained human decisions, later-feature
pair selection, grouping explanations, incompatible-package explanation/privacy,
synthetic slow metric persistence/gap attribution and byte-preserving 33→34 reopen,
future-format rollback/retry and explicit-only adoption. The first broad unit run
caught eleven serialized-recovery comparisons differing only in new measurement
field order. New returned metrics now use the same validated serialization as their
stored payload; historical jobs are not normalized or rewritten. All 111 focused
retrieval/diagnostic regression checks then passed. Type checking, UI/desktop builds,
the full default/post-browser suite and separate collection/shared-answer/coordinator/
Guided browser checks passed (the Guided check was rerun successfully after a build
asset race in parallel verification). The final full `npm test` rerun passed all
1,812 tests: 928 pretest, 775 main and 109 posttest, with zero failures.
Real-project hidden time remains unlocated;
synthetic profiling is not a live speed or semantic-quality qualification.

## Bounded workflow question collection (2026-11-06)

**Source → target:** database **32 → 33**, an ordered transactional reader-capability
boundary. No SQL tables, old payloads, evidence identities or specification revisions
are converted. Workflow state gains optional format-1 `questionBatchPolicy` and
`questionBatch`: exact current input key, original starting revision, spent package
passes/request attempts, remaining active milliseconds, collection state and stopping
reason. A live interval checkpoint supports conservative time charging after a crash.
The schema version remains separate from workflow CAS/settings and project revisions.
Unsupported future policy/progress formats or malformed counters stop startup and
roll back the reader boundary without replacing the original row; reopening after
the incompatible record is restored can retry safely.

Only explicit continuous continuation adopts the policy. Old bounded/live grants
retain their prior behavior until explicit new consent; startup/reload never arms
work. A retained exact unfinished collection preserves counters across clean Pause
and reopen. Unaccounted wall time from its last live checkpoint is conservatively
charged on explicit recovery (including downtime after an unclean exit); absent old
measurements are not fabricated. The original engine still owns per-package evidence,
accepted replies, read/check stages, attempt ceilings and expected-revision publication.
Collection limits never reset paid task attempts or turn a partial package into a
completed review. Changes can start a later collection only through ordinary explicit
continuation; old ledgers and dated findings remain saved. Finished waiting batches
are not enlarged automatically, and unresolved proposals are never approved to fill
a question target. Existing review-only checkpoints keep their original scope.

**Portable compatibility:** unchanged. Workflow consent, counters and active intervals
are local metadata, not project evidence. Package jobs/snapshots/questions keep their
existing portable envelopes and exact-input continuation rules; no new migration,
freshness rebase, repeat assessment or model call is required for old saved work.

Focused deterministic tests cover multi-topic collection, soft-target overshoot,
normal activation, smaller waiting batches, five-pass/aggregate staged-request/time
limits, save-only input during collection, human-review stops, failures, stale results,
clean Pause/repeated reopen with original paid attempts, unclean-interval charging,
old-grant/work preservation and future-format rollback/retry. `npm test` passed
**1,805 tests** (926 pretest, 775 main, 104 posttest). After adding the final
post-publication edit guard test and byte-preservation assertions, all **14** focused
question-batch tests passed. Type checking, UI/desktop builds, the full default/post-browser
suite, and separate coordinator/Guided browser runners passed. `git diff --check`
passed. The existing UI large-chunk and unit-render React key warnings remain.
Live model speed, question quality, installed-desktop and cross-machine qualification
remain outstanding.

## Shared exact answer integration (2026-11-06)

**Source → target:** database **31 → 32** is an ordered transactional reader-capability
boundary with no SQL table or existing-payload rewrite. New jobs may carry optional
format-1 `answerGroupWork` (`exact-answer-group-v1`) and an exclusive `answerGroupStage`
context marker. Group IDs, original material/plan/context keys, whole-record partitions,
per-step attempts, complete read/check/lookup responses, original model/job/revision
provenance and per-answer model outcomes are retained. Startup validates supported
versions and group bindings; unsupported future work rolls back the migration and
leaves the source bytes available for correction/retry. Versions remain independent
of project revision and settings CAS counters. Older readers must not open database 32.

No old job, input, completed finding/date, grant or failed attempt is converted,
regrouped, discarded or made current on upgrade. Only new compatible answers in an
explicit coordinator submission can group. Paid individual work remains individual;
paid shared work resumes its exact original group or stops, never falling back to a
fresh allowance. Fresh grouping fit failure occurs before any dispatch. Existing
stale-result, lease/owner, finite attempts and atomic-publication checks still apply.
Valid replies are retained before stale detection, but cannot publish over newer input.
Group input changes remain incompatible, with the original ledger preserved; automatic
changed-material reconciliation or rejected-draft clarification is not manufactured.

**Portable source → target:** formats **1–8 → 9** only when retained shared-answer work
is present. Exact current record order and required original snapshots preserve wire
replay. Incomplete group ledgers and linked waiting submissions survive actual folder
adoption under an explicitly selected account; account IDs, sessions, telemetry and
diagnostic measurements do not travel. Completed unneeded group job archives are not
exported. Older envelopes cannot carry the new work; unsupported future formats and
hybrid/mismatched task bindings reject rather than strip the group. Existing exports
without shared-answer work retain their previous format.

Deterministic tests cover the five-answer 90→18 request comparison, complete evidence
and per-answer coverage, scoped/foreign/paid-work rejection, malformed output, explicit
source authority, frozen checks, semantic rejection, four-attempt exhaustion, cancellation,
timeout/late output, wrong-model/research violations, concurrent edits, exact lookups,
no-call publication recovery, repeated reopen, future-format rollback/retry and actual
portable-folder adoption without replay. A dedicated browser runner exercises five
save-only responses, shared progress, owned Pause, reload, charged resume without
repeating reads, atomic updates, sanitized snapshots and mobile layout. Verification:
`npm test` passed **1,792 tests** (926 pretest, 775 main, 91 posttest). After final
schema/profile hardening, `npm run check`, all 15 focused shared-answer tests and
`npm run build:desktop` (including UI build) passed. The dedicated shared-answer
browser check and full `npm run test:browser` suite (including post-browser runners)
passed. `git diff --check` passed. The UI build retains
its large-chunk warning. No live inference, real-user data writes or real-project
speed/quality qualification is implied.

## Save-first answer collection and local timings (2026-11-06)

**Source → target:** database **30 → 31** is an ordered transactional reader-capability
boundary, without table changes or payload backfill. Workflow format 1 accepts optional
`inputBatchPolicy: {format:1}`; local discovery metrics accept optional numeric
`submissionLocalMs` phases (history, preparation, replay, context, checkpoint,
validation, publication). No revision, task/material/context key, evidence batch,
completed response, finding/date, spent attempt or grant is rewritten on upgrade.
Unsupported future workflow policies reject startup and roll the migration back;
restoring supported source metadata permits retry. Downgrade to older readers is
unsupported. Schema version remains separate from settings/revision CAS counters.

Only an explicit continuous Continue/Submit action activates collection. Old grants
without the policy keep their prior input-wake behavior. Once adopted, a waiting
decision holds automatic wake-up; explicit submission captures the saved response
IDs, regardless of their original automatic flag. Input saved later cannot piggyback
on the grant. The original flags remain intact. Partial batches do not answer other
questions. Reopen never arms either old or new consent; original stage replay and
publication validation remain required. No paid work is invalidated or repeated solely
by this scheduling change. Integration is still one response at a time in this slice.
Targeted SQLite job selection preserves original row order and full matching staged/
clarification ledgers; it changes local reads, not saved task identities or authority.

**Portable behavior:** no format change. Workflow consent and discovery metrics are
machine-local and not exported; original project decisions/submissions and supported
semantic checkpoints retain the existing formats and exact authority.

Deterministic upgrade tests cover original saved grant/job bytes, absent historical
timings/policy, repeated startup, future-policy rollback and successful retry. Service
tests cover five saved answers with no requests, restart, partial submission and new
input during processing; existing malformed/cancelled/stale/recovery tests remain.
Verification: `npm test` passed **926 pretests, 775 main tests and 76 posttests**.
The full default/post-browser suite and separate Manual/Guided and coordinator browser
runners passed, including save/reload without inference, explicit submission and mobile.
The final targeted staged-input/recovery/workflow/upgrade rerun passed **122 tests**.
Type checking, UI/desktop builds, CLI help, the synthetic benchmark and diff checking
passed. The first broad run caught an outdated schema-version assertion, corrected
before rerun; the first browser run hit its shell timeout and passed with sufficient
time. The coordinator browser assertion now follows the existing discovery-before-
checkpoint ordering rather than the older assessment-first ordering.
No live model calls, real-user database writes, packaged-desktop installation or
real-project latency improvement is qualified. The synthetic local benchmark is not
a reproduction of the attached diagnostic export's 65–88-second local overhead.

## Shared area impact review (2026-11-05)

**Source → target:** database **29 → 30** is a transactional reader-capability
boundary with no table/payload rewrite. New optional shared work/markers and
format-4 `definition-change-group-v1` receipts are supported. Existing v1/v2/v3
tasks, lookups, response keys, baseline chains, paid attempts and live leases retain
their original bytes/meaning when new metadata is absent. Unknown future shared
policies/versions reject startup transactionally; correcting the unsupported source
allows retry without reset or calls. Versions remain independent of revisions/CAS.

New grouped work saves exact per-area task/context/assessment/baseline bindings,
original revisions, a group context key, co-read guard, attempts and the validated
response/model/job. All verdicts publish atomically. Shared responses retained before
a lost publication can be reused locally on explicit continuation; no paid replay
is required. A source-review deferral permits individual v2/v3 continuation only
after parent-response/context authentication, inheriting charged attempts. It does
not open a new three-attempt allowance. Old paid single-area work is not regrouped.

Receipts retain original findings and dates and add a separate co-read guard over
up to sixteen feature/evidence roots. Uncited foreign changes invalidate this new
authority; incremental comparisons include their full exact delta. This deliberately
broadens freshness for new co-read work, not for existing historical assessments.
Unsupported scope/fit/indispensable joint evidence still stops or uses deeper review;
no evidence is summarized, truncated or manufactured as independence proof.

**Portable source → target:** existing formats **1–7 → 8** only when shared work,
guards or group-origin metadata is present. Format 8 preserves exact record ordering,
necessary parent handoffs, original request/assessment snapshots and baseline ancestry.
Decode validates exclusive group/job bindings and handoff parent metadata; dispatch
reconstructs exact historical contexts before reuse. A sibling's later assessment
does not orphan an eligible deferred feature. Obsolete unrelated jobs, activity
archives, sessions, accounts and workflow consent are not exported. Older readers
reject format 8/database 30 rather than stripping provenance; downgrade is unsupported.

**Deterministic verification:** dedicated tests cover lossless pooling, cohort/fit
limits, complete area coverage and citation isolation, co-read invalidation and foreign
incremental deltas, inherited deferral attempts, actual empty-store folder adoption,
saved-response recovery, repeated startup and transactional future-version rollback,
three-attempt ceilings, stale edits, cancellation, timeout and sticky research/model
violations. The final broad rerun passed **921 pretests, 774 main tests and 76 posttests**,
plus every configured default/post-browser runner (including shared-review progress,
owned Pause/reload/resume, original findings, one-request accounting and mobile).
Final recovery/priority/log-filter and durable-reply-capacity additions additionally passed **75 targeted tests**,
including actual individual completion after a shared deferral and a replaced sibling's
not-yet-started handoff. Type checking, UI build, CLI help and diff checking passed.
No live model qualification, user-data repair or installed-desktop rebuild is implied.

## Question-batch review checkpoints (2026-11-05)

**Source → target:** database **28 → 29** adds a transactional reader-capability
boundary, with no SQL tables/payload backfill. Workflow format 1 accepts optional
`reviewPolicy: {format:1}` and `reviewCheckpoint: {format:1, inputKey, revision,
state, explicit}`. Schema versions remain separate from project revision and workflow
CAS counters. Unknown policy/checkpoint versions fail startup transactionally and
retain original bytes, grants, jobs and evidence; resolving the unsupported source
permits retry. Ordinary startup leaves absent/legacy fields, saved jobs, paid replies,
allowances, dated findings and live leases unchanged and never arms a scheduler.
The next explicit Continue specification/Review changes activates the new scheduling.

The old coordinator could review outside-scope areas while waiting for one answer,
then reassess after the next; it also repaired all outdated areas before discovering
the next related question. New scheduling holds area reviews throughout collection,
including questions discovered sequentially rather than only a pre-existing list.
Saved-answer processing still runs within existing consent. Related question discovery
precedes the assessment checkpoint; only a settled pass and resolved decisions close
the batch automatically. This is not automatic independence or currentness authority.
Existing freshness hashes, v1/v2/v3 change tasks, assessment findings and source/model
receipts are unchanged. New UI/API action `review-changes` is authenticated, revision/
settings-CAS checked and bounded to the existing eight-request/five-minute allowance.
It performs review-only work without answering questions, approving proposals,
exploring new gaps, launching research/coding or widening per-task failed attempts.
Completion always pauses so later responses cannot repurpose review-only consent.
Existing saved assessment recovery is explicitly reachable through Review changes.
On normal Continue, an exact-input unfinished assessment or saved change-review
task also takes precedence over new collection. This uses scoped checkpoint/task
metadata only for scheduling; full existing replay still validates the work. The
first broad run caught this compatibility boundary in five saved-stage regressions;
they pass with direct same-input continuation, without new discovery calls or
reset attempts. Changed-input/new-question batches do not gain this exception.

Checkpoint keys have their own `review-checkpoint-v1` digest over the unchanged
workflow key plus summary/goals/actors/assumptions. They do not replace old task keys.
The starting revision/key remain fixed across same-input Pause/restart/resume even
as review publications increment the project revision. New queued submissions or
changed semantic inputs pause the cycle; later explicit continuation collects a new
batch instead of automatically restarting all reviews. Stale replies follow existing
durable retention rules and cannot publish over newer decisions. Compatible paid
area work is reused under the existing exact task identities, not reset by a new
workflow grant or app upgrade. Failures/Stop still stop and retain charged attempts.

**Portable behavior:** project records, pending submissions and supported semantic
jobs remain exported by the existing format; no portable version changes. Machine-local
workflow consent/checkpoint scheduling is not exported or inferred on adoption.
Unanswered decisions and dated findings reconstruct the pending batch; explicit
continuation on the clone creates local scheduling without invalidating imported
compatible task identities. No historical checkpoint/run provenance is fabricated.
Older strict readers reject database 29 rather than stripping the optional metadata;
downgrade after activation is unsupported. Separate explicit tasks and legacy
automatic-maintenance opt-ins are preserved; this policy applies to coordinated work.

**Verification:** type checking and 58 workflow tests cover five related answers
with a restart halfway through, sequential follow-up questions with no intervening
area assessments, explicit review-only checkpoints with pending choices, new input
during review, saved protocol recovery/exhaustion/semantic blockers, additive upgrade
and future-format rollback/recovery. The full test rerun passed **920 pretests,
774 main tests and 64 posttests**. The final review-only completion guard (later
answers cannot spend its leftover allowance) additionally passed all 58 workflow
tests and type checking. API tests reject unauthenticated/foreign-origin, stale
revision/settings and extra-limit Review changes requests without dispatch. UI build,
all 22 default browser runners and both post-browser runners passed again in the
final browser rerun. CLI help and diff checks passed. No user data
changes, live model calls, installed desktop rebuild, or shared multi-area
impact-review implementation have been performed in this slice.

## Verified incremental change baselines and visible saved scores (2026-11-05)

**Source → target:** database **27 → 28** is an ordered transactional capability
migration. It changes no project/job payloads, assessments, evidence, revision
counters, live leases, responses or allowances. Strict change-review work and
receipt schemas accept optional `baseline: { format: 1, revision, inputKey,
receiptKey }`; unknown versions still reject startup without committing migration
history. Reopening does not issue baselines, resume workers or make model calls.
Schema version is independent of project optimistic-concurrency revisions.

Previously every new project-wide question/answer made existing assessments stale,
and later change checks compared the entire accumulated delta since original
assessment publication, even after earlier semantic checks found it unaffected.
The UI replaced the saved percentage with “Change check needed.” Findings were
retained but the presentation looked like a reset. It now displays **“N% saved ·
validity pending”**, with the saved findings available and a distinct header label.
This is not a new currentness/readiness claim or a new scoring formula.

New eligible checks may compare from the latest saved **unaffected** receipt for
the exact unchanged assessment. The app loads its actual publication snapshot at
`reviewedRevision + 1`, validates its exact receipt hash against the saved receipt,
assessment identity and original publication/input basis, actual guarded input key,
project/area, global interpretation and chronology. Earlier baseline links require
their saved publication and reviewed-input snapshots, exact receipt bindings and
the same original assessment. Missing, altered, unsupported or oversized ancestry
fails closed, never invents provenance or marks an area current. The bounded chain
is retained explicitly; it is not inferred from matching citations or graph links.

All nine full original findings still accompany every exact delta. Original
`originalRevision`, dates, evidence and confidence remain untouched; the optional
baseline is separate dated semantic evidence. Instructions require cumulative
interactions with prior decisions/current supporting evidence to be considered.
New decisions always require semantic review. Review-needed results do not become
baselines; destructive/global/organization changes, corrections and uncertainty
retain the established deeper-review fallback. Local v3 batch results still cannot
publish unaffected authority: the final joint verdict remains mandatory.

Existing **same-input v1/v2/v3 tasks take precedence** over the new basis. Without
the optional field, fields/hashes/context keys remain byte-compatible; completed
responses, accepted lookups/batches and exhausted attempts are not rewritten or
reset. New work binds the optional descriptor through v2 loads, v3 overflow and
joint contexts, saved-task reconstruction and publication. Failure, cancellation,
stale edits and restart retain it and all charged attempts. This is not permission
to replay incompatible calls or automatically repair user data.

**Portable 1–6 → 7 when necessary:** baseline-bearing work/receipts require state
format 7 with the existing exact record-order envelope. Older formats remain
readable and are still emitted without the new metadata. Export retains the
publication root for a saved receipt even after a new answer makes its publishing
job obsolete, plus every required earlier baseline and reviewed-input snapshot.
Thus an answer exported before the next task starts can use the same validated
baseline after adoption. This is not full activity-history/session export. Missing
legacy optional roots remain absent honestly; required new chain snapshots cannot
be silently dropped. Unsupported future versions reject without overwriting data;
downgrade after new metadata is saved is unsupported.

**Qualification so far:** type checking and 73 focused tests passed, including
three successive incremental decisions, review-needed exclusion, exact identity
and snapshot tampering, saved legacy/exhausted work precedence, repeated startup,
27→28 migration/rollback/recovery, portable root preservation/adoption, accepted
lookup reuse, failures/cancellation/staleness, and v2→v3 batch/joint continuation.
Read-only revision-3178 preparation found nine exact matching unaffected baselines;
each compares only the three latest changed records instead of cumulative older
decisions. Fourteen other assessments have no matching prior unaffected result
and retain their original assessment basis; no narrower authority was fabricated.
The definition-stage label is “20% saved · validity pending.” No user database/project writes
or live inference were performed. UI build, all 22 default browser runners and both
post-browser runners passed, including visible saved-percentage/pending-validity
presentation. CLI help and diff checking passed. The first full run found a stale
schema-version assertion and the existing supplemental post-page persistence
fixture's UUID-sensitive legacy 64-step execution ceiling. The assertion now expects
28; that persistence fixture explicitly activates the existing scoped execution
policy before saving, with legacy-ceiling tests and production bounds unchanged.
Both focused regressions and all **211** staged-service tests passed. The full
`npm test` rerun passed **913 pretests, 774 main tests and 64 posttests**. The final
baseline instruction is also present in both v3 batch/joint contexts and passed
the 73-test focused run and type checking. Installed desktop/live continuation
remains unqualified.

## Bounded cross-feature provenance and authenticated approvals (2026-11-05)

**Source → target:** existing definition work format 1 can append an optional
`provenancePolicy` format-1 activation after exact replay. It records the original
context hash, receipt/attempt/lookup/schedule boundary, absent policies, original
blocker and bounded complete restored pairs. Historical responses, rejected
lookups and accepted lookup contexts replay under their original policy; a later
activation never converts a rejected response into an accepted lookup or refunds
attempts. The existing transactional checkpoint saves the event before dispatch.
An interruption before checkpoint can recompute it without inference; repeated
startup/adoption retains the same event and successful reads. Unknown event
versions and unsupported fields reject without inventing replacement provenance.

The reported revision-3168 case was not a context overflow or missing human choice.
Both exact human answers were saved in another feature, but only referenced in the
requirement's rationale, not its structural `sourceIDs`. Their questions explicitly
cited the supplied requirement in `evidenceIDs`. The forward-only lookup policy
therefore rejected the canonical answer IDs. Separately, the review treated a
quoted pre-approval proposal disclaimer as if it revoked the later cleanup approval.
The existing `currentDecisionProjection` validator proves an exact accepted-proposal,
confirmation-envelope, current-target and supersession match for that cleanup.

The new local navigation uses **one reverse structural hop from supplied requirement
IDs** to complete current answered-question/answer pairs. It exposes all matching
pairs only when at most ten match; saturation exposes no arbitrary prefix. No UUID
extraction from prose, fuzzy search, unrelated project-wide allowlist, inferred
precedence or new decision is permitted. Future explicit lookups load both whole
records within the same 20-record bound. A saved lookup blocker can be superseded
only when an actual rejected canonical lookup is explained by these exact missing
pairs. Genuine blockers with the evidence already supplied, product-decision and
technical blockers are retained. Restored records earn no successful-lookup credit.
Ordinary same-scope reviews keep their existing fitting contexts: activation is
limited to actual foreign provenance or the demonstrated saved lookup boundary,
not merely the presence of an answered question or a cleanup receipt.

Requests also expose approval receipts only for supplied sources that pass the
existing exact receipt validator, alongside the unchanged complete original source
text. The instruction distinguishes a proposal's original disclaimer from the later
human approval of its exact replacement/scenarios. Neither links nor mere wording
establish broader approval, implementation verification or joint consistency.
Historical S labels remain unchanged; supplied foreign records use stable
`P:<canonical ID>` labels independent of unrelated record insertions. Each complete
new request, including receipts and navigation, must fit the existing 96k budget.

Published assessment `inputBasis` format 1 gains optional app-owned
`additionalEvidenceIDs` for actual reads outside its original guarded input scope.
This is **not** a change to model citations or findings. Publication computes the
existing v1 input hash over cited evidence plus those exact reads. Coverage,
change-impact tasks, dependency/retention checks, portable continuation and
serialization compatibility use the same expanded scope, so later edits to an
uncited foreign answer cannot silently remain current. Old assessments with no
extension retain identical hashes and semantics. AI proposal schemas cannot set
this app-owned field. No SQL table/version change or startup rewrite is required;
database 27 and portable 1–6 carry the optional fields. Older strict readers reject
them rather than discard them; downgrade after activation/publication is unsupported.

**Conservative remaining boundary:** the existing baseline-collection and partial
checkpoint format cannot yet attest extended foreign evidence across changed
revisions. It therefore does not issue that narrower reuse certificate for work
with actual foreign reads. Original dated work remains saved; unchanged-input
continuation and extended freshness remain supported. Changed-input work may need
the established full review. This does not certify arbitrary cross-feature
independence or change-review accuracy.

Read-only replay of revision 3168 retained both accepted assessment responses, the
accepted lookup, the rejected lookup and all three spent attempts. The prepared
request includes both exact answers/options and validates the approved cleanup at
**78,109 / 96,000** characters. Original database/job bytes were unchanged. Eight
focused tests cover exact replay, structural eligibility/saturation, approval
authentication, whole-pair lookups, repeated reopen/portable adoption, foreign
freshness without invented citations, failure, cancellation, stale edits and
exhaustion. They also verify that an unsupported saved event remains byte-identical
after rejection and can be reopened after restoring its supported representation.
Those tests, type checking, CLI help and diff checking passed. The UI build, all 22
default browser runners and both post-browser runners passed with deterministic
adapters. The first broad test run reached the existing supplemental post-page
fixture's 64-step ceiling; activation was subsequently narrowed to actual foreign
provenance, and all eight new tests plus that fixture passed together. The final
`npm test` rerun passed **913 pretests, 774 main tests and 54 posttests**. The final
structural-preparation optimization also passed the nine-test focused run and type
checking. No actual-user model continuation or installed desktop rebuild has been
performed.

## Receipt-backed all-dimension continuation (2026-11-05)

**Source → target:** existing `DefinitionWork` format 1 with no dimension ledger
can append a `dimensionReviews` event **format 2** at its unfinished receipt
boundary. Historical format-1 events still require two or more dimension groups;
format 2 activates exactly one group containing all nine original checks, once,
only with accepted whole question/current-answer pairs in the same phase. Unknown
event versions are rejected. Database 27, portable state 1–6, original input/plan
identities and published assessment semantics do not change. Older readers reject
the new event rather than silently treating it as a historical format-1 split;
downgrade after adopting the event is unsupported.

The legacy schedule can reach its combined 64-step ceiling before enabling the
existing dimension protocol. That protocol both separates scheduling capacity and
uses receipt-backed same-phase pair reads. Previously, an all-nine-check view that
already fit was rejected merely because it needed no dimension split, leaving
splitting, paging and capacity upgrades mutually blocked. Explicit continuation
now records the version-2 event only when the original request overflows and this
complete view fits. No artificial split, larger context budget or model allowance
is introduced. Original receipts, raw responses, dates, models, exact human text,
source IDs and spent attempts are preserved. Existing multi-group events retain
their original projection and hashes.

This is a local forward scheduling event after exact replay, not a database-startup
rewrite or a model result. The existing transactional checkpoint saves it before
dispatch. Reopening or adopting a portable workspace retains the same event; an
interruption before checkpoint can recompute it without inference or refunds.
Separate earlier reads never establish joint consistency: indispensable exact
records remain reloadable under existing limits, uncertain relationships still
block, and every remaining verification must finish before publication. Technical
overflow now has a technical blocker kind and reports the actual limiting ceiling;
UI guidance does not ask for a product answer to repair a technical failure.

Read-only replay of the reported revision-3163 checkpoint validated all **60**
accepted responses before and after an in-memory event, preserved every receipt
and the zero unfinished attempts, and prepared **70,616 / 96,000** characters
(previously **121,093**). The saved database/job bytes were unchanged; no live
model calls or actual-user publication were performed.

Qualification passed: `npm run check`, `npm test` (**905 pretests, 774 main tests,
54 posttests**), seven focused continuation/technical-blocker regressions, 21
focused UI tests, both CLI help commands and diff checking. The standalone whole
definition-stage run reached its 120-second command timeout after 181 passing
tests; the subsequent complete `npm test` run included that suite and passed.
The UI build and all 22 default browser runners plus both post-browser runners
also passed with deterministic adapters and no live inference. The running
desktop/installed application has not been rebuilt, and actual-user model
continuation remains unverified.

## Shared citation authority across all change-review protocols (2026-11-05)

**No persisted-format change:** database 27, work/receipt formats 1–3 and portable
formats 1–6 retain their existing semantics. Earlier advice fixes covered v3 batch
and joint review, but fitting v2 checks still used their older dispatch wrapper.
The reported revision-3150 epic is a v2 task, distinct from the previously inspected
project-wide and batched-epic tasks.

Read-only native response inspection matched the selected model, exact request and
task/context keys. Three paid lookups are accepted, with one spent unfinished attempt.
Of 37 supplied records, 36 are citable under the existing v2 rules. The sole invalid
quality-check citation was `f889b3ac-6ff1-402a-a41f-54bf8def7cb7`: its whole body was
supplied for historical comparison but was superseded. The original response claimed
unaffected; that claim remains rejected, not repaired or certified by this diagnosis.

`changeEvidencePacket` now builds bounded advice/wire encoding for both v2 and v3.
`withChangeCitationAuthority` reconstructs equivalent advice for v1/v2 dispatch or
seed-context callers; v3 still requires its explicitly scoped authority, never a
permissive reconstruction from served inventories. The shared model prompt renders
and validates one positive-whitelist/historical-exclusion explanation for **every**
change-review protocol, including direct-provider and OpenCode routing. The v1 exact
original validator set/final-only grammar is preserved; v2 exposes its existing
`evidenceCitationIDs` set and source-request/final grammar. Neither path can silently
bypass the advice solely because the request fits without batching. Both v3 grammars
and stricter scope rules remain unchanged.

The single shared packet builder reserves the full serialized advice inside the
same 96,000-character bound and shares existing ID tables losslessly when useful.
No original wording, finding, change, navigation prefix selection, question/answer
unit, task key or expanded-data context hash is changed. Advice stays transient, not
an additional job/work/receipt/portable field. v2 accepted lookup replay checks its
original expanded hashes without a new-advice dispatch ceiling; compatible saved
verdict publication also remains local/no-inference. Only a pending new request must
fit, with the existing explicit v2→v3 continuation available for actual overflow.
Legacy v1 dispatch rejects an unfit request before reserving another attempt, rather
than discarding old work. No reset, allowance extension or attempt refund is introduced.

The common final-response validator now separates wrong task keys from actual invalid
IDs and labels known historical exclusions instead of returning the generic combined
message. Structural nine-finding/outcome/distinct/nonempty checks remain unchanged.
No returned citation is deleted/remapped or accepted merely because other citations
in its check are valid. The reported v2 request prepares at **95,516 / 96,000**
characters with the **same context hash**, three saved lookups and one spent attempt.
Its original invalid native response is still invalid. No real project data was
written, old request repeated, or model/provider fallback performed.

All **54** focused change-work tests, final `npm test` (**899 pretests, 774 main tests,
54 posttests**), type/diff checks, CLI help, the UI build/all **22** default browser
runners plus both v2/v3 post-browser runners, and isolated recompiled Electron
desktop/startup suites passed. The first broad run reached the existing 64-stage
bound in the supplemental post-page continuation fixture; that test passed its
targeted rerun and the final whole-suite rerun without changes to its fixture or
engine. This observed boundary-test instability is not a newly qualified arbitrary
context-size guarantee. The regression matrix includes v1 and v2 seed/dispatch
advice and grammars, v2 loaded historical versus unloaded original citations, exact
positive sets and unchanged raw outputs/lookup keys/attempts, compatible saved-v2
reuse versus a blocked new request under a test-local smaller dispatch ceiling, and
the existing v3 batch/joint cases. The v2 browser runner now checks advice before and
after whole-source loading through the actual service path. Legacy stored-v1 upgrade
fixtures also verify dispatcher advice and unchanged saved responses/attempts.
Corrected live completion remains unqualified; no user-data write, model request,
attempt refund, commit or push was made during this fix.

## Positive citation authority for every batch stage (2026-11-05)

**No persisted-format change:** database 27, work/receipt 3 and portable state 6
remain unchanged. The previous positive-allowlist fix applied to joint review only;
batch requests still exposed historical exclusions without an exact positive set.
The new report concerns a different epic at revision 3144, not the completed
project-wide review at revision 3139.

Read-only reconstruction found **four accepted lookups, one accepted batch and two
spent attempts** on batch two of three. The completed native request matched its
saved selected model, task, context and batch keys. It cited
`22c71115-b100-46f5-956a-a7245067993c` in all nine checks. The source was known and
non-superseded, and its ID appeared in the complete original findings, but its whole
body was not supplied in this batch. The unchanged validator correctly rejected it;
neither an original finding's citation nor an ID-table entry grants current stage
citation authority. Review-needed concerns in that invalid response are not converted
to approval or silently removed by this fix.

**Both batch and joint stages now receive an exact positive whitelist** generated
from the existing validation rules. For batches it is every whole current supplied
record, excluding historical-only sources. Joint review retains its narrower current
window/actual accepted-check citation set. Every returned citation, for either outcome,
must belong to that stage's whitelist. The shared OpenCode/direct prompt also requests
only the current stage's JSON grammar: batch checks for a batch; source request or
joint verdict for joint review. This is app-owned prompt/schema guidance with local
validation, not a claim of provider-native schema enforcement or new tool permissions.

Near-full contexts cannot afford another duplicated array of long source UUIDs.
Advice therefore uses `citableEvidenceIDs` for literal IDs or, when smaller,
`citableEvidenceRefs` sharing the **existing** request `identifierTable.values`.
Integer references are zero-based; strings remain literal original IDs. A runtime
round-trip verifies that the complete decoded whitelist is unchanged. No second ID
table, shortened list, sampled evidence or new record alias is introduced. Responses
still must return original string IDs; output citations are never repaired/coerced
from indexes, stripped or remapped to make an invalid response pass. Missing,
ambiguous or malformed allowlist advice fails before a new model request.

The complete serialized advice remains within the same 96,000-character bound along
with the exact body. Advice is transient and regenerated; it is not a new saved work,
receipt or portable field. All human/source text, complete findings and changes,
frozen batch boundaries, expanded-data hashes, accepted responses, dates and spent
attempts remain unchanged. The reported batch prepares at **94,508 / 96,000**
characters (previously 94,312), with exactly **59** citable current records and three
historical-only records. All saved lookups/batch checkpoints reconstruct and the
original invalid response remains rejected. No real-user data was written or model
request repeated. The remaining current-stage attempt was not reset or dispatched.

All **53** focused change-work tests, final `npm test` (**899 pretests, 774 main tests,
53 posttests**), type/diff checks, both source-backed/batched browser runners and
isolated recompiled Electron desktop checks passed. Regressions verify literal/compact whitelist equivalence,
unencoded string IDs, out-of-range/fractional/negative/ambiguous references, exact
batch authority versus tempting IDs in original findings and the shared dictionary,
strict rejection for either outcome without response mutation, frozen hashes and
stage-specific prompt grammars. The browser runner verifies positive advice through
both actual stage paths. Live corrected completion of this epic remains unqualified;
no user-data write, model request, attempt refund, commit or push was made.

## Exact joint-review citation allowlist (2026-11-05)

**No persisted-format change:** database 27, work/receipt 3 and portable state 6
remain unchanged. The joint request now exposes its existing validator's **exact
positive `citableEvidenceIDs` allowlist** in the ephemeral app-owned request sidecar.
It consists of current whole records in the joint window plus current IDs actually
cited by accepted batch checks. `availableEvidenceIDs` and each batch checkpoint's
served `evidenceIDs` remain navigation/inventory only; serving a record to a prior
batch is not permission to invent a new joint citation from its ID alone. Necessary
uncited available records can still be explicitly rehydrated as whole units using
the remaining original lookup allowance before a fresh semantic verdict.

Read-only inspection of the reported revision-3139 failure found **all three batches
complete**. The completed OpenCode V2 joint request/selected model, outer and nested
task keys and all batch acknowledgments matched. Only one permission-check citation
(`46411974-b127-435a-9622-76269b1f61c2`) was outside the allowed set: it was a known,
non-superseded record served in an earlier batch, but none of the saved batch checks
cited it and its body was absent from the joint window. Other inherited batch citations
were valid despite being absent from `manifest.includedIDs`. The overall response
also retained review-needed concerns; this diagnosis does not turn them into an
unaffected result. A later owned retry was observed running with two charged joint
attempts and was neither interrupted nor modified by the investigation.

The shared OpenCode/direct-provider prompt now states the whitelist exactly for
**every** joint check, distinguishes the two inventory lists, and tells the model to
request required bodies instead of guessing or replacing citations. Missing joint
allowlist advice fails before dispatch. Diagnostics separately identify outer/nested
task keys, batch acknowledgment mismatch, historical citations and uncited/unloaded
IDs, rather than falling through to the generic final-response error. Invalid citations
are not silently deleted/remapped, including when other citations in that check are
valid. The original rejected native reply remains invalid under the unchanged rules.

Advice is rebuilt from frozen snapshots/checkpoints and is not added to saved work,
receipts or portable artifacts. The same reconstruction function supplies both the
printed allowlist and the validator set, avoiding divergent policy implementations.
Its complete serialized size is reserved inside the unchanged 96,000-character input
bound before lossless ID sharing. Expanded data hashes, source ledger, batch partition,
accepted responses, dates, grants and attempts do not change. Completed responses and
accepted joint lookups keep their original hash-bound replay path. New dispatches
and newly requested source groups must fit the bound; local replay/publication of a
compatible saved response cannot be blocked solely by added advice overhead. No upgrade/reset,
attempt refund, re-partition or repetition of completed batch inference is required.

The exact failed request still reconstructs under context key
`5b0f51cbcb0e179b5fb9bd6cd687876b4681fa0d508b79b1c2d3549929acef8b`;
its bounded request including explicit allowlist prepares at **75,544 / 96,000**
characters (previously 74,046). No user project data was written, model call made,
or completed response retroactively certified. A running old-code request does not
acquire new advice mid-flight.

**Subsequent read-only observation:** the already-running retry completed and saved a
valid joint `review-needed` verdict for workflows, rules, data and acceptance, retaining
all three completed batches and two charged joint attempts. The first failure is now
historical; no rerun of the completed joint check is required. This is observed native
completion under the **previous prompt**, not live qualification of the new positive
allowlist or proof that deeper review/overall workflow is complete. No investigation
model call or data repair produced this outcome, and original findings were not blessed
unaffected. The existing workflow can act on its saved deeper-review result.

All **52** focused change-work tests, final `npm test` (**899 pretests, 774 main tests,
52 posttests**), type/diff checks, both source-backed/batched browser runners and
isolated recompiled Electron desktop checks passed. No UI/data migration is part of
this advice fix. New tests reproduce a served-but-uncited
record alongside otherwise valid joint citations, preserve rejected raw objects and
charged attempts, retain every completed batch, verify exact key/allowlist reconstruction,
reject missing advice/wrong nested keys, and explicitly rehydrate the record before a
fresh fixture verdict. A test-local tighter dispatch ceiling also exercises compatible
saved-joint-response/lookup reuse versus correctly blocked new inference. The browser
runner checks the allowlist received through the real workflow path and the shared
model prompt. Live use of the new positive allowlist remains unqualified; no new
provider/model calls or user-data writes were made during the fix.

## Explicit historical citation authority for change batches (2026-11-04)

**No additional persisted-format migration:** database 27, work/receipt 3 and portable
state 6 remain unchanged. A reported third-batch rejection was not another overflow
or a wrong task/stage key. Read-only inspection found two accepted batches and two
charged attempts on the third. The matching completed OpenCode V2 response cited a
superseded source in three checks. That whole body was intentionally present as
historical comparison evidence, but the superseding record was not in this batch;
the model could not discover the global supersession exclusion from the visible
body alone. The generic rejection combined key errors with citation errors and hid
this distinction. The response also retains substantive review-needed concerns;
diagnosing its citation error does not establish an unaffected verdict.

Each reconstructed v3 request now has an **ephemeral, app-owned citation-authority
sidecar** listing exactly which supplied records are historical-only. The shared
OpenCode/direct-provider prompt explicitly forbids those IDs in both no-local-effect
and review-needed citations, even when their successor is absent. It does not remove
historical bodies, substitute a successor, drop a concern or make a model preference
current. Missing advice fails before dispatch. Validation remains equally strict;
diagnostics now distinguish taskKey, batchKey, historical citations and unsupplied
citations, with bounded record IDs rather than echoed human/model prose.

The sidecar is regenerated from the frozen source snapshot and is **not persisted**
in jobs/work, receipts or portable artifacts. Its serialized size is included in
the bounded context character count, reserving room before reversible ID encoding.
All expanded data, source ledger, saved partition, task/batch/context hashes,
accepted responses, timestamps and attempt counts retain their existing semantics.
Old valid completed work therefore needs neither conversion nor another inference
call. Frozen batches are not repartitioned to accommodate equivalent wire advice;
an actually unfit complete request still fails closed with saved work retained.

The reported task reconstructs both accepted batches and the exact rejected native
request under the same selected model/context, with **three accepted lookups, two
accepted batches and two unfinished attempts**, unchanged. The active third request
prepares at **91,322 / 96,000** characters including its three historical-only IDs
(the original data-only body remains 91,167 characters). The original invalid reply
still fails validation; it was not silently repaired or accepted. Read-only V2 message
retrieval consumed no model call and modified no user project data. A further valid
model response is needed for that unfinished batch, within its original retry budget;
no attempt was refunded and the final joint verdict remains required.

All **50** focused change-work tests, type/diff checks, final `npm test` (**899
pretests, 774 main tests, 50 posttests**), both source-backed/batched browser runners
and isolated recompiled Electron desktop checks passed. No UI change or new data
migration is part of this citation-visibility fix. Coverage includes a successor outside the frozen
batch, explicit prompt authority, unchanged expanded hashes/checkpoints/attempts,
strict rejection for either outcome, no silent citation remapping and missing-advice
rejection. Live corrected-response completion remains untested; the real task's
remaining third-batch attempt was not dispatched or reset by these checks.

## Bounded change-review batches and joint verdict (2026-11-04)

**Database 26 → 27, change work/receipt 3, portable state 6.** The user approved
durable bounded evidence-review batches followed by joint consistency review after
identifier sharing alone proved insufficient. The database migration is an ordered,
transactional reader-capability boundary: startup never changes old job/project
payloads, dates, semantic fingerprints, completed v1/v2 verdicts, grants or live leases,
and never invokes a model. Old applications reject database 27 on reopening.

Only explicit owned continuation of an unfinished v2 request whose cumulative context
still exceeds 96,000 characters adopts v3. Ordinary fitting requests keep v2; saved
final v1/v2 responses retain their original publication path. The new job preserves
the original task/assessment/context keys and immutable v2 lookup chain. Each old
lookup is reconstructed against its exact original expanded-data context, even when
the final cumulative body cannot be dispatched. The earlier job remains untouched.
Current attempts carry into the first batch (also retained as `inheritedAttempts`);
an exhausted three-attempt request cannot gain a fresh budget by switching protocols.
Read-only status/context inspection cannot adopt or spend an attempt.

The frozen ledger includes **every original citation**, all already accepted loaded
records, full changed-decision provenance and whole linked current question/answer
units. Missing records/ambiguous provenance fail closed, not guessed or summarized.
Exact bodies, original ordering and all nine complete findings/every exact change
determine deterministic bounded batch/context hashes. Navigation excerpts are not
substantive evidence and are absent from the new batch protocol, rather than changing
the old task. The original batch-key/source-ID partition is saved in `batchPlan` and
reopened as frozen boundaries: an equivalent wire encoder cannot silently repartition
completed work or invalidate its semantic hashes. Every batch repeats all findings/changes and full direct change evidence;
all remaining whole source units are partitioned, never clipped. Current record IDs
remain distinct from historical/superseded citation authority.

Each accepted batch stores its exact nine-finding local response, served evidence IDs,
batch/context keys, real acceptance timestamp, attempts and originating job/model.
`no-local-effect` is explicitly not a global unaffected verdict. Batch concerns remain
verbatim. All accepted responses are replay-validated locally against frozen inputs,
not redispatched after Pause, restart, transport failure or portable adoption.
Each unfinished stage has at most three charged attempts. Existing workflow request,
active-time, owned lease, cancellation, no-research and selected-model checks still
apply; batching does not grant additional workflow allowance.

After all batches, the joint request contains every complete batch response plus
original findings, changes and direct evidence. A separate semantic verdict must
explicitly review all batch keys in order and inspect combined/cross-dimensional
effects; the app never derives independence from batch membership, citations or local
outcomes. An unresolved `review-needed` batch concern forbids an unaffected final
verdict. Joint citations must refer to current whole records in the current window
or records actually cited by accepted exact-source batch reviews. When exact joint
bodies are needed the model can request a whole linked group from the frozen ledger;
that bounded window replaces the preceding joint body window, not accumulated bodies
or accepted checkpoints. These requests use the **remaining original six-lookup
allowance**, not a fresh six. A saved joint response is validated/reused for explicit
publication without inference. Stale results retain historical evidence, never current
authority, and no original finding/date, confidence or human decision is changed.

Portable state 6 retains v3 checkpoints, original history/order, dates, semantic keys
and attempts, but continues excluding credentials, machine-local sessions and full
activity archives. Formats 1–5 retain their existing readers and semantics; a v3 work
or receipt mislabeled as format 5 is rejected without adoption/write. Unsupported
future protocols roll back startup migration/version/history atomically; repair and
retry can reopen without resetting compatible work. Work payloads are bounded to
256 KiB for v3 (v1/v2 remain 64 KiB); startup selects at most that bound and validates
the actual schema. Ledgers allow at most 1,024 records / 32 whole batches. Unfit whole
units, complete joint receipts beyond 96,000 characters, exhausted lookups/attempts
and other storage bounds still fail closed with retained saved work. This is not
arbitrary-size inference or a guarantee that every uncertainty can be settled.

**Read-only real-task preparation:** revision 3139 now retains three accepted lookups,
zero unfinished attempts, and the blocked cumulative input of 127,139 expanded /
109,129 identifier-shared characters. Its frozen ledger has **133** exact records,
covered by **three batches of 95,228, 93,587 and 91,167 characters**. Every original
finding, change and supplied body round-tripped exactly, and all earlier v2 lookup
contexts reconstructed. No user database was migrated/written and no live model call
was made. This qualifies preparation, not live batch/joint semantic completion.

All **49** focused change-work/batch tests, **63** migration/portable/scope tests,
the final `npm test` run (**899 pretests, 774 main tests, 49 posttests**), type/diff
checks, CLI help, UI build, all **22** default browser runners plus both v2/v3
post-browser runners, the separate coordinated-workflow browser check and isolated
Electron desktop/startup suites passed. No inference was used. The earlier browser
cleanup lock recorded for the wire-only slice did not recur in this aggregate run.
Desktop checks used the existing independent ignored stage with recompiled backend
and current UI assets, without rebuilding/stopping the user's running app.
Tests cover actual clone adoption, repeated reopen,
charged interrupted stages, saved-joint-response publication, concern preservation,
malformed/guessed/stale evidence, cancellation, timeout, expired ownership, exhausted
legacy attempts, bounded replacement joint windows, the original shared lookup cap,
frozen-plan tampering and transactional future-format rollback/recovery. Real app
upgrade and live model semantic completion remain unqualified; source preparation
alone is not an unaffected verdict. No commit or push was made.

## Lossless change-check identifier sharing (2026-11-04)

This earlier wire-only slice remains in use for fitting v2 requests; the subsequent
batch protocol above adds the separate persisted versions and capability migration.

**No persisted format change:** database 26, portable state 5 and change work/receipts
2 remain unchanged. Oversized cumulative change-check requests now try the existing
identifier-table wire encoding before enforcing the same 96,000-character limit.
Every source body, finding, change, link and human wording remains present. A runtime
round-trip check verifies exact expanded JSON-value equivalence before dispatch.
Already-fitting requests retain their original representation. No summaries, dropped
records, enlarged budgets, external lookups or additional inference are introduced.

`contextKey` and `responseContextKey` still hash the original **expanded** data.
Accepted lookup IDs, model/job provenance, attempt counts and response identities
are not rewritten or invalidated merely by a smaller wire spelling. Consequently no
forward data migration or reassessment is needed. Reopening and portable adoption
reconstruct the same saved lookup chain; an interrupted request remains charged.
Unsupported or genuinely stale data retains the existing rejection behavior.

Read-only reproduction of the reported revision-3139 task found one accepted lookup,
zero attempts on the unfinished request and 21 supplied records. The blocked next
request was **104,130** characters; the reported **78,693** described the previous
dispatch. Production preparation now yields **89,502 / 96,000** characters and an
exact round-trip, without repeating that lookup or writing user data. Earlier lookup
contexts still reconstruct. This establishes preparation, **not live model completion**.

Focused tests cover exact Unicode/prose/numeric/null/missing-field preservation,
unchanged semantic hashes, legacy size-blocked continuation without another lookup,
repeated reopen, actual portable adoption, charged-attempt preservation and unchanged
original assessments. All 38 focused change-work tests, 94 adapter/resilience tests
and the final `npm test` run (899 pretests, 774 main tests, 38 posttests) passed.
An earlier run rejected a new fixture above the existing 12,000-character note limit;
the fixture was corrected before the final full run. Type checking,
targeted change/workflow browser checks, CLI help and isolated Electron desktop/startup
checks passed, without live inference.
Both default browser attempts stopped on a Windows `EBUSY` cleanup lock after the
first eight runners' checks, including historical recovery, passed. The remaining
14 default runners were then executed separately and all passed. Thus all default
browser assertions were exercised, but the aggregate command's cleanup remains
blocked; this unrelated cleanup behavior was not changed by the wire fix.
The existing isolated desktop stage was recompiled without disturbing the user's
running development app. Distinct evidence can
still exceed the bound after ID sharing; that remains a durable pause, now reporting
both encoded and expanded sizes, rather than silently truncating or marking current.

## Indexed startup review validation (2026-11-04)

**Database 25 → 26 adds derived expression indexes only.** It does not rewrite
project/revision/job payloads, findings, dates, input fingerprints, settings, attempts,
leases or portable formats. `startup_projects_change_reviews` and
`startup_revisions_change_reviews` contain the extracted change-review arrays for
rows that need this validator, rather than rereading whole historical projects at
every launch. The SELECT expression and partial predicate deliberately match the
index expressions; tests inspect both the query plan and SQLite bytecode to confirm
that warm validation reads no revision-table columns. SQLite updates the indexes on
inserts, edits and deletes, including changes to older historical rows by another
connection. No revision-number-only cache or permanent “already trusted” flag is used.

The first upgrade must read the archive once to build the indexes. This can still
be slow on a large/cold database. Index creation, migration history, schema version
and validation commit together; interruption or unsupported review evidence rolls
the transaction back. Retrying can rebuild the derived indexes but never repeats a
model call or resets saved work. Subsequent starts do not rebuild them. Old readers
retain the existing future-database-version rejection rather than writing through
an unknown migration.

All selected arrays still pass the same format/policy, 2-MiB, 256-review and distinct
area checks. Identical extracted arrays share validation within one launch using a
bounded cache of 128 SHA-256 digests only (no retained project bodies or persistent
validation decisions). A different or newly edited unsupported array still fails
closed without overwrite. Guarded index expressions allow existing forensic tests
and readers to retain malformed historical data: malformed data without a change
marker keeps its prior lazy-reader handling; malformed marked review evidence is
included as an invalid value and rejected at startup. Valid escaped JSON field names
are recognized by the JSON path rather than missed by a raw substring filter.

Startup reports the one-time `indexing-review-history` phase separately from
`checking-review-history`, `checking-saved-work` and `checking-definition-evidence`.
These are actual stage-entry notifications, not estimated completion percentages.
The observer remains allowlisted, best-effort and unable to change migration behavior.

All **48** focused migration/change-work/worker tests, **105** forensic/migration
regressions, `npm test` (**899 pretests, 774 main tests and 34 posttests**), type/diff
checks, isolated Electron desktop checks and the dedicated visible-startup/close-during-startup
checks passed. Tests preserve payload bytes/live jobs, cover repeated startup,
indexed candidate selection, no full snapshot reads, invalid edits after indexing,
future-evidence rollback and repair/retry. No real-user database was opened for
upgrade or modified. Real cold-index duration and end-to-end startup on the user's
large archive remain unmeasured; other saved-work/evidence validators still run.
The standard desktop staging rebuild was blocked by the running development app's
native SQLite file lock. An independent ignored staging directory with the same
pinned dependencies was compiled/tested instead; the user's process was not stopped.

## Source-backed, resumable change checks (2026-11-04)

**Database 24 → 25 is a capability boundary only.** The ordered transactional
migration adds no tables and rewrites no project, job, history, grant, assessment,
receipt, attempt or lease. Existing change-work/receipts format 1 keep their exact
task/context identities and final-only protocol. A matching unfinished v1 job is
resumed under v1, including a saved reply or exhausted three-attempt ledger; upgrade
does not grant a new attempt or require repeating an accepted response. Completed
unaffected v1 receipts stay valid. A completed v1 `review-needed` receipt remains
dated evidence; an explicitly continued workflow can run a distinct, source-backed
v2 task, not reinterpret the old verdict as unaffected. Original findings and dates
are never rebased. Read-only qualification inspection accepts the new known database
version without changing its cases, manifests or previously saved results.

New change-work/markers format 2 / `definition-change-evidence-v2` add a bounded
lookup ledger. Each accepted lookup retains its original request context hash,
requested IDs, spent attempts, originating job and selected model. Full source bodies
are rebuilt from the exact saved project revision; no bodies or provenance are
invented on reopen. A compact original-citation index is navigation, not evidence.
Explicitly partial navigation prefixes help select records but cannot authorize
citations; prefixes shrink or disappear before any mandatory finding/change is
omitted. The model may request up to eight exact guarded IDs per lookup, six lookups per task,
with three attempts per unfinished request. The existing workflow request/time grant
is charged before each dispatch. Continuous work uses per-request timeouts and
renews only its live job lease, not a hidden whole-check five-minute cutoff. Earlier
bounded grants still honor their remaining active time. Accepted reads do not repeat on Pause/restart or
explicit retry; malformed requests/replies remain spent. Matching saved final replies
publish without inference. Cancellation and dead/expired workers cannot accept late
replies. Valid owned concurrent-edit replies/loads remain historical, not current.

Loaded whole records and their complete current question/answer units remain in
every later request beside all nine original findings and every exact change.
Lookup IDs must be distinct, available and unread; index-only or guessed IDs cannot
authorize a final citation. Superseded bodies cannot authorize current citations.
Every request remains within 96,000 context characters. If indispensable cumulative
evidence cannot fit, the accepted lookup stays durable and the check pauses before
another request; retry does not repeat that lookup or truncate evidence. A valid
final semantic verdict is still necessary: actual effects/uncertainty can require
deeper review. Six lookups are not proof that all needed evidence was inspected.
Work remains bounded to 65,536 UTF-8 bytes; final responses to 48,000 bytes.

V2 receipts separately retain loaded IDs and the final evidence-context hash, plus
original/current input identities and original response provenance. Currentness
still requires exact matching guards and an unaffected verdict. Product requirements,
approval/review gates, findings and confidence are unchanged. Pending global answers
can still put every potentially affected area into a pending-check state; this
change adds source-backed checking rather than suppressing honest pending status.

New exports containing any change-review state (including retained v1 work) use
**portable state format 5**, with explicit exact ID ordering for epics, sources,
questions, requirements, research and scans. Investigation exposed that feature-grouped
files could otherwise reorder the current arrays used as historical delta bases,
breaking question/answer continuation on a clone. Format 5 validates complete,
duplicate-free ordering before reconstructing snapshots. Formats 1–4 remain readable;
missing original ordering in old exports is not guessed or rewritten. Unsupported
future work/receipt policies, marker mismatches and malformed format-5 ordering fail
closed. Explicit adoption retains lookup/final-response identities and local account
routing without exporting account IDs, credentials or full activity history.

Focused deterministic and browser tests pass for requested-source-before-verdict,
Pause/reload and charged final retry without repeating the lookup, exact full linked
question/answer restoration, repeat reopen and actual portable adoption, old-v1 saved
reply/exhausted-attempt preservation, catalog-only citation refusal, malformed/budget
checks, stale/cancelled/dead replies, oversized joint-context pause, tampered request
identity and future-policy migration rollback/recovery. **122 focused tests**, all
of `npm test` (**899 pretests, 772 main tests and 34 posttests**), type/diff checks,
UI/desktop builds, real Electron isolated-data checks, all **22** default browser
runners and the enhanced source-backed-change/workflow browser checks passed.
The first default-browser run raced concurrent UI builds and returned a root-page
404; the rerun after builds were serialized passed. The existing bundle-size warning
remains. No real-user project upgrade/write, live model call or installed-desktop
rebuild was performed. Fixture success does not qualify semantic effectiveness on
the reported large project; genuinely necessary joint evidence beyond the context
bound remains a supported pause, not a completed fix for every broad recheck.

## Assessment memory-pressure reduction (2026-11-04)

**No persisted-format/fingerprint change or additional migration required.** The
current database version (24, from the separate change-impact slice), project, job,
work-ledger, settings and portable formats are unchanged by this optimization. No
old job, assessment, stage receipt, attempt, source identity, approval, history record
or human evidence is rewritten, dropped or marked current. There is no model-call
or reset requirement to adopt it.

Coordinator-only receipts are an ephemeral validated SQL projection, not a new
persisted job representation. They include all fields used by requirement-proof,
pair-check and readiness scheduling, in the original chronological order, without
carrying unused context/response/stage bodies through long asynchronous actions.
The separate full-job queries for completion/clarification retain every matching
original record, not a last-N cutoff. Initialization uses an equivalent scan-existence
query. Full archive reads decode from a cursor to avoid retaining all raw JSON strings
as well as all parsed jobs. Definition source selection lazily decodes the same
newest-first twenty candidates and closes the cursor before asynchronous work;
scope compatibility and spent-attempt rules are unchanged.

Portable publication no longer preloads a map of full assessment publication
snapshots. It reads each distinct required/optional revision once, encodes it in
the existing sorted order and releases its unused original fields before reading
the next. The same exact delta/object encoder and hashes are retained; existing
byte-equivalence/reconstruction tests remain applicable. Missing optional assessment
origins are skipped only for the existing missing-revision error. Required origins,
including applied-submission and saved-work revisions, still fail closed; unrelated
read failures are not interpreted as optional missing evidence. Retry/startup/export
therefore use the same saved evidence without reassessment or manufactured provenance.

A capped-heap regression passed for 96 independently parsed 2-MiB publication
snapshots under 128 MiB old-space. Additional tests assert no full-archive scheduling
or initialization read in coordinated assessment, compact/full receipt equivalence,
one-at-a-time optional origin reads, repeated revision deduplication, and required
history/read-failure preservation. All 284 focused tests and `npm test` (899 pretests,
772 main tests and 17 posttests), type/diff checks, UI/desktop build, real Electron
isolated-data checks and the coordinated-workflow/continuous-definition browser
checks passed. These are
memory-pressure reductions, not reproduction or complete resolution of the reported
fatal allocation: [observations and verification](desktop.md#assessment-memory-pressure-mitigation-2026-11-04).
Whole-history/database growth, the size of genuinely distinct portable evidence and
other callers that still require full archives remain separate limits.

## Dated definition change-impact reviews (2026-11-04)

**Database 23 → 24 is a capability boundary, not a payload rewrite.** Existing
assessments, original input keys, review dates, jobs, history, grants and live leases
remain unchanged. No startup inference, retroactive receipt or reassessment is
introduced. Ordered transactional migration and validation roll back together on
unsupported new evidence; repair the incompatible source with a compatible app
before retrying. Older applications reject database 24 rather than stripping the
new authority on their next write.

Optional project `definitionChangeReviews` retain dated format-1 semantic reviews,
exact project/assessment/original/current/global keys, task/context hashes and
originating response job/model. Only an exact matching unaffected receipt can
establish compatibility; it never rebases the original assessment. Saved jobs retain
exclusive change-review markers/work, reservations (maximum three), and validated
responses for no-call recovery. Publication is atomic. Historical stale responses
remain historical; cancellation never accepts late replies. Responses are bounded
to 48,000 UTF-8 bytes, work to 65,536 bytes and project receipt arrays to 2 MiB.
Startup checks new envelopes without parsing unmarked invalid legacy history.

Portable state **4** protects current/historical receipts and current change-work
checkpoints from older readers. Formats 1–3 remain readable without rewriting;
new evidence in an older envelope is rejected. Continuation retains needed original
snapshots and response provenance, not machine-local sessions or full activity.

Executed: dedicated upgrade/reopen/rollback/preservation and portable tests, the
legacy oversized-history regression, scope qualification tests and the deterministic
Continue/Pause/retry/reload/mobile browser check. Live semantic accuracy and desktop
delivery are not qualified by these fixtures.

Final deterministic `npm test` passed: 898 pretests, 770 main tests and 17
change-review posttests (1,685 total). Existing React list-key warnings remain;
they are not test failures. Type checking, UI build, CLI help and diff checks passed.
The full `npm run test:browser` suite and its change-impact postcheck also passed,
as did the separate coordinated-workflow browser runner. All used deterministic
adapters; the existing UI bundle-size warning remains.

## Desktop worker failure diagnostics (2026-11-04)

No persisted-project format or schema changes. The desktop now writes a bounded
latest-failure diagnostic at `desktop/backend-failure.json`, format 1, separate
from SQLite, settings, workspace artifacts and portable exports. It contains only
allowlisted failure metadata and bounded source locations, never raw error text or
credentials. A failed write does not change saved work or prevent shutdown. Existing
projects, jobs, approvals and spent attempts require no migration or reassessment.
See [desktop diagnostics](desktop.md#backend-crash-diagnostics-2026-11-04) for the
observed crash, executed checks and remaining reproduction/native-failure gaps.

## Unvisited planning target source carry-forward (2026-11-04)

**Planning envelope 1 → 2 on explicit preparation; database schema stays 23 and
execution format stays 2.** Startup accepts both envelopes without rewriting old
plans, receipts, stage formats 1–4 or input fingerprints. Envelope 2 adds frozen
`targetMaterials` and separate `pendingSources`: version-1 /
`retained-planning-target-v1` capsules holding the original target receipt, work,
materials, optional completed package, source plan/revision/dates and execution
binding/settings/model. Single-request capsules require their completed package.
New receipts retain known origin-plan dates; older missing dates stay absent.

Preparation synchronously captures all eligible target sources under its owned
lease **before** replacing the previous plan or dispatching a request. Capture can
recover a target from compatible local history if intervening plans never touched
it. The nearest touched target is a boundary: it cannot bypass newer spent attempts,
missing legacy provenance, approved/dismissed plans or incompatible settings epochs.
Legacy staged materials come from the original saved revision when available;
missing snapshots are not invented. Capture checks material/input identity,
package digests and original stage replay. Failure leaves the old plan unchanged,
releases only the owned lease and surfaces the error without inference.

All sources are saved in the replacement plan before Git preflight or the target
loop. Each remains historical, not a published current package. Per-target preparation
validates current inputs, supplied references and source replay before atomically
attaching the current receipt/material/stage/package packet and consuming the capsule.
Preparation failure retains the capsule. Exact partial continuation uses frozen
original materials and preserves request identity, accepted replies and spent attempts;
changed evidence retains the original source receipt in its bounded follow-up witness
and still verifies every current batch. Incompatible target/global inputs use fresh
collection, not historical authority. Publication refuses remaining pending sources.
Existing lease/CAS, cancellation, context and ancestry/attempt limits remain.

Portable execution includes these capsules and frozen materials, strips execution
sessions as before, and rewrites capsule bindings to `portable`; explicit workspace
adoption rebinds them to the new local binding. It still does **not** export the full
planning history. Thus an early failure cannot strand later targets' sources only
in an archive excluded from portability. Unsupported envelope/source/work policies
fail closed without overwriting saved work. No data reset or model reassessment is
required solely for this compatible representation change. Same-revision legacy
work without receipts retains its original continuation path, without manufacturing
cross-revision provenance.

All **109** focused planning/implementation/migration tests and `npm test` (**894
pretests and 770 main tests**) passed, as did type checking, UI build, the enhanced
planning-browser check, all **22** default browser runners and diff checking. The
existing bundle-size warning remains. Added deterministic cases cover later
completed/partial targets through repeated early failures, reopen and actual portable
adoption; no repeated accepted requests; retained source receipts/attempts; single-request
carry-forward; nearest-source/review/settings boundaries; capture failure and retry;
format-1 repeated startup, missing snapshots and future pending-policy rejection/recovery.
Changed approval populations make obsolete dependency work incompatible rather than
blocking fresh collection or bypassing the boundary for older successes. Source
preparation failure retains pending provenance without attaching a partial packet.
No live model/GitHub calls, installed-desktop rebuild or real-user-project edits.
Whole-history serialization remains undeduplicated and is not globally size-bounded;
this change bounds selected sources to eligible targets, not all local archive costs.

## Planning evidence revision/removal reconciliation (2026-11-04)

**New staged-work format 4; no SQLite or execution-envelope rewrite.** Database
schema stays 23, execution format 2 and planning envelope format 1. Work format 4 /
`planning-reconcile-evidence-verify-all-v1` adds explicit retained-record keys and an
evidence delta (changed/removed keys and superseded, historical-only IDs). Its
self-contained baseline can contain work formats 1–4. Formats 1–3 keep their original
request/replay rules and input keys; no old receipt, attempt, approval or completed
work is rewritten at startup. Strict older readers reject format 4, and unsupported
nested policies fail without overwriting saved data. Material/input identity versions
remain separate from optimistic concurrency and work-format versions.

Eligible explicit preparation can now retain unchanged completed reads while
recollecting changed source/question/research records and reading additions/unread
records. A record that left the mandatory context gets a bounded historical review
entry, not current-evidence credit or a product-removal decision. Exact before/after
bodies and historical retirement entries are supplied only in their collection batch;
they are not added to every verification prompt. Retired-entry keys never count as
read current records. All current mandatory records still verify before a package is
exposed. Target wording/acceptance, project/global envelope, requirement guardrails and
settings/model/workspace must remain compatible; structural requirement or envelope
changes still take the conservative fresh-work path. This does not prove semantic
independence or permit verification to be skipped based on matching citations.

Original drafts/dependencies remain immutable in the source witness. The active seed
removes prerequisite proposals supported by changed/removed or superseded evidence
and adds an app-owned unresolved review question: missing evidence is not proof of
independence. This does not remove previously reviewed dependencies from execution
settings. Superseded IDs are historical-only even when their exact bodies remain in
the current context; retired/superseded bodies cannot be cited as current dependency
proof. Changed same-ID records can be cited only after their current version is
supplied/read. Later additive follow-ups retain these stricter authority rules.
Earlier questions and the mandatory warning cannot be silently dropped. If a bounded
question list cannot preserve the warning, preparation blocks rather than truncating
questions or granting another model request. Current packages remain proposals and
require explicit human resolution/approval, not automatic specification/coding changes.

Existing six-snapshot / 1,000,000-JSON-character baseline bounds, 32 collection plus
32 verification batches, 32 staged requests per action, three attempts per unfinished
stage, context preflights, cancellation and owned version-CAS saves remain. Exact
change pairs are packed against the actual seeded prompt; an indivisible change or
oversized retained draft blocks before inference without discarding the source.
Malformed/obsolete-reference replies and invalid verification retain charged attempts,
not completion credit. Current deltas and retained keys are recomputed during replay,
including before package exposure. Known source-plan creation/finish dates are copied
into new witnesses and portable state; missing historical timestamps are left absent,
never manufactured. UI/logs distinguish effective retained records from changed or
retired context records and expose the required evidence-review boundary.

All **101** focused planning/implementation/migration tests and type checking passed.
Coverage includes changed/removed/superseded/question evidence, unchanged-only read
reuse, exact before/after review, full-current verification, obsolete-citation refusal,
mandatory warning preservation, charged failure/retry, cancellation, invalid
verification, source tampering, target/global/guardrail fallback, oversized-draft
blocking, mixed-format repeated startup and nested future-policy failure/recovery.
Owned prepared-target tests exercise reopen, actual portable adoption, another
follow-up, re-export/replay, stable source dates and unchanged reviewed dependencies.
The enhanced planning-browser runner passed changed-evidence status, review warnings,
Stop/reload/explicit continuation, retained history and mobile. Evidence edits/removals
in these checks use curated old/current snapshots or explicit external-transition
fixtures; no new public source-editing UI is implied. `npm test` passed **886 pretests
and 770 main tests**. All **22** default browser runners, the enhanced planning runner,
UI build, type and diff checks passed; the existing bundle-size warning remains.
No live model/GitHub calls, installed desktop rebuild or
real-user-project changes were performed.

**Source-selection gap at this slice (addressed by the envelope-2 slice above):** a replacement interrupted before preparing a
later target can leave that target's original source only in planning history. The
current selector uses the immediate predecessor, and portable projection excludes
the full history, so later unprepared targets may repeat older collection. This slice
qualifies already-prepared reconciliation targets; it does not close that carry-forward
gap or claim universal cross-target recovery. Source retention/selection for those
targets, broader target/global reconciliation, scan observation reuse and other
workflow audits remain outstanding. Ordinary answer/review gates are unchanged:
evidence changes that move a requirement out of approved status still need human review.

## Repeated additive planning follow-ups with bounded ancestry (2026-11-04)

**New staged-work format 3; no SQLite or execution-envelope rewrite.** Database
schema remains 23, execution format 2 and planning envelope format 1. Existing
format-1 and format-2 work, context keys, drafts, receipts, spent attempts and valid
plans are not rewritten or reset. New repeated follow-ups use format 3 /
`planning-chain-pending-verify-all-v1`, with baseline format 2 pointing to a complete
earlier work witness. Source work may be format 1, 2 or 3. Existing format-2 baseline
format 1 remains restricted to its original format-1 source, preserving old replay
semantics and strict-reader compatibility. Older readers reject new marked work;
unsupported descendant formats/policies fail without replacing saved data.

The prior additive-evidence eligibility gates remain: exact target/global policy,
guardrails, assessment metadata and old records; additions must be supplied evidence.
Only unrelated omitted-source inventory counts are ignored. Every ancestor request
ledger and material/runtime identity is replayed. The new collection schedule excludes
only records covered by completely accepted collection batches in that lineage;
verification receipts never add collection credit. The latest available draft remains
an untrusted proposal. An interrupted follow-up with no accepted new response can
therefore retain older reads/drafts without treating its spent requests as completed.

Every changed-input follow-up still verifies all current mandatory batches. Old
verification is not reused as current verification. Missing original snapshots,
incompatible runtime/settings/model/workspace, changed/removed old evidence or changed
target/global/structural inputs remain conservative fresh-work paths. Same-input
retries retain their own receipt/attempt ledgers and do not extend ancestry. New input
creates separate current work while the original source attempts remain unchanged.
Questions cannot silently disappear; current-plan approval/cancellation/ownership/CAS
and finite request/context limits are unchanged.

Ancestry is bounded to **six work snapshots including the current work** and the
existing **1,000,000-character complete baseline witness cap per target**. A shallow
depth/cycle guard runs before recursive schema descent. Source revisions must strictly
precede descendant revisions. At the depth bound, explicit preparation uses fresh
collection and explains that the original work remains in history. The witness is a
linear embedded chain, not a branching history export; only the latest provisional
draft and current batch enter model context. Execution history itself is still
serialized by the existing store; this slice does not introduce history deduplication
or claim bounded total historical database size.

Portable state carries the bounded self-contained chain without credentials or
execution sessions. Tests cover clone/adoption followed by another relevant edit,
portable re-export/replay, repeated startup, nested future-policy rejection and
recovery without rewriting saved bytes. UI progress names the source checkpoint
revision and retained exact-record count; logs include ancestry depth. These are
retained-read counts, not current readiness or delivered-code claims.

All **89** focused planning/implementation/migration tests and type checking passed.
Additional checks cover multiple partial follow-ups, zero-new-response ancestors,
inventory-only zero-collection schedules, pending-only reads, every-current-batch
verification, charged retry, ancestor tampering, depth/cycle refusal and explained
depth-limit fresh collection with unchanged predecessor history. The enhanced planning
browser runner passed two relevant edits and repeated Stop/reload/explicit continuation
with retained ancestry, review gates and mobile layout. `npm test` passed **874 pretests
and 770 main tests**; type and diff checks passed. All **22** default browser runners
and the UI build passed as well; the existing bundle-size warning remains.
No live inference, GitHub calls, installed desktop
rebuild or real-user-project changes were performed.

Remaining: reconciliation for changed/removed original evidence or target/global
changes, submission/refinement/clarification reconciliation, reusable scan observations,
general single-request discovery outcome preservation and live/desktop qualification.

## Additive-evidence planning collection follow-ups (2026-11-04)

**New staged-work format 2; no SQLite or execution-envelope rewrite.** Database
schema stays 23, execution format 2 and planning envelope format 1. Existing staged
format 1 / `exact-planning-batches-v1` ledgers, request identities, approvals and
attempts remain byte-compatible and are not rewritten on startup. New follow-ups use
format 2 / `planning-collect-pending-verify-all-v1`, separate `collectionBatches`, and
a bounded original-input witness. Older local/portable readers reject the new marked
work instead of interpreting its shorter collection schedule as a full original read.
Unsupported future formats/policies fail before writes; restoring an unsupported row
permits startup retry without losing original work. No historical proof is backfilled.

Explicit Prepare plan may create a follow-up from the immediately previous staged
format-1 plan when its exact-input receipt, settings/model/workspace and original
snapshot validate. Target/global policy, guardrails, assessment metadata and original
records must remain identical; only added evidence records and unrelated-source
inventory counts may differ. Replaced/deleted records, changed target behavior,
changed global context or structural additions fall back to full current collection.
Missing original snapshots/compatible runtime proof also fall back conservatively.
The original source plan remains immutable in history.

The new work embeds the original materials and exact format-1 ledger, source plan ID,
revision and input receipt. The witness is capped at 1,000,000 JSON characters per
target and cannot recursively contain another follow-up. Original collected records
are authenticated by exact request replay; partial original batches do not count as
read. The last original output is an **untrusted provisional draft**, never current
verification or a human decision. The new schedule independently packs every added
or unread record for collection, then verifies **every current mandatory batch**.
No original verification is credited toward the changed-input check. Earlier questions
cannot be silently dropped during collection; explicit human resolution remains
required. Verification retains its existing no-rewrite/no-positive-addition rules.

Replay checks original material/runtime identities, the complete original ledger,
unchanged record contents, exact pending collection coverage and full verification
coverage. It runs again before exposing a package. Omitted records/citation IDs alone
cannot justify independence or skipped verification. Existing limits remain: at most
32 collection and 32 verification batches, three attempts per unfinished current stage,
32 staged requests per action, bounded context and live owner/version-CAS writes.
Original spent attempts remain in the embedded source ledger; retries of the same
follow-up retain their charged attempts. A genuinely changed input gets separate work,
not a reset of the original checkpoint. Cancellation, malformed replies and invalid
verification do not publish or erase saved work. Current-plan approval stays explicit.

Portable continuation retains the self-contained witness, original IDs/revision,
draft/receipts and attempts without exporting model sessions or a full execution
archive. Reopen and clone/adoption do not launch calls. The planning UI/logs count
the separate schedules correctly and distinguish retained original reads from
still-required current verification.

All **85** focused planning/implementation/migration tests and type checking passed.
The enhanced planning-browser runner passed with a relevant added note, retained-read
status, charged Stop/reload/resume, unchanged history, review gates and mobile layout.
Other new checks cover partial/completed origins, changed/unread-only collection,
all-current verification, tampered source requests, missing collection work, changed
target/global/original evidence fallback, cancelled/malformed replies, exhausted
attempts, invalid verification, lost questions, repeated startup, future-witness
rejection/recovery and actual portable adoption. `npm test` passed **870 pretests and
770 main tests**; type and diff checks passed. All **22** default browser regression
runners and the UI build also passed; the existing bundle-size warning remains.
No live inference, GitHub calls, installed desktop
rebuild or real-user-project writes were performed.

At this initial slice, repeated edits to a format-2 follow-up required a separate
full-collection plan. The subsequent format-3 slice above adds bounded additive
chaining without rewriting that format-2 work. Arbitrary changed/removed evidence,
scan observation reuse and single-request discovery outcome preservation remain
separate work.

## Exact-input implementation planning across revisions (2026-11-04)

**Additive execution payload extension; no SQLite migration.** Database schema stays
23, execution format stays 2, and planning format stays 1. New `targetInputs` entries
use format 1 / `exact-planning-inputs-v1`, with request mode, input digest, original
plan ID/revision and an optional completed-package digest. Identities are saved
before dispatch; a package digest is attached only with a validated saved package.
Existing plans, approvals, assessments, delivery evidence, sessions, stage receipts,
attempts and concurrency versions are not rewritten on startup. Missing historical
request identities are not invented. Older compatible same-revision continuation
keeps its existing behavior; new cross-revision reuse requires the new proof.

An explicit **Prepare plan** creates a current replacement plan and archives the
previous plan unchanged. For the immediately previous failed/interrupted/generating
or proposed plan, each current approved target may retain its package or partial
staged ledger only if workspace binding, execution settings, model and full target
input identity match. Approved/dismissed plans are not cross-revision reuse sources.
Current target evidence, global policy, dependency guardrails, optional candidate
behavior/selection, omission warnings, assessment current/status metadata, runtime
instructions, output schema and bundled skill text participate in identity checks.
Single-context identity canonicalizes object keys and excludes only the count of
unrelated omitted sources, which is non-evidentiary inventory. It does not exclude
their contents if they enter the current mandatory closure, omit dependency candidate
behavior, or establish semantic independence from shared citations/categories.
Staged inputs retain the complete existing material key, including inventory counts;
all saved receipts replay against current materials before reuse. A changed staged
material key starts a separate target plan, not a rewritten old ledger.

Retained packages are digest-checked and revalidated against current supplied IDs and
prerequisite scope. Corrupt compatible saved packages/ledgers fail closed without
silently repeating completed requests. Changed inputs/models/settings or legacy
missing proof follow the existing fresh-target path. Previously spent stage attempts
remain spent for identical work; genuinely different inputs have separate work in the
new plan. Same-revision publication, worker ownership/CAS, cancellation, approval and
coding gates remain. A stale plan never becomes approvable just because one package
can be reused. Current replacement plans still require human review and explicit
question-resolution/approval; no settings, reviewed dependencies or delivery state
change during preparation.

Portable planning includes the optional receipts with stable origin IDs/revisions,
but no additional credentials or execution sessions. Older strict portable readers
reject the new optional field rather than treating it as known. New local startup,
execution reads/writes and portable decode reject unsupported receipt policies/formats
without overwriting saved work. No ordered data rewrite or model-backed backfill is
needed; restoring an unsupported row permits startup retry with original work intact.

All **77** focused planning/implementation/migration tests and type checking passed.
New checks cover unrelated/relevant/global edits, model changes, mixed retained/fresh
targets, stale approval refusal, corrupt package receipts, older saved plans, repeated
startup, unsupported format/recovery, partial-stage charged retry across a revision,
portable adoption and repeated compatible follow-ups without model calls. `npm test`
passed **862 pretests and 770 main tests**. The UI build and focused planning-browser
runner passed using the fixture service (no live model/GitHub calls); its normal
bundle-size warning remains. Type and diff checks passed. No live inference, installed
desktop rebuild or real-user-project changes were performed.

Remaining: changed-material collection reconciliation, changed-file scan reuse,
general single-request discovery outcome preservation and live/desktop qualification.
This is exact-input target reuse across a changed project, not semantic reconciliation
of a target whose own supplied inputs changed.

## Preserve retrieval and implementation-planning replies across edits (2026-11-03)

**No persisted format or fingerprint migration.** SQLite remains 23; retrieval and
planning work keep their existing format, task/evidence keys, receipts and budgets.
Startup does not rewrite historical jobs or reconstruct previously lost responses.
Older saved work remains subject to the original replay and publication checks.

Discovery now validates completed exact-load/search/final replies and staged epic
draft/verdict replies against their frozen original evidence before checkpointing.
An owned, unexpired retrieval transaction saves that work, marks the job stale and
clears its lease when the project has changed, then throws **after commit**. It does
not renew a stale lease, publish proposals or dispatch another request. Once work is
attached, checkpoints reject replacement of the original research policy, gap task,
epic package/input identity or staged plan. Cancelled/expired/stopped workers and
invalid replies retain no newly accepted response. Existing request accounting and
explicit continuation consent remain unchanged.

Implementation planning similarly separates cancellation/ownership checks from
current-input publication checks. Single-context packages and exact staged receipts
are validated against the original project and saved using live execution ownership
and version CAS before reporting changed inputs. Only final proposed-plan publication
uses the current revision/workspace-checked save. Historical output remains failed or
interrupted, not an approvable current plan; approval still requires current inputs.
Normal public product edits are blocked during planning. Tests of changed inputs
therefore deliberately simulate an **external database mutation**, not a supported
concurrent public edit. Cancellation, expired leases, replaced ownership and malformed
output cannot save late packages/receipts.

Tests cover retrieval load/search/final responses after unrelated/relevant edits,
original-task rebinding, repeated reopen, compatible continuation without repeated
accepted requests, ordinary epic load/final recovery and staged epic initial/final
recovery across restart. Planning tests cover original collection/final receipt
retention, compatible explicit replay without repeated calls, single/staged external
changes, cancellation, lease expiry/replacement, malformed output and reopen. Existing
portable planning/retrieval coverage remains in the full suite; newly stale discovery
portable adoption is not separately qualified by this slice. All **137** focused
retrieval/epic/planning tests, **53** resilience tests and type checking passed.
The **67** legacy refinement/implementation tests also pass after updating stale
expectations: replies invalid against original inputs fail validation even when an
edit also arrived; valid historical planning output is retained but not proposed.
`npm test` passed **851 pretests and 770 main tests**. The UI build and all **22**
default browser runners also passed (fixture adapters, no live inference). The
existing bundle-size warning remains. No live inference, installed desktop rebuild
or real-project writes.

Limits: general single-request discovery outcomes outside retrieval/staged workflows,
changed-input reconciliation, changed-file scan reuse and incremental replanning
remain separate work. Planning remains revision-conservative; preserving historical
packages is not authority to reuse them after arbitrary changed product inputs.

## Preserve staged answer, clarification and refinement responses across edits (2026-11-03)

**No persisted format or fingerprint migration.** SQLite remains 23. Submission,
readiness and refinement work retain their existing schema versions, exact material
and plan keys, receipt fields and finite request limits. `stale` was already a valid
job status. Original completed/failed/partial jobs and valid publication evidence are
not rewritten at startup. Older saved attempts without an accepted response remain
spent; missing past responses are not reconstructed or credited back.

Previously these services checked the current project revision immediately after a
model reply, before accepting/checkpointing it. Their checkpoint transactions also
threw on concurrent edits before saving. A valid completed response could therefore
be lost even though its request had been charged. They now validate against the
original frozen materials, commit that accepted response under the original task,
then mark the live job stale and clear its lease before throwing to stop the caller.
No questions, proposal, answer processing or specification changes publish from that
stale job, and it cannot dispatch the next request. Throwing happens **after** the
transaction commits so the historical checkpoint is not rolled back.

Checkpoint writes still require a running, unexpired owner and the original context
revision. Once attached, their material/plan identity cannot change within that job;
refinement target/pair and submission task bindings are also preserved. Cancelled,
externally stopped, expired and malformed replies do not become accepted receipts.
An accepted response moves its spent attempt into the original receipt using the
existing accounting contract; this is not an attempt reset or extra permission.
Revision-only gates use `projectRevision`, avoiding full project decoding.

Explicit continuation can reuse the exact receipt when current mandatory materials
are compatible, including after restart and portable adoption. Complete verification
already saved before an unrelated edit can publish on explicit continuation with
**zero** additional calls after ordinary replay/publication validation. Human answers
are not reapplied or duplicated. Related changed materials still reject old work as
current (or start the existing separate explicit refinement plan); changed-material
incremental reconciliation is **not** introduced by this slice. Compatible portable
ledgers follow existing selection/snapshot rules; this is not full history export.

The 53 focused resilience tests pass, including all three processes with unrelated
and relevant edits, repeated reopen, compatible portable continuation, final-verdict
recovery without calls, forged material rebinding, malformed output, cancellation,
external Stop and expired leases. Existing cancellation tests retain their original
expectations; old stale-result tests now assert accepted original receipts instead of
expecting the completed response to be discarded. `npm test` passed all **837
pretests and 760 main tests**; all **91** focused submission/refinement/clarification
tests and type checking also passed. All **22** default browser runners and the UI
build passed. Existing bundle-size/React-key warnings remain; no workspace artifact
failure recurred in this slice.
No live model calls, installed desktop rebuild or real-project writes were
performed. Ordinary discovery/retrieval response-loss windows and changed-input
reconciliation for these processes remain separate work in the resilience plan.

## Decision-aware evidence-review scheduling and retained progress (2026-11-03)

**Additive local workflow metadata; no SQL or assessment-key migration.** SQLite
remains 23, workflow state remains 1, and all existing readiness policies, grants,
jobs/checkpoints and publication identities retain their representation. An optional
strict `decisionSchedule` snapshot uses format 1 and policy
`question-scoped-definition-scheduling-v1`, with revision/input key, per-area task
keys, waiting decision identities and separate review/progress states. This is dated
scheduling evidence, not a readiness receipt, independent-finding certificate or
permission grant. Old state without it loads unchanged. New snapshots are saved
only by an owned authorized coordinator; reading/polling recomputes current labels
without writes or calls. Unsupported future nested formats reject without replacing
saved state. No data reset, repeated assessment or retrospective receipt rewrite is
required to upgrade. Older strict readers may reject marked state; do not downgrade
while new workflow metadata is present.

An unanswered/deferred/delegated question holds its area, declared transitive
dependencies' consumers, exact linked evidence and shared provenance. Project-wide
reviews wait for every decision. Global/inbox questions, missing provenance/bodies,
invalid dependency graphs, ambiguous record IDs, pending approvals/refinements,
organization changes and saved-input issues hold all affected/uncertain reviews.
Question evidence is followed transitively, including superseding sources; unchanged
categories/citations do not establish semantic independence. Only definition evidence
reviews outside these recorded scopes may proceed under the **same** existing grant.
No broad discovery, proposal refresh, clarification, planning, approval or coding is
newly scheduled while waiting. Every current batch still needs ordinary verification
and stale-publication checks. This is the first conservative scheduling slice, not
general concurrent or decision-independent execution.

Schedules are bounded to 256 active areas, 2,000 decisions, 32,000 records/total question
provenance visits, 64,000 evidence references and 16,000 potential area/decision relations. Exceeded or uncertain
inventory holds work; no omitted dependencies authorize requests. Progress identifies
saved review revisions and latest checkpoint stage counts separately from validity.
An eight-project read-only metadata cache avoids repeatedly inspecting history on
unchanged polls, invalidates on local writes and SQLite `data_version` from other
connections, and is not reused/populated inside transactions. Request bodies are
not decoded for these counts; consumers get copies, not mutable cached objects.
This is not an end-to-end performance benchmark.

The snapshot is machine-local workflow state, not portable authority. Portable
projects retain their original assessments and partial ledgers under the existing
rules; adoption/restart recomputes scope and still requires explicit continuation.
Model/provider routing, manual/guided consent, spent attempts, worker leases and
coding/delivery permissions remain unchanged. Readiness still requires every decision
and required check; no pending question is guessed or marked resolved.

Verification: `npm test` passed all **837 pretests and 736 main tests**. The final
focused workflow/UI run passed all **61** tests. All **22** default browser runners,
the final focused scheduling browser run, UI build and type checking passed.
Existing bundle-size and React-key warnings remain. No workspace artifact failure
recurred in these runs.

Focused checks cover scope/dependencies/shared/transitive
evidence, global/unknown blockers, bounded spending, Pause/stale output, immutable
progress and equal-revision cross-connection updates, repeated reopen, legacy state
and rejected future snapshots. A deterministic desktop/mobile browser flow exercises
the actual Continue action, waiting dependencies, retained partial steps, reload and
server restart without extra calls or renewed consent. The initial browser check
exposed hidden progress before workflow opt-in; the read-only plan is now visible
without granting work, and the desktop/mobile flow passed. No live inference, desktop
deployment or actual-user-project recovery has been performed for this slice.

## Unfinished assessment continuation after an answer (2026-11-03)

**Additive source/target formats:** existing definition work format 1 and SQLite 23
remain unchanged. New follow-ups may bind baseline policy
`checkpoint-collect-pending-verify-all-v1` and its strict `checkpoint` envelope:
original work digest, accepted-stage count and unread original record IDs. A saved
provisional draft is reconstructed only by replaying its exact original receipts.
It is not a published assessment. Original jobs, inputs, findings and spent attempts
remain immutable; a genuinely changed input creates separate follow-up work.

Collection covers all changed records plus original records not completely collected
across all nine dimensions. Linked/supplemental evidence pages alone do not establish
collection. Inherited baseline reads count only when unchanged and already fully
collected. All current evidence still needs complete downgrade-only verification.
New optional `collectionBatches` packs pending records independently from verification
batches, bound by `definition-baseline-collection-plan-v1`. Existing checkpoints
without that field retain their original plan key/schedule and replay unchanged.
No retrospective repartitioning, attempt reset or v1 fingerprint change is performed.

Preparation reads at most four quiescent source candidates, each bounded to 64 MiB,
and follows at most sixteen nested origins; original snapshots retain the 16 MiB
bound. Replay yields between receipts, checks cancellation and renews only the
caller's lease. Content-addressed derived drafts avoid repeated local replay; four
unowned entries plus active-worker pinned origins are retained, with pins released
on every service exit. Publication freshly authenticates the source digest, so a
cached draft cannot hide changed source work; required unfinished ancestry is also
freshly authenticated at publication. Unsupported or invalid required
origins stop without publication or automatic repeated calls; unavailable optional
sources can fall back to ordinary collection. Saved evidence is never deleted.

Portable export retains required unpublished source ledgers and ancestry rather than
compacting them into completed-publication receipts. It also retains up to four
candidate partial sources per area when an answer is exported before its follow-up
starts. Originals and semantic IDs survive adoption; machine-local sessions remain
excluded. The existing format's strict schemas reject unsupported future policies.
Missing originals in older exports are not invented. No reset or model calls are
needed merely to upgrade or reopen compatible work.

Focused checks cover first unfinished review → answer → pending-only collection,
full verification, repeated partial follow-ups, repeated startup, portable ancestry,
export-before-follow-up, partial dimension reads, cancellation during replay, source
tampering, cache pin/release and legacy plans without separate collection batches.
The 29 focused resilience tests and type checking passed. Both published-baseline
and unfinished-review browser modes passed, including mobile notice inspection.
The pretest suite passed 831 tests; the final main-suite rerun passed all 736 tests
(`npm --ignore-scripts test`). All 21 default browser runners passed, with the
unfinished variant additionally run explicitly. Earlier main runs caught two new
test-fixture mistakes (missing receipt job ID, and expecting a failed job when future
formats correctly reject before job creation); both fixtures were corrected before
the clean rerun. No workspace-artifact failure recurred in this slice. Browser checks use a
fixture adapter, not live inference. Desktop deployment and real-user recovery
remain unqualified; narrower verification and other workflow slices remain future work.

## Saved collection baseline with complete current verification (2026-11-03)

**Additive checkpoint policy; no SQL schema migration or v1 fingerprint rewrite.**
SQLite remains 23 and definition work remains 1. New eligible work can contain an
optional strict `baseline` envelope with policy
`baseline-collect-changes-verify-all-v1`: original publication revision/job, original
input/assessment/scope identities, the exact nine original findings, original record
digest inventory and every changed current record ID. The staged task also binds
`baselineKey`; the plan key includes that envelope. Old work without a baseline keeps
its exact schedule, contexts, receipts, limits and saved attempts. Never attach this
policy retrospectively to an already attempted ordinary plan.

Baseline selection reads the actual original published revision and a matching
completed assessment-only publisher/result. It does not accept assessments emitted
by generic discovery, mixed/combined origins, incomplete findings, removed evidence,
changed scope/dependencies/origin/global interpretation, missing cited bodies or a
missing original publisher as a collection shortcut. Missing legacy input-basis
metadata is projected read-only from its own original snapshot, like existing `get`.
An older publisher key can qualify through its exact original raw input key plus
canonical equality of all guarded values; a property-order repair cannot hide a
real evidence change. History is not rewritten or fingerprinted from today's decisions. Unsupported
future policy formats reject without overwriting stored work.

The new plan reuses the original collection draft, collects **every** added/updated
guarded record, then verifies **every current evidence batch and all nine dimensions**
before publication. No citation/category-based independence or verification skip is
enabled. Each change can affect any dimension. Exact indispensable supporting text
must still be requested; verification remains downgrade-only. Source finding text,
IDs and original dates stay in immutable history. New assessment dates describe the
new complete verification, not fabricated original dates. Original publisher checks
run before first dispatch and again inside publication; subsequent checkpoints bind
the immutable baseline. Existing stale/cancellation/lease/allowance rules still apply.

Source lookup projects a bounded publisher result/task from SQLite instead of loading
all original response bodies or replaying the original model calls. Record comparison
uses exact digests and set/map indexes. Existing 16 MiB source-snapshot, 8,000-record,
96,000-character request and batch/partition/execution bounds remain. Baseline finding
views may split by complete dimensions at stage zero; no finding or human text is
truncated to make the first request fit. Single-request reviews keep their existing
one-call path; this optimization targets staged reviews and adds no extra consent.

Portable continuation now retains the original publication snapshot and a compact,
dated completed-publisher receipt for required old baselines, not the old request
archive. Current unfinished ledgers remain exact; account routing/session data stay
excluded. The compact receipt retains the exact assessment-only result/task and is
not a replayable original ledger or publication certificate. Current ordinary
assessment origins are kept for later answer-driven reuse on a clone. Missing older
origins remain honestly unavailable. Existing portable format versions remain; older
readers reject new baseline/task fields through their strict nested schemas rather
than silently interpreting a shorter schedule as a complete old protocol. Do not
downgrade an app while marked work is present.

V1 publication certificates attest that both phases read all current records, so
baseline-based publication intentionally does **not** issue such a certificate. Valid
old certificates, assessments and checkpoints are untouched; no invented attestation
or automatic finding-level skip is introduced. See [resilience plan](workflow-resilience.md).

Verification: all 19 focused resilience tests, type checking, UI build and the 21
default browser runners passed. The final pretest run passed all 831 tests. Its
concurrent main/browser run had one workspace progress-artifact assertion failure
(725/726 main passed); all 16 workspace tests and the complete 726-test main suite
passed on isolated reruns without code/test changes. The intermittent artifact
failure's cause is not established; do not label it fixed by baseline reuse.

Focused deterministic checks cover cross-dimensional
effects, full verification coverage, fewer dispatches than full recollection,
restart/adoption, immutable originals, forged/omitted origins, complete dimension
views, failures/cancellation/stale output and spent retry limits. Live interpretation,
actual-user recovery and packaged desktop deployment are not qualified by fixtures.
The initial focused browser test exposed the notice missing from the main queue;
it was added and the desktop/mobile Pause/reload/resume check passed. The mobile
screenshot was inspected. Existing UI chunk-size/React-key warnings remain.

## Historical response preservation during concurrent edits (2026-11-03)

**No schema, persisted-format or fingerprint change:** SQLite remains 23,
definition work and scan work remain 1. Existing checkpoints need no conversion,
model calls, allowance reset or reassessment on upgrade. Already-discarded replies
cannot be reconstructed. Original job/task/revision identities and all attempts
remain unchanged; newer decisions are never stamped onto historical findings.

Definition processing now validates a returned response against the original
request snapshot before its checkpoint detects a concurrent project edit. A live
worker commits that checkpoint and marks the job stale atomically, then raises the
stale-revision error **outside** the transaction so the saved reply is not rolled
back. No subsequent request or publication is allowed. Cancelled/expired workers,
wrong context revisions and replacement task identities remain rejected. This does
not allow arbitrary changed-input reuse: existing exact-input history/replay gates
remain authoritative. A compatible unrelated-area edit can resume saved stages;
a relevant edit retains historical work but still needs the planned reconciliation.

Scan checkpoints likewise validate new batch outputs on a disposable original
project revision and save them before stopping on a project/folder mismatch. No
proposals publish. Existing scan resume still rejects changed project inputs; this
slice preserves work for future reconciliation, not a changed-input publisher.
Previously saved jobs/receipts are untouched across repeated startup. No full
history replay or new model call is added to checkpointing; the original project
snapshot is loaded only when scan output validation was already required.

Definition loop, lease-renewal and checkpoint revision checks now query the SQLite
revision column directly instead of decoding/validating the entire current project
just to compare its counter. Checks still run on every boundary; no cross-request
cache or weaker freshness rule is introduced. This removes repeated full-project
reads, not evidence replay, and does not establish a measured total-runtime speedup.

See [implementation plan and remaining gaps](workflow-resilience.md). Changed-key
definition history is still local history, not automatically retained in the portable
continuation projection; portable baseline retention needs a separately versioned
compatibility design in the next slice. Qualification below is deterministic, not
recovery of the user's project or live model interpretation.

Verification: type checking, all eight new resilience regressions, 27 focused
definition preservation/cancellation/recovery checks and diff whitespace checking
passed. The initial full pretest run exposed 11 old assertions requiring stale
replies to be discarded; those were updated to require original-input retention
while preserving cancellation and no-publication checks. A broad focused run also
hit its 120-second command limit before completion. The final full-suite rerun
passed all **831 pretests and 715 main tests (1,546 total)**. Browser/desktop
packaging and live/user-project recovery were not run. Existing React list-key
warnings remain non-blocking; no live inference was used.

## Exact recall after linked pages without dimension splitting (2026-11-03)

**No persisted-format, fingerprint or assessment-semantic change:** SQLite remains
23 and definition work remains 1. Existing format-1 linked-answer recall can now
operate on the retained original step after completed linked pages, even when no
dimension split was needed. Previously both receipt inspection and recall required
a dimension-review ledger, so a smaller draft could omit a previously read, cited
reconciliation pair and then be unable to recall it at an evidence-lookup block.

Recall still requires a currently supplied canonical anchor named by the blocker,
an exact reverse evidence-ID link, a complete current question/answer pair in the
frozen plan, same-phase completed receipt evidence, and both records cited in the
saved draft. It supplies all qualifying candidates or none (at most ten pairs).
It cannot clear product-decision/technical blockers, infer preference precedence,
substitute findings for evidence, refund attempts or grant calls. Whole recalled
evidence must fit the normal request budget, potentially through existing complete-
dimension views; genuinely indivisible joint evidence still blocks safely.

Historical context projection retains its original dimension-gated graph omission.
Receipt inspection for explicit recall is separate: the new path cannot silently
change old context hashes or completed findings. New work appends an existing recall
event at the unfinished boundary after exact replay, preserving the dated blocker,
all receipts, original loads and spent attempts. No data rewrite, reset, reassessment
or repeated completed model call is required. Restart still requires explicit consent.

Three new regressions cover exact page-only recall, unchanged old context bytes,
forged/uncited pairs and product blockers, two SQLite reopens, portable continuation,
and a charged bounded retry without repeated pages. Eleven targeted recall checks
passed. Read-only reproduction replayed the 15-stage blocked real job; an isolated
copy recalled the exact qualifying cited pair, preserved all four spent attempts and
all original loads/receipts, then fit its first complete-dimension view at 91,578
characters. This is packaging verification, **not a model verdict** about the human
choices. No live inference or real-project writes were performed.

Full deterministic verification passed: `npm run check`, all **831 pretests plus
707 main tests**, and all **20 default browser runners**. Browser adapters are
fixtures, not live model qualification. The existing UI chunk-size warning remains.

After the user's fresh fully-quit confirmation, the staged desktop was rebuilt;
`npm run test:desktop` and `npx tsx src/desktop/startup-check.ts` passed with isolated
data, saved-work continuity and no inference. Installer generation and the next live
evidence verdict were not performed. Explicit Continue specification uses the saved
unfinished check rather than repeating completed pages.

The final read-only historical compatibility check also passed: all 412 original
responses of the completed skating assessment, two other completed 16-response
assessments, and the blocked 15-response slice assessment replayed with original
hashes unchanged. Completed-assessment publication guards passed for all three
completed jobs; the blocked job retained its four attempts. The 412-response job
took 369,333 ms for both replay and completed-publication validation together while
other checks ran; this is not a startup or speedup benchmark. No saved job was
modified and no inference was performed.

## Combined linked-page and dimension sizing (2026-11-03)

**No format, fingerprint or assessment-semantic change:** SQLite remains 23 and
definition work remains 1. Full-draft linked-page packing remains the first choice
and produces the same schedule when it fits. If even one whole linked question/
answer pair cannot fit with the full accumulated draft, the planner now tests the
existing complete-dimension views while packing pages. Normal preparation records
the dimension schedule before dispatch. Every question/options/current-answer pair
and complete selected check remains intact; all nine dimensions remain scheduled.
The original evidence check still follows all linked pages, with indispensable
joint reads required as before. No bounds, request allowances or failure limits change.

Previously, original-step sizing considered dimension views but linked-page sizing
required all nine findings at once. Thus a large draft plus large linked graph could
defeat both independent remedies even when their combination fits. The generic
"one indivisible evidence record" diagnostic did not establish that the record itself
was large: the reproduced base record was 167 characters and the complete retained
draft was 155,019 characters. No saved text is shortened to fix this planner gap.

Compatibility/recovery: append existing format-1 linked-page/dimension events only
at the unfinished boundary after exact replay. Old receipts, load ledgers, IDs,
attempts and dated blockers remain unchanged. No saved-data rewrite, reset or
completed model-call repetition is required. Resume remains explicit after restart;
an interruption retains accepted page/dimension responses and charges its in-flight
attempt. Genuinely indivisible oversized pairs still stop without partial publication.

Verification: three new regressions cover combined sizing with exact complete bodies,
all dimensions, replay/publication gates, indivisible refusal, cancellation, two
SQLite reopens and portable adoption with a charged retry. Type checking, all 828
pretests plus 707 main tests, and all 20 default browser runners passed. An isolated
291-stage real checkpoint replay retained every original receipt/load and its zero
current attempts. The first request fits at 82,269 characters instead of 184,567;
two whole-pair pages (18 pairs and two pairs) were mechanically exercised through
seven dimension views, all at or below 95,618 characters. The subsequent original
check's first dimension view fits at 79,590 characters. Future empty verdicts in this
isolated check were synthetic sizing fixtures, **not AI verification or completion**.
No live inference or real-project writes were performed.

Desktop delivery after the user's fresh fully-quit confirmation: the staged app was
rebuilt and `npm run test:desktop` plus `npx tsx src/desktop/startup-check.ts` passed
with isolated saved data and no inference. `git diff --check` passed. The existing
UI chunk-size warning remains; installer generation and live completion were not
repeated. Reopen the staged desktop and explicitly Continue specification to resume.

## Indexed replay/validation and historical bundle-probe boundaries (2026-11-03)

**No persisted format, fingerprint or assessment-semantic change:** SQLite remains
23 and definition work remains 1. Dimension/page schedule projection now indexes
active boundary positions instead of scanning every dimension event at every split/
linked-page combination. Response validation uses the same synchronous read-only
projection/completed-pair cache as context rendering; caches are discarded on
return/error and never survive mutations, replay yields or model dispatch. Original
receipts, exact context bytes, evidence and attempts remain unchanged. No saved-data
rewrite, reset, reassessment or repeated model call is required.

Deep replay also exposed a pre-existing bundle-probe incompatibility: a dimension or
execution policy created **after** a saved load could become enabled when replay's
optional packing probe appended that load, making its old root-only fallback appear
to expand differently. A comparison without the new response cache reproduced the
same failure at stage 185. Probes now freeze the schedule/count-bound policies active
**before** the reply while adding its proposed bodies. This validates the original
saved representation, not a newly improved packing result. Every original context
hash, resolved record list and bundle ledger must still match; forged evidence is
not repaired or accepted. No historical bundle or accepted finding is rewritten.

Verification includes an isolated snapshot of the running review: all 249 historical
schedule projections matched pre-change byte hashes; projection time was 611 ms
before and 113 ms after in a local microbenchmark, not an end-to-end review speedup.
Targeted regressions cover inactive boundary ordering, cache cleanup after rejection/
mutation and replay after same-stage post-load dimension/execution changes.

The optimized isolated 248-stage snapshot replay passed every original receipt hash
and evidence validator in 75,846 ms, with attempts and original work unchanged. It
ran at lower process priority while leaving the live app untouched. A paired,
alternating-order five-sample benchmark of that snapshot's next verification response
produced identical virtual receipts/drafts: median validation was 1,098 ms without
the new response read cache and 59 ms with it (both using indexed projection). These
are local computation measurements, not reductions in provider latency or promises
about total completion time. No inference or real-project writes were used.

Final read-only verification after the user paused and fully quit the desktop passed
all **283 saved stages** in **72,849 ms**, preserving the original 248-stage prefix,
all original loads and the current **one spent attempt**. This remains unfinished
verification work, not a completed assessment. Type checking, all **825 pretests and
707 main tests**, and all **20 default browser runners** passed. Browser checks use
deterministic adapters, not live inference; the existing UI chunk-size warning remains.

After the user's quit confirmation, the optimized desktop staging app was rebuilt;
`npm run test:desktop` and `npx tsx src/desktop/startup-check.ts` passed against
isolated data, including saved-work continuity, native shutdown and startup recovery.
The staged desktop is ready for explicit continuation. Installer generation and
end-to-end live AI completion were not repeated or claimed.

## Bounded exact evidence bundles (2026-11-03)

**Additive forward context policy:** SQLite remains **23**, definition work **1**.
The user approved gathering directly linked questions, answers and approval evidence
in exact bundles instead of spending successive model lookups following each link.
Strict format-1 `evidenceBundlePolicy` records the activation stage, original load/
attempt/schedule counts, original context hash, absent-policy snapshot and bounded
local enrichments of existing current-step loads. Each original load can contribute
at most 20 total root/new records. Original receipts, raw lookup responses, resolved
IDs and spent attempts are not rewritten or credited anew. Only the exact old
eight-successful-lookups technical blocker can be superseded, and only when there is
additional bounded saved provenance to supply. Unrelated blockers remain intact.

Bundles follow at most two **forward structural** sourceIDs/evidenceIDs/sourceID/
requirementID/questionID hops, then complete directly linked question/current-response
units. Historical answers remain alongside the question/current response, not
replaced. No prose matches, reverse requirement searches, latest-answer precedence,
inferred approval or unrestricted project allowlist is used. Missing or oversized
optional groups are omitted whole, not shortened or treated as missing human choices.
Future lookup receipts preserve their raw roots and record the exact deterministic
bundle; optional expansion must fit the existing 96,000-character request context or
fall back to the requested roots without partial automatic provenance groups.

Compatible unfinished saved loads can receive one recorded local enrichment at
activation, without a ninth model lookup or a successful-response credit. These bodies
remain mandatory for that unfinished step. If they require existing supplemental
pages, complete connected provenance groups remain indivisible (including overlapping
groups), as do question/answer pairs. Page units may now contain up to 320 records,
bounded by the eight current loads and eight restored bundles of at most 20 records
each. Original format-1 page events still replay with their original pair units.
Accepted page progress is not joint proof: the final original check still requires
an exact joint read for indispensable relationships and blocks if that cannot fit.

Full optional enrichment is used only when the exact combined context fits or the
existing page planner can fit every whole connected group. Otherwise activation
selects only complete optional groups that fit alongside **all** original mandatory
evidence and the complete selected finding. It examines recent lookup roots first
as a packing heuristic, not human-preference precedence. Skipped optional bodies stay
saved but are not represented as supplied; no exhaustive provenance-read claim is
made. If nothing additional fits a legacy exhausted step, its blocker remains and
unchanged continuation dispatches no new model request.

The eight successful lookups, twelve raw attempts, three failed attempts, explicit
exhausted-step recovery, partition/execution ceilings, stale-result checks and restart
suspension remain unchanged. Zero remaining lookup slots are explicit in future
contexts. A repeated unchanged eight-load block dispatches no further model request.
Restored records remain eligible for exact reload after their bodies retire, but do
not become human decisions or preference evidence merely through graph linkage.

Replay validates the original activation context and deterministic restored groups,
then every future bundled request's raw roots and exact expansion. Reopen and portable
continuation preserve the policy, original evidence and charges. Unsupported future
formats, forged expansions and inconsistent boundaries reject rather than rewriting
or resetting saved work. Older clients reject the new optional field/page units;
there is no downgrade. Completed assessments require no migration or reassessment.

Verification: eleven focused bundle regressions, type checking, the full suite
(822 pretests plus 707 main tests), all 20 default browser runners, Windows desktop
rebuild/full checks and the dedicated startup runner passed. Desktop replacement
followed fresh explicit quit confirmation; desktop tests use isolated data. Checks
cover raw/whole exact evidence, forged/future bundles, SQLite reopen, portable
continuation, connected-group pages, optional budget fallback, charged failures/
cancellation/staleness, ninth-lookup refusal and no-call unchanged retry.

An initial read-only real-checkpoint trial validated 155 original receipts and
retained nine attempts/eight successful loads, but its proposed 30 additional
records formed overlapping provenance that could not safely fit whole pages. That
trial was **not** a passing continuation plan. Budget-aware whole-group fallback
was added with a matching regression. Final read-only verification passed: all 155
original receipt hashes validated; nine attempts, eight successful loads and the
one failed attempt remained charged. One complete optional group added three exact
records and the combined context fit at 94,590 characters, without dropping original
evidence or changing load receipts. Other optional groups remain unsupplied. The
observed full verification took 664,229 ms alongside other local checks, not a
guaranteed resume duration. An isolated temporary verified-draft cache was written;
no live calls or real-project writes were used. This does not qualify live
interpretation or whole-area publication.

## Bounded partition-capacity upgrade (2026-11-03)

**Additive forward policy:** SQLite remains **23**, definition work remains **1**.
The user approved raising exact-evidence capacity from 64 to **128 partitions per
phase**. The optional strict format-1 `partitionCapacityPolicy` records the activation
stage, prior primary/follow-up counts, spent attempts, subdivision/page-event counts
and an optional original superseded capacity blocker. It activates only after exact
historical replay, at a proven near-full capacity/subdivision boundary. Only the
recognized old technical capacity blocker can be superseded; unrelated product,
lookup and technical blockers remain. Startup alone does not change jobs or call AI.

Original batches, receipts, lookup responses, exact evidence, context hashes, citations
and spent attempts are retained. Earlier schedule events, including events earlier
in the same stage, retain the old 64-partition validation. New events use 128 only
after the recorded boundary and matching saved counts; the upgrade cannot authorize
an oversized historical schedule retrospectively. A reconstructed pre-upgrade plan
must independently validate the original bounded capacity witness.

The existing **2,304-step execution ceiling**, **64 linked-answer page partitions per
phase**, request/load/failure limits, explicit exhausted-step recovery, 96,000-character
contexts and final joint-evidence checks remain unchanged. More partitions are not
new inference consent. The policy is one-time/nonrenewable: 128 remains a hard limit,
and an indispensable oversized joint read still blocks. Shared schema bounds permit
at most 254 subdivisions across both phases under this policy; legacy work retains
its original 62-subdivision bound and per-phase limits. No partial schedule or text
truncation is used when a limit is reached.

Reopen and portable continuation preserve the policy and all original evidence.
Future formats and inconsistent activation witnesses reject without rewriting work.
Older apps reject the new optional field; there is no downgrade. No reset,
reassessment of completed calls, database migration or fingerprint change is needed.
Failed/cancelled continuation remains explicit and retains previously saved work.

Verification: seven focused capacity checks, type checking, the full suite (811
pretests plus 707 main tests) and all 19 existing default browser runners passed,
including old-limit refusal, a service-level saved-overflow upgrade, charged page
progress, unrelated blockers, 128 refusal, forged/future policies, exact historical
replay, repeated SQLite reopen and portable continuation. Read-only real-checkpoint
validation retained 129 original receipts and five attempts, then planned pages of
16/three records using 66 collection partitions. The first context was 88,218
characters. This made no live calls or real-project writes and did not complete the
remaining area or its final joint check.

After fresh explicit quit confirmation, Windows desktop rebuild/full checks and the
dedicated startup runner passed with isolated test data. Diff checking passed. No
packaged installer or full live-model assessment completion is claimed.

## Cooperative definition replay and rendering-local caches (2026-11-02)

**Compatibility: no persisted format or assessment-semantic change.** SQLite remains
23 and definition work remains 1. No migration, history rewrite, reassessment, attempt
refund or model call is required. Context encoding, evidence selection, request hashes
and replay rejection rules are unchanged. Rendering-local schedule and completed-pair
caches exist only during one synchronous, read-only context rendering; they are
discarded on return/error, never retained across mutations or asynchronous boundaries.
The follow-up owner is computed once before filtering loads rather than per load.

The service consumes the same exact replay validator at cooperative receipt
boundaries, yielding to the worker event loop, checking cancellation and renewing only
an already-live, current-revision job lease. Progress names validated saved stages,
not completed AI work. Lease renewal cannot revive expired/cancelled workers, accept
changed revisions, grant inference or overwrite original saved jobs. Checkpoints also
renew finite leases during local preparation; per-request deadlines, bounded action
limits, explicit recovery consent and restart suspension are unchanged. Interruption
before a new checkpoint leaves the historical source work intact for explicit resume.

This addresses four observed ~37-minute failures before any adapter request: local
history replay outlasted the worker lease, then its first checkpoint was rejected.
Tests cover exact cooperative/synchronous replay, forged hashes, post-mutation cache
freshness, simulated replay beyond the original lease, event-loop cancellation and
stale edits before inference, and strict renewal guards. Real-checkpoint performance
verification is read-only and does not establish live-model or whole-area completion.

Verification: type checking, five new targeted regressions, the full suite (805
pretests plus 707 main tests), all 19 default browser runners, Windows desktop rebuild/
full checks, dedicated startup checks and diff checking passed. Desktop replacement
followed fresh explicit quit confirmation. Read-only replay of the original checkpoint
validated all 119 receipt hashes in 291,483 ms, then planned the same 27/two-record
pages with an 85,684-character first context; all original loads, receipts and eight
spent attempts were unchanged. This ran alongside other checks and is an observed
local duration, not a cross-machine benchmark or guaranteed resume time. The exported
failed runs measured 2,144,284–2,193,105 ms in replay and dispatched zero requests.
No real-project write, live inference or completed-area publication was exercised.

## Within-step supplemental evidence pages (2026-11-02)

**Additive forward continuation:** SQLite remains **23**, definition work **1**.
Optional strict format-1 `supplementalReviews` events record the exact overflow
boundary, original load counts, spent attempts, schedule counts, selected-finding
digest, complete record IDs and whole-record page units. Current supplied question/
answer pairs stay together. Historical replay validates the original overflow,
evidence and finding before accepting this local scheduling event; original receipts,
loads, hashes, provenance and attempts are not rewritten or refunded. No startup
rewrite or model call occurs. Completed assessments need no reassessment.

After stage-scoped loading and dimension subdivision cannot fit one unfinished
check, bounded pages supply its complete selected finding plus whole exact records.
Accepted pages save draft progress, not a published assessment or proof of cross-page
consistency. The original check follows every page. Indispensable relationships must
reload the necessary exact records jointly within existing allowances; an oversized
joint bundle stops rather than repaging indefinitely. Page requests cannot load more
evidence or trigger linked-answer recall. Supplemental pages and subdivisions share
the existing 64 evidence partitions per phase and saved execution ceiling. An
unavailable partition/execution budget rejects the entire proposed schedule.

Reopen and portable continuation preserve events and original evidence. Unsupported
future formats, missing records, changed findings and inconsistent boundaries reject
without downgrade or invented evidence. Older clients reject the new optional field;
resume using a supporting app. Failures, cancellation, stale revisions and exhausted
recovery retain accepted page progress and charged attempts.

Verification: ten focused page regressions and type checking passed, including
SQLite reopen, portable continuation, full findings/records, pair subdivision, failure/
cancellation/staleness, charged recovery, shared partition-limit rejection, genuine
product blockers and oversized-joint refusal. The full test run passed 800 pretests
and 707 main tests; all 19 default browser runners passed, including Pause/reload,
charged retry, exact continuation and final joint reload. Read-only simulation of the
user's saved checkpoint retained 119 original
stages and eight attempts; 29 records became pages of 27 and two, with contexts of
85,684 and 74,476 characters and a pending final joint context of 64,518. Findings
and original loads were unchanged after both simulated page receipts. This did not
complete the real area, call a live model or modify real project storage.

After explicit confirmation that the app was fully quit, the Windows desktop rebuild,
full desktop runner and dedicated startup runner passed using isolated test data.
CLI help checks and `git diff --check` also passed. No packaged installer or live
end-to-end assessment completion is claimed.

## Stage-scoped supplemental evidence bodies (2026-11-02)

**Additive forward context policy:** SQLite remains **23**, definition work **1**.
The user approved stopping automatic carry-forward of completed steps' supplemental
loads while retaining every original load, accepted receipt, citation and spent
attempt. Optional strict `supplementalScopePolicy` format **1** records the activation
stage, exact prior primary/follow-up counts, spent-attempt boundary and schedule-event
counts. It activates only after historical replay on unfinished compatible work that
has earlier accepted loads. Reopen alone neither changes jobs nor calls a model.

Before activation, old contexts retain the legacy inherited-owner semantics. After
activation, a request supplies its exact scheduled base and **all loads requested in
that unfinished step**, including accepted loads predating the compatible upgrade.
Local subdivision/repacking before a receipt is accepted keeps those current loads.
Once the step is accepted, its load receipts remain immutable but their bodies are
not automatically carried into later steps, including sibling dimension groups or
subdivisions. Protocol/schedule ownership is unchanged; historical primary requests
and follow-ups are never deleted, rewritten, reassigned or falsely credited anew.

Earlier load IDs from the inherited owner appear as explicit navigation, not quoted
human evidence or new product constraints. Previously validated exact load IDs remain
reloadable, including out-of-plan linked records authorized by those earlier receipts;
unrelated project IDs do not become eligible. A required reload consumes the existing
step/action allowance. Retained supported findings/citations stay unchanged, but
omitted human text or omitted AI dimensions cannot justify new or revised findings.
The request explicitly requires exact reloads before using indispensable old evidence,
and blocks if it cannot be supplied safely. No summarization, truncation, inferred
replacement, failure refund or new model consent occurs. Twelve-request/eight-load,
three-failure, recovery, Stop, stale-output, lease and 96,000-character rules remain.

Stage plus request-count/attempt boundaries preserve hashes of earlier loads and
correction failures in the same stage. Existing recall-event absence snapshots also
recognize the new policy. Compatible old technical single-check overflow blocks can
be superseded only when the exact old context really overflows and removing completed
loads produces a fitting context with fewer bodies; unrelated evidence/product/
technical blockers remain intact. Some legacy full-draft overflows now fit without
dimension subdivision; tests accept either exact representation rather than requiring
unnecessary scoped work. Previously completed calls are not repeated just to change
representation. Completed assessments need no upgrade or reassessment.

Portable continuation preserves the policy and all original historical loads.
Unsupported future formats, inconsistent activation counts and malformed boundaries
reject; older apps cannot read the new field (no downgrade support). This is an
additive workflow/context representation, not a SQL migration or assessment-input
fingerprint change. Interrupted preparation can retry from the latest durable
checkpoint without refunding attempts or overwriting the original dated job.

Read-only diagnosis of the revision-3041 checkpoint with **93** saved stages found a
single-record boost check still inherited **19** records from seven earlier completed
material-retention lookups. Its selected acceptance check was also retained in full.
The compatible in-memory upgrade preserves all 93 receipts, all original primary and
follow-up requests, the unchanged draft/citations and **one** spent current-step
attempt. Its next context is **49,558 / 96,000** characters with three detailed records
(boost requirement plus exact question/answer), compared with the blocked **98,167**
characters and 48 records. The earlier 48,053-character pruning experiment was only a
size lower bound, not a valid migration; the implemented policy adds honest navigation
and instructions. No historical load was actually pruned or rewritten.

Verification: **1,497** full-suite tests (**790** pretests + **707** main), ten focused
stage-scope regressions, type checking, all 18 default browser runners, the focused
continuous correction/Pause/reload browser flow, UI/desktop builds and Windows Electron
continuity/relaunch passed. Tests cover immutable older loads, same-stage correction
hashes, current evidence through subdivision, exact reloading of out-of-plan receipt-
validated history without global access, repeated SQLite reopen, portable continuation,
future/inconsistent policies, unrelated blockers, stale/cancelled output and exhaustion.

The no-inference unchanged-findings simulation logged **125** new simulated checks
(**218** total stages), **16** extra subdivisions and an observed maximum **93,295**
characters, then reached its **ten-minute local verification guard** before completion.
It is not a passing full-continuation/publication simulation. The initial upgrade and
93-stage historical replay passed independently; future live interpretation, new
findings/reloads and whole-run completion remain unqualified. No real-project writes,
live AI calls, commits or pushes were performed during verification.

## Exact linked-answer recall after scoped ambiguity (2026-11-02)

**Additive forward event ledger:** SQLite remains **23**, definition work **1**.
The user approved resupplying exact saved resolution evidence when a later scoped
review revisits conflicting records but omits their earlier linked question/answer.
Optional `linkedAnswerRecalls` events are strict format **1**. Each retains the
original stage, spent attempt, source job, saved/returned-block provenance, original
lookup-block reason and context hash, scheduling-event counts, named anchor IDs and
complete question/current-answer pair IDs. `absentPolicies` preserves the exact
pre-recall protocol markers if a subsequent compatible continuation adopts a marker
at the same stage. Events neither replace the accepted draft nor fabricate AI loads.

Recovery runs only after historical replay or a newly returned typed `evidence-lookup`
block, within an explicit task's live consent. Every candidate must be an answered,
current, non-superseded reciprocal question/answer pair in the frozen plan, already
read together in the same phase's saved base/page evidence and cited by the retained
draft. Its explicit question `evidenceIDs` must reference a full record actually
supplied and named in the blocker. No keyword/prose-link matching, global search,
latest-answer-wins inference or hidden-dimension AI finding is used as product evidence.
Restore **all** such candidates or none (at most ten complete pairs/twenty records).
Exact questions, options and chosen answers are supplied, not a synthesized resolution.
Human wording and stated scope alone can establish replacement or an exception.

The original blocked response remains spent against the same three-failure limit.
A local reload earns no successful evidence-request credit, new allowance or model
consent. Stop, expected-revision/lease guards, timeouts and the separately confirmed
one-request exhausted-step recovery remain unchanged. Product-decision/technical
blocks, missing/unlinked/uncited/superseded pairs and already supplied pairs are not
cleared. A repeated ambiguity with the exact pair present stops normally. Recalled
evidence remains supplied in subsequent same-phase steps only when a named anchor is
in their base evidence. Contexts still obey 96,000 characters, with existing exact
subdivision/dimension bounds; indivisible oversized evidence is never shortened.

Replay removes recalls from requests/failures preceding their stage/attempt and trims
later schedule events. Each event must reproduce its exact missing-pair candidates
and original context. Existing requests, accepted checks, human evidence, citation
labels, input/plan identities and attempts remain intact. Reopen alone never calls a
model or rewrites jobs. Interrupted continuation retains the old dated job and latest
durable checkpoint; no completed call is repeated. Portable continuation carries the
ledger; malformed/forged events and unsupported future formats reject. Older apps
cannot read the new optional field; no downgrade support, SQL migration, fingerprint
change, reset or reassessment of equivalent completed work is required.

Read-only diagnosis at revision **3041** found the explicit human answer “One trick
is enough; replace the two-trick and two-move minimums” was read at stage **35** and
retained in the rules assessment, but absent from the later acceptance-only request.
An in-memory recall restores that full pair and the other directly linked cited pair
without exposing the omitted rules assessment. All **50** accepted stages, accepted
lookups and **two** spent current-step attempts replay unchanged. The continuation is
**95,811 / 96,000** characters (previously 90,430), without further subdivision.
This is deterministic exact-context verification, not qualification of live model
interpretation. No live calls or real-project writes were made.

Verification: **1,485** full-suite tests (**778** pretests + **707** main), **nine**
final focused recall regressions (including subsequently added cancellation/staleness
cases), type checking, all 18 default browser runners, the focused continuous
correction/Pause/reload browser check, UI/desktop builds, Windows Electron
continuity/relaunch and diff checks passed. Recall-specific fixtures cover exact
cross-dimension evidence, no hidden AI finding, full-pair/no-precedence semantics,
no partial/oversized answer truncation, forged/future ledgers, repeated reopen,
portable continuation, saved/returned blocks, repeated-block stops and charged
exhausted-step recovery, including same-stage compatible protocol adoption.

A larger unchanged-findings continuation simulation initially exceeded its local
120-second execution timeout without producing a completion result. The bounded longer
in-memory simulation subsequently completed in **449,453 ms**: **144** new simulated
checks, **194** total stages, **18** additional exact subdivisions, and maximum
**95,990 / 96,000** characters. All 50 original receipts and accepted lookups remained
unchanged; the original two spent attempts were retained through the first simulated
continuation, and the simulated findings stayed identical. Neither attempt used
inference or wrote to project storage. This qualifies unchanged-findings scheduling
and replay, not future live interpretation or genuinely new findings/blockers.

## Bounded correction of invalid assessment citations (2026-11-02)

**Additive forward protocol policy:** SQLite remains **23**, definition work **1**.
The user explicitly approved extending bounded correction from evidence lookups to
invalid citations in definition assessments, updates and verification verdicts.
Optional strict `citationCorrectionPolicy` format **1** records activation stage and
prior accepted lookup counts. `citationFailures` records the entire rejected parsed
response, generated diagnostic, original context hash, stage/attempt, job/model and
subdivision/linked/dimension-event counts. Nothing from a rejected response changes
the accepted draft, including valid checks, confidence or explanation. No area ID is
promoted to an evidence record, and no missing reference is guessed, dropped or
replaced automatically. Feedback explicitly distinguishes area IDs, evidence IDs,
request citation labels and identifier-table indexes. Rejected assessment text stays
in its receipt, not in the next context as product constraints.

Each rejected assessment consumes the **same three-failure limit** as invalid lookups
and interrupted/failed calls. It earns no successful-load credit and grants no new
request/action/workflow consent. Existing per-request timeout, eight-load/12-request
envelope, Stop, revision/lease guards and separately confirmed one-request exhausted
recovery remain unchanged. Other malformed output and genuine blockers still stop.
Unknown labels and missing/out-of-context canonical records receive bounded feedback;
the next permitted request must return a complete valid response for that step.

Activation occurs only after historical replay on unfinished compatible unblocked
work. Contexts without citation feedback remain byte-identical. Replay excludes later
failed assessments from earlier loads/failures; it also suppresses later same-stage
legacy feedback when reconstructing requests at or before its spent attempt. Each
saved rejection must reproduce the same typed validation error from its original
context before continuation/publication. Original human records, citation authority,
receipts, input/plan keys and spent attempts remain intact. Older completed work needs
no reassessment. Unsupported future policy versions and malformed/forged ledgers reject.

Legacy failed jobs matching the app-generated citation diagnostic retain their original
job, diagnostic and attempt in `legacyRejection`, with a hash of the compatible prepared
continuation context. Feedback explicitly says the rejected response was not saved;
no replacement evidence or missing response is reconstructed. Opening the database
alone does not migrate jobs or make calls. New fields are carried through portable
continuation; older apps cannot read them (no downgrade support). No SQL migration or
assessment-fingerprint change is necessary. Interrupted upgrades retain the old job
and resume from the latest durable checkpoint; they never refund attempts.

Read-only replay of the reported revision **3035** confirms the rejected citation was
the ID of “Modular traversal tiles and prop population,” not an evidence record. The
in-memory upgrade retains **zero completed stages**, **one spent attempt**, all **30**
supplied records and their exact citation map. Feedback fits at **37,576 / 96,000**
characters (previously 36,119). No inference or real-project write was performed.

Verification: **1,477** full-suite tests (**770** pretests + **707** main), **10**
final focused citation regressions (including the subsequently added unknown-label
case), type checking, all 18 default browser runners, UI/desktop builds and Windows
Electron continuity/relaunch checks passed. The focused browser flow passed atomic
lookup rejection → invalid assessment citation → correction → Pause/reload → exact
continuation, with unchanged saved findings and mobile controls. Its first invocation
timed out on reload while the UI build was being replaced concurrently; the isolated
rerun against completed assets passed. Fixtures qualify protocol/accounting, not live
model correction or semantic interpretation. No live calls or real-project writes.

## Bounded correction of invalid evidence lookups (2026-11-02)

**Additive forward protocol policy:** SQLite remains **23**, definition work **1**.
Optional strict `evidenceCorrectionPolicy` format **1** records the activation stage
and prior accepted lookup counts. New `evidenceFailures` preserve each rejected parsed
lookup, generated validation reason, exact context hash, stage/attempt, source job/model
and subdivision/linked/dimension-event counts. No invalid request partially loads its
otherwise valid IDs, earns successful-load credit, changes findings or grants citations.
The next permitted request receives quoted rejected references plus validation feedback
and can correct its lookup or proceed without it. Unknown labels are never guessed,
mapped through a global ordinal, coerced from identifier-table indexes or silently dropped.

The user explicitly approved bounded correction. Each rejected response remains spent
within the existing **three-failure** limit, 12-request/eight-load step envelope and
live workflow/action consent. Ordinary Refresh cannot reset exhaustion. A separate
explicit exhausted-step grant remains one additional request, charged before dispatch.
Other malformed responses, semantic blockers, transport/model failures, timeouts,
cancellation and stale output keep their existing stop/rejection behavior. Feedback
is not a product decision and cannot generate clarification questions.

Activation occurs only after historical replay for unfinished, compatible, unblocked
work. Existing requests/receipts, raw accepted evidence, input/plan keys, completed
checks and attempts remain unchanged. Stage/request/event boundaries reconstruct each
rejected request before later loads, feedback or repacking; accepted lookup replay
excludes failures that happened afterward. A later same-stage follow-up-policy upgrade
also retains its pre-upgrade context. Failures and accepted loads are distinct ledgers,
never credited twice. Unsupported policy formats, forged contexts, invalid boundaries
and fabricated failure records reject without overwriting saved work.

Older saved technical failures matching the exact invalid-reference diagnostic retain
their original dated job/reason and spent attempt. A `legacyRejection` supplies those
known counts, explicitly discloses that the old app did not save the rejected IDs/raw
response, and binds the newly prepared continuation context after compatible upgrades.
No missing raw response or intended reference is manufactured. Genuine product/other
blocks are not cleared. Reopen alone runs no calls. Portable continuation carries this
optional policy/ledger; older apps cannot read it (no downgrade support). No SQL
migration, reset, reassessment of completed work or assessment-fingerprint change occurs.

Read-only diagnosis of the reported revision-3031 case found one unavailable label
among five requested references. Its global meaning was unrelated, so it was not a safe
substitute. In-memory upgrade preserves both saved checks, the spent attempt and all
71 supplied records; the continuation including feedback is **91,935 / 96,000**
characters (previously 90,899). Stored OpenCode messages were inspected through a
separate owned server without inference; no project writes or provider credential
inspection occurred. This does not qualify future live model correction.

Synthetic tests cover atomic mixed-request rejection/correction, three-failure stop,
no ordinary retry/recovery refund, a separately spent one-request recovery, cancelled/
stale correction output, legacy continuation, same-stage accepted-load/failure hashes,
repeated SQLite reopen, portable decoding and future/tampered-ledger rejection.

Verification: **1,469** full-suite tests (**762** pretests + **707** main), all 18
default browser runners, five final focused correction regressions, a focused browser
flow with atomic rejected lookup → correction → Pause/reload → exact continuation,
type checking, UI/desktop builds, Windows Electron continuity/relaunch and diff checks
passed. Fixtures qualify protocol/accounting, not live model correction. No live
inference or real-project data writes were performed.

## Task-derived definition dimension execution (2026-11-02)

**Additive forward scheduling policy:** SQLite remains **23**, definition work **1**.
Optional strict `executionPolicy` format **1** records the activation receipt boundary,
prior accepted request/follow-up counts, subdivision count, linked-review count and
dimension-review count. Ordinary Refresh/Continue adopts it only after successful
historical replay for unfinished, unblocked dimension work. No startup rewrite or
inference occurs. Original batches, input/plan keys, exact evidence, draft checks,
loaded IDs, context hashes, raw responses, dated jobs and spent attempts stay intact.
Completed work is not upgraded, invalidated or reassessed.

The legacy 128-step envelope could be exhausted by auxiliary dimension groups while
many evidence partitions remained below their limits. New work uses a bound derived
from the complete permitted task grid: **two phases × (64 evidence partitions + 64
linked-answer page partitions) × nine dimensions = 2,304 execution steps**. Linked
pages have an explicit separate per-phase bound; dimension groups do not consume new
evidence partitions. Pair-preserving subdivisions of linked pages retain their existing
evidence-subdivision charge as well. The existing 62-event subdivision ledger, 96,000-
character request limit, unchanged evidence/citation authority, per-step request/load/
failure limits, recovery consent and workflow authorization remain authoritative.
This is not an unlimited retry allowance or permission to waive an indivisible check.

Without the new policy, legacy work retains its original 64/128-step bounds. Larger
indices/receipts require the marker; impossible boundaries and unsupported future
formats reject without overwriting saved work. Stage plus same-stage request/event
counts preserve pre-upgrade receipt/lookup contexts. Policy activation is idempotent
and interruption-safe: its next checkpoint contains either the previous valid ledger
or the additive marker and schedule. Reopen alone cannot dispatch. Portable continuation
carries the policy; older apps cannot read it (no downgrade support).

Discovery metrics format **1** now allows up to **27,648** request entries (2,304 ×
the existing 12-request stage maximum), preventing telemetry storage from becoming a
smaller execution ceiling. Old measurements stay unchanged; no timings, calls or
missing historical provenance are invented. Saved assessment semantics/fingerprints
and privacy allowlists are unchanged.

The reported revision-3028 checkpoint was read directly through a read-only SQLite
connection: **118** saved stages (80 collection/38 verification), a 128-step schedule,
and **39 collection / 24 verification** evidence partitions. Historical replay and an
in-memory policy activation preserve every saved response and lookup. The blocked
20-record step can schedule its complete checks at **83,565 / 96,000** characters
without repeating earlier calls. This is a scheduling reproduction, not live semantic
qualification. Synthetic upgrade tests also cover >128-step completion, retained
failed attempts, repeated reopen, portable continuation and future/unmarked rejection.

The complete read-only continuation simulation subsequently finished at **173** total
steps (**55** simulated new checks), retaining all 118 original receipts and every
accepted lookup with unchanged simulated findings. Maximum context was **95,929**
characters; evidence partitions ended at **39 collection / 30 verification**, linked
page partitions at **19 collection / 22 verification**. This proves the unchanged-
findings schedule fits, not that future live responses will agree or add no evidence.

Verification completed: **1,464** full-suite tests (**757** pretests + **707** main),
all 18 default browser runners, focused continuous/limit browser checks, type checking,
UI/desktop builds, Windows Electron continuity/relaunch and diff checks passed. The
final regression rerun includes an unfinished upgraded checkpoint carried through
portable decoding and SQLite reopen, and independent evidence/page ceiling checks.

## Continuous specification consent (2026-11-01)

**Additive opt-in execution metadata:** SQLite remains **23**, workflow-state/run
formats remain **1**. An optional strict `continuous: { format: 1 }` marker on the
grant and its newly created run receipts permits cumulative spending above the legacy
eight-request bound. Without the marker, validation still enforces the old bound.
Unknown future marker formats reject without overwriting data. New run receipts allow
up to 10,000 distinct job references; counter values remain safe nonnegative integers.
Neither the marker nor a larger counter is added to existing saved grants or receipts
on startup. Old app versions cannot read the new marker (no downgrade support).

The authenticated, revision/settings-version checked `continue-continuous` action is
explicit new consent; the browser explains ongoing AI-plan usage and Stop before the
button. Legacy `continue` retains its bounded semantics for existing callers/tests.
Older grants, project revisions, input/spec/assessment identities, checkpoints, raw
responses, failures and spent recovery grants are not migrated, reset or invalidated.
Existing same-input work replays before continuous dispatch. No reassessment or model
call is required just to reopen equivalent saved work. Workflow authority remains
machine-local and is not exported through portable project continuation.

Continuous runs remove the coordinator's overall request/time cutoff, not per-request
timeouts, failed-attempt/context/partition limits or separate recovery consent. Live
owned workflow leases renew; retrieval checkpoints can renew only an already-live job
by at most six minutes. Stop/shutdown/failure never rearm saved consent. Twenty-step
worker yields retain cumulative spending and create a new ordinary run receipt on the
next armed tick. Restart remains suspended until an explicit Continue; old/future data
is never silently reinterpreted as permission for automatic calls.

Synthetic regressions exercise twelve requests over twelve simulated minutes, Stop,
failure and technical block, preserving all earlier receipts/loads and charging the
interrupted request before dispatch. Compatibility tests cover unchanged legacy grants,
expanded counters requiring the marker, future-format rejection and repeated SQLite
reopen without calls. No live model or real-project writes are used for verification.

Verification: full `npm test` passed **1,460** tests (754 pretests + 706 main), all
18 default browser runners passed, and type/UI/desktop/diff checks passed. Windows
Electron checks included SQLite continuity/relaunch and saved-project retention after
the user confirmed the app was closed. Live provider behavior was not exercised.

## Compact definition navigation metadata (2026-11-01)

**Metadata-only forward upgrade:** SQLite remains **23**, execution **2**, and
definition work **1**. Optional `contextMetadataPolicy` format **1** records the
activation stage and prior accepted request/follow-up counts after historical replay.
Old requests, raw lookup reasons/aliases, canonical loaded IDs, context hashes,
receipts, human evidence, selected checks and spent attempts are unchanged. Reopening
alone runs no inference. Refresh/Continue activates this policy for compatible,
unfinished, unblocked work; completed work is not rewritten or invalidated.

Future contexts supply canonical supplemental ID lists without repeating historical
**AI navigation explanations** as product constraints. Full exact human/source bodies
and selected AI assessment checks remain supplied. The lossless identifier dictionary
can also encode values in the exact declared `identifierTable.recordMaps` path
`definitionStage.citationLabels`; short-label keys stay unchanged. Other maps in quoted
source JSON are not interpreted as identifier maps. Callers without declared paths
retain the old encoding. Instructions describe expansion through the same dictionary.

Stage/request-count boundaries reproduce pre-upgrade contexts, including earlier
loads accepted at the current stage. Interrupted work resumes without repeating those
calls or refunding failures. Activation is idempotent; strict validation rejects future
formats, unavailable prerequisite policies and impossible boundaries without overwriting
saved work. Portable continuation carries the policy; older apps lacking this optional
field cannot read upgraded work. No SQL migration, evidence truncation, assessment
invalidation, context-budget increase or change to consent/request limits is required.

Regression coverage includes independent lossless map decoding, quoted-map isolation,
old and new same-stage lookup hash replay, repeated SQLite reopen, portable continuation,
future/corrupt boundaries and preservation of failed-attempt accounting. A read-only
replay of the latest real checkpoint retains all **34** receipts, **39** included records
and **two** spent attempts; the selected-check context falls from **97,129** to
**83,208 / 96,000** characters. No real project writes or live model calls were used;
this does not qualify future model interpretation or rule out later evidence growth.

Verification completed: **1,456** full-suite tests (750 pretests + 706 main), all
18 default browser runners, focused continuous/recovery browser checks, six focused
metadata/recovery regressions, type checking, UI/desktop builds and Windows Electron
continuity/relaunch checks passed. Earlier shell timeouts were rerun without a command
limit; they were not counted as successful runs.

## Bounded assessment dimensions after supplemental evidence (2026-11-01)

**Additive forward execution policy:** SQLite remains **23**, execution **2**, and
definition work **1**. Optional `dimensionReviews` format-**1** events record the
receipt boundary, prior accepted request/follow-up counts, subdivision count, linked
review-event count, and ordered groups of dimension names. Saved batches, input/plan
keys, all earlier raw replies, loaded IDs, context hashes, receipts, source jobs,
human provenance and spent attempts remain unchanged. Completed reviews and equivalent
saved progress are not invalidated or rerun. No SQL migration or startup rewrite occurs.

Explicit continuation first replays existing work. When whole evidence/draft packing
cannot fit, an unfinished step can become bounded dimension groups. All original
base and supplemental evidence remains supplied verbatim in every group. Only the
selected **AI draft checks** are projected, with their complete explanations/citations;
omitted checks remain saved and explicitly outside the current review scope. App-side
validation rejects changes to omitted dimensions, hidden-only citations and global
confidence/explanation. Empty updates retain all findings exactly; verification remains
downgrade-only. Group boundaries must cover the original unfinished dimensions exactly
once and in order. Further evidence or draft growth may subdivide only unfinished groups.
Indispensable cross-dimension relationships not established by exact supplied evidence
remain unknown or block; independent groups do not establish exhaustive consistency.

After this versioned boundary, exact question/current-answer pairs supplied **together**
in an accepted request in the same collect/verify phase are not automatically expanded
again merely for another batch/child. This uses original saved read progress, not prose
matching or preference precedence. Verification does not borrow collection read credit.
Explicit requests can still reload indispensable exact text; accepted loads remain
supplied in full. Linked pages and dimension groups compose when both the graph and
the AI draft independently exceed the budget. The request that caused overflow is
retained, not repeated to adopt the compatible projection.

The old **combined 64-step** ceiling still governs work without an active valid event.
The new policy explicitly separates **64 exact-evidence partitions per phase** from
auxiliary linked/dimension review, with a hard **128 total execution-step** ceiling.
The existing 62-event subdivision ledger bound remains. This supersedes the flat
stage accounting in the dated paging entry below; it does not increase the 96,000-
character context bound, per-step 12-request/eight-load/three-failure limits, explicit
one-request recovery, shared action deadlines or coordinator eight-request/five-minute
grant. The first group inherits the unfinished step's attempts and successful-load
accounting; no failed attempt is refunded. Further dispatch requires the existing
live consent/accounting. Unsupported or missing policies cannot authorize expanded
stage indices/receipts. Unknown future event formats reject without overwriting data.
The 1,280-citation accumulated-check bound and assessment identity rules are unchanged.

Metadata-only discovery metrics format **1** now admits up to **1,536** request entries
(128 × the existing 12-request stage maximum), instead of 64, so continuous review does
not fail while checkpointing its 65th measurement. Old measurements remain untouched;
no historical timings or calls are invented. All existing privacy fields remain the same.

Activation/scheduling is append-only and idempotent after replay; pre-event same-stage
request counts and subdivisions preserve original context hashes. Before-dispatch
spending, accepted groups and the entire draft survive interruption, repeated SQLite
reopen and portable adoption. Existing strict portable work validation carries the
new events; older apps without this field cannot read upgraded work (no downgrade
support). Portable continuation still excludes unrelated activity/diagnostic prose.

Synthetic tests cover the reported accepted-pages → draft-growth → already-read-pair
lookup → overflow path, exact evidence retention, narrow mutation/citation authority,
global-field rejection, nested scopes after another lookup, interruption/portable
continuation, stale edits, exhausted recovery outcomes, owned Continue accounting,
downgrade-only verification, future/corrupt/unversioned bounds, and durable metrics
past 64 requests. A read-only in-memory run of the real checkpoint preserves all 26
saved receipts and the accepted lookup; with unchanged simulated findings the entire
remaining schedule completes at 113 execution steps, 38 collection/29 verification
partitions, and at most 95,906 context characters. This proves packaging/replay only,
not the correctness or cost of future live model responses. No live inference or
user-project writes were used.

Verification: full `npm test` passed **1,454** tests (748 pretests + 706 main),
all 18 default browser runners passed, and the final nine focused dimension/recovery
regressions passed again. Type checking, UI/desktop builds, Windows Electron checks
(including SQLite continuity/relaunch, renderer isolation, saved project retention
and shutdown), and diff checking passed. The user closed the desktop before staging.

## Bounded linked-answer review pages (2026-11-01)

**Additive forward continuation:** SQLite stays **23**, execution **2**, definition
work **1**, and `linkedAnswerPolicy` **1**. Optional `linkedAnswerReviews` contains
format-**1** append-only schedule events: receipt stage, prior evidence-request and
follow-up counts, prior subdivision count, and ordered pages of complete canonical
question/current-answer pairs. Existing batches, input/plan keys, receipts, raw replies,
loaded evidence, dated source jobs, original blockers and attempts are not rewritten.
Completed work remains unchanged. No SQL migration, startup rewrite, model call or
new user consent is introduced by reopening; older apps without this field cannot
read the upgraded continuation and unsupported future event formats fail closed.

On explicit Refresh or owned Continue specification, the service first validates and
replays saved work. If full automatic linked expansion is oversized but its original
base/draft fits, it inserts exact linked-answer pages immediately before that unfinished
step. Each page carries the complete retained draft and whole question/options/answer
records; none are truncated or replaced by summaries. The original base plus every
saved supplemental load is still reviewed afterward. The original collect/verify
rules apply to pages; verification cannot upgrade findings. All records remain in
the frozen plan and its final verification. Separate pages do not establish exhaustive
cross-record consistency or make a graph link/newer date preference precedence.

Pages use normal before-dispatch attempt accounting, existing time/action/coordinator
grants and the shared **64-stage** ceiling. The first page inherits the unfinished
step's spent attempts and successful-load accounting, never a reset. Later pages
advance only after validated success. Additional draft growth permits subdivision
only between complete pairs. An indivisible pair/draft or exhausted stage/limit remains
blocked; diagnostics distinguish size/indivisibility from an actually reached stage
limit. Pages cannot request extra evidence loads: indispensable cross-page lookups
are deferred to the original step under its existing evidence rules, not a new allowance.
Genuine conflicts may still block a page; paging cannot clear typed product blockers.

Same-stage replay reconstructs the pre-event request counts and subdivisions, keeping
historical request hashes byte-identical. Validation reconstructs canonical graph
closure at the event boundary and rejects missing, duplicate, reordered or mismatched
pairs. Whole-pair subdivisions retain earlier page receipts. Interrupted scheduling is
idempotent after replay; accepted pages and before-dispatch spending survive SQLite
reopen and portable adoption without redispatch. Existing strict portable work-schema
validation carries the events without exporting unrelated activity or machine sessions.

Synthetic regressions cover oversized graph/draft packing, exact pair scope, repeated
reopen, portable continuation/publication, finite request pauses, later draft growth,
pair-preserving subdivisions, corruption/future versions, exhausted recovery outcomes
and owned Continue accounting. A read-only, in-memory dry run of the reported saved
checkpoint preserved its 23 receipts and spent attempts and planned three pages within
the existing stage ceiling; unchanged simulated findings fit all three pages and the
original base under 96,000 characters. This is packaging/replay evidence, not a live
model-result guarantee. No user-project writes or live model calls were used.
Verification: full suite **1,445** tests and all 18 default browser runners passed;
seven focused page regressions passed again after the final evidence-owner correction.
Type checking, UI/desktop builds and Windows Electron checks passed with the app closed,
including saved SQLite continuity/relaunch, renderer isolation and shutdown.

## Exact linked question-and-answer bundles (2026-11-01)

**Additive forward workflow upgrade:** SQLite remains **23**, execution **2** and
definition work **1**. Optional `linkedAnswerPolicy` format **1** records the first
new stage, prior request/follow-up counts, subdivision count and original superseded
blocker when applicable. Old work first replays without this policy. Earlier receipts,
same-stage supplemental hashes, raw responses, canonical IDs, plan/input fingerprints,
history and spent attempts remain unchanged. Completed work is not upgraded or rerun.

New contexts bundle full answered questions/options with their exact current human
answer sources. Canonical reverse question `evidenceIDs` links also supply answered
reconciliation/follow-up chains within the frozen plan. Both question and matching
current answer must be planned; superseded answers and pending/deferred/delegated
questions cannot stand in for current human choices. Shared notes/requirements and
prose similarity do not establish these relationships. Links and later dates grant
no preference precedence: the reviewer must read the exact choice and its scope.
The 96,000-character bound remains authoritative; human evidence is not truncated.

A saved typed `evidence-lookup` block upgrades only with explicit Refresh/recovery
or the owned Continue specification permission, canonical loaded records named in
the blocker, and a structurally linked unread question/answer bundle. Validation
reconstructs that witness using pre-upgrade requests and subdivisions. Product
conflicts, unrelated blocks and already-upgraded blocks cannot repeatedly recover.
Existing attempt, time and workflow grants remain authoritative, including explicit
one-request recovery for exhausted stages. Reopen itself grants no inference.

The policy round-trips in existing SQLite/portable JSON schemas; no startup rewrite
or SQL migration is needed. Unsupported future policy formats fail closed; downgrade
to versions without the optional field is unsupported. Activation is idempotent;
interruption retains the original work and before-dispatch spending. Synthetic tests
cover exact scope, cycles, exclusions, same-stage replay, subdivisions, oversized
bundles, repeated SQLite reopen, portable adoption/publication and successful/failed/
cancelled exhausted-stage recovery. No real project writes or live model calls were used.
Verification: full suite **1,435** tests passed, followed by **141** staged-definition/
workflow tests including three additional outcome regressions. Type/UI build, all
18 default browser runners, focused whole-project refresh consent and diff check
passed. After the user quit the desktop, `npm run test:desktop` rebuilt/staged and
passed Windows Electron checks, including SQLite continuity/relaunch and saved project
retention. The earlier native-module lock is resolved; no real project was changed.

## Coordinator-owned reference-policy continuation (2026-11-01)

**No new persisted format or migration:** SQLite **23**, execution **2**, definition
work **1**, stable-citation policy **1**, coordinator grants and portable formats are
unchanged. Continue specification's owned discovery service now passes an internal
protocol-recovery capability to staged review. It no longer depends on the unrelated
continuous/unbounded-refresh option to activate the existing compatible label-loop
upgrade. Source work is still replayed and validated first; its stable policy retains
the old blocker and the same stage/request-count boundary. Original saved jobs,
receipts, evidence, dates, attempt counts, plan keys and valid completed work remain
unchanged. No historical clarification or assessment is repeated solely for this fix.

Only the live owned workflow capability supplies this permission. Existing workflow
eight-request/five-minute budgets, request accounting, leases and CAS writes remain
authoritative. Reopen alone grants nothing. A fresh workflow burst cannot waive an
exhausted failed-step allowance or an explicit product-decision block. New stable
lookup blocks remain blocked, not eligible for repeated protocol recovery.

The change applies to both outdated-area and remaining-area definition dispatch via
their shared discovery service. Synthetic coordinator/reopen tests preserve old
receipts and successful loads, charge newly dispatched calls, and cover exhausted
attempts, human conflicts and repeated continuation without automatic retries.
See [coordinated workflow](coordinated-workflow.md#saved-reference-policy-recovery-through-continue-specification-2026-11-01).
Verification: 1,432 deterministic tests, type checking, UI build, all 18 default browser
runners and diff check passed. Desktop dependency staging/checks are blocked by an in-use SQLite
native module (`EPERM`); close the desktop and rerun the build/check before relaunch.
This is a staging lock, not a user-data migration failure; no real database was opened
for writing or model inference started by these checks.

## Stable assessment citations and evidence-lookup blockers (2026-10-31)

**Additive forward workflow upgrade:** SQLite stays **23**, execution **2** and
definition work **1**. Optional `stableCitationPolicy` format **1** pins a stage
plus prior supplemental/follow-up request counts. Old contexts, batches, input/plan
fingerprints, raw replies, resolved IDs, completed receipts and spent attempts replay
unchanged. This includes an upgrade in a stage that already accepted multiple loads.
Completed assessments and completed clarification work are not upgraded, invalidated,
rerun or reinterpreted; valid implementation reuse is unchanged.

New contexts use `S` labels derived from lexically sorted canonical record IDs in the
already-fingerprinted definition input closure. Packing, supplementation, draft
citations and stage splits cannot reassign an S label within that assessment input.
Only the current exact context/draft citation boundary is exposed: a stable ordinal
does not authorize an unread record or guessing another label. Legacy `E` labels
are rejected by new contexts, never assigned a new meaning. Old E-bearing prose stays
historical. New blockers are instructed to cite canonical IDs, not short aliases.

An old blocked work item can activate the policy on **explicit Refresh** only when
there is a structural label-drift witness: two accepted one-to-one resolutions in
the unfinished stage loaded distinct canonical records for the same exact E label
named in its blocker. The unchanged old receipts are replayed before this upgrade.
The new policy retains the original blocker as `supersededBlock`; validation checks
the witness against only pre-upgrade requests. It does not guess which record the
model intended, declare the relationship resolved, forgive a failed request, reset
attempts or increase allowances. Background preparation cannot clear this block.
An exhausted step still needs its existing one-request explicit recovery grant;
new-protocol blocks and unrelated human conflicts are not automatically cleared.

Optional `definitionBlock.kind` and work `blockedKind` distinguish `evidence-lookup`,
`product-decision` and `technical`. Old untyped blocks keep their old meaning unless
the structural witness proves ambiguous evidence navigation. Explicit product-decision
classification is not overridden by old history. Evidence issues appear separately
from product-decision counts and cannot launch automatic/manual question preparation
through the queue. No textual category shortcut establishes a product preference.

Both additions round-trip in SQLite job JSON and portable continuation. Unknown
policy formats/block kinds fail closed; downgrading to an app without these optional
fields is unsupported. There is no startup rewrite or model call. Interrupted
activation can be retried idempotently after replay; checkpoints retain attempts
before dispatch, accepted loads and the original dated work. The saved no-question
clarification remains an unchanged historical result, not proof that lookup was fixed.

Synthetic upgrade tests cover repeated reopen, exact same-stage request replay,
stable labels across later loads/stages/splits, legacy-label rejection, witness
corruption and non-witness blocks, recovery eligibility, portable adoption and
publication, typed-block persistence and future-kind rejection. Browser checks cover
separate technical display and zero-call refusal to prepare a product question.
No real project was changed and no live model calls were used.
Final verification: 1,429 deterministic tests, 18 default browser runners plus final
focused checks, type/UI/desktop builds, Windows Electron and diff checks passed;
see [definition coverage](definition-coverage.md) for exact scope and limitations.

## In-place refresh confirmation (2026-10-31)

No persistence change: SQLite **23**, execution **2**, saved definition-work policies,
attempts, recovery grants, fingerprints, receipts and portable formats are unchanged.
Only transient UI placement/focus and action wording change. Feature-specific prompts
appear beside their own Refresh button; whole-project prompts stay beside the global
action. Confirming dispatches the existing refresh API with the exact selected scope
and revision/area/job-bound grants. No implicit grant, allowance reset, automatic
startup call or reassessment of completed work is introduced. Cancel/close/reload do
not persist permission; server-side stale/foreign/replayed-grant rejection remains.

## Exact linked definition evidence (2026-10-31)

**Additive saved-work policy, no SQLite migration:** SQLite remains **23**, execution
**2**, and definition work **1**. Older definition work without `linkedEvidencePolicy`
replays using its original compact plan and contexts. Explicit continuation first
validates that history, then checkpoints a format-1 policy at the unfinished stage,
including counts of previously accepted supplemental requests/follow-ups. Those
counts keep original same-stage request hashes reproducible; earlier receipts,
batches, plan/input fingerprints, responses, resolved IDs and spent attempts are
not rewritten. Repeated activation is a no-op. Completed work is not upgraded or
reassessed. No implementation reuse/freshness semantics change.

The new request boundary permits exact saved targets of `sourceIDs`, `evidenceIDs`,
`sourceID`, `requirementID` and `questionID` on already detailed records, even when
compact current-decision planning omitted them. These edges are already covered
by the frozen definition input identity. Other links (including a backward
`supersedes` edge by itself), prose IDs, unrelated records and fuzzy matches do not
extend the plan. No graph-wide eager expansion is performed. Each added record must
be requested and saved under the existing 20-record, 96k-context, stage and attempt
bounds. Historical approvals stay original evidence, not renewed product approval.
Publication replays every successful load and permits only the frozen plan plus
those validated loaded records, not every eligible navigation target.

The optional policy is retained by SQLite job JSON and portable continuation without
rewriting old jobs. Unknown policy formats reject through strict work validation;
older app versions cannot read new-policy work, so downgrade is not supported.
Interruption retains checkpointed policy/evidence and charged attempts; startup
does not repeat model calls. Continue via ordinary definition refresh after updating;
exhausted failure allowances still require existing explicit recovery eligibility,
not a reset or automatic grant. A rejected model reply is not promoted to a saved
successful request by this upgrade.

Synthetic tests cover omitted historical confirmations, rejected targets, unread
citation rejection, unrelated/missing/oversized requests, immutable raw evidence,
mid-stage upgrades, original hashes/receipts, subdivisions, repeated reopen, failed
load continuation, portable adoption/publication and future-format rejection.
No real project writes or live model calls were used. Verification results are
recorded in [definition coverage](definition-coverage.md).

## Startup visibility and assessment-tool navigation (2026-10-31)

The header/accordion layout follow-up also has no persistence impact: native title-bar space
is reserved once, and progress/advanced inspectors share a fixed-size CSS chevron. Geometry
and keyboard/mobile display regressions do not change data, fingerprints or authorizations.

**No persisted migration:** source/target SQLite **23**, execution **2**, usage export **2**,
portable 1/2/3 and all saved review/request/assessment/provenance/receipt formats, identities,
freshness rules and CAS counters are unchanged. Optional startup observers report real upgrade
versus reopen validation stages; callback failure is ignored and cannot alter transaction
success/rollback, source evidence or worker ownership. No saved data is skipped or repaired to
make the splash advance. No startup requalification/model calls or reset are introduced.

Assessment experiments/recovery move from Overall progress to Settings' advanced tools;
empty catalog pages explain missing eligible provenance rather than invent source choices.
Old assessments and implementation reuse remain unchanged. Existing saved scopes, mixed tasks,
content reviews and apply receipts stay accessible with their original consent/source checks.
Navigation and transient display states are not persisted authorities. Browser preference,
API/IPC authentication and loopback ownership boundaries remain intact.

Verification: 1,418 deterministic tests, all 18 default browser runners, type checking/UI build,
full Windows Electron checks, the deliberate blocked-database startup/close/relaunch test and
diff check passed. The focused 26-test migration/desktop-worker rerun confirms that upgrade
display failures cannot interrupt migration and that current-format reopen reports validation,
not an invented upgrade. The older-assessment browser fixture preserves exact project/jobs/
execution with an empty mixed catalog; existing task/apply/recovery regressions remain passing.
No real user data was migrated for these checks, and no model calls or resets were made.

## Reviewed mixed-assessment publication (2026-10-31)

**SQLite 22 → 23**, `explicit-reviewed-mixed-publication-v1`, adds local
`definition_mixed_saved_reviews` (format-1 `definition-mixed-saved-review-v1`) and
`definition_mixed_publications` (format-1 `definition-mixed-publication-v1`). The first
retains exact supported/current source preview and content acknowledgement; the second binds
a separately confirmed assessment-only apply to one immutable idempotent receipt per review.
Saved reviews cap at 3 MiB, receipts at 16 KiB, history pages at ten bounded entries.

The ordered additive migration and ledger advancement are transactional. No old snapshot,
history, task/checkpoint, original origin/date, frozen request/assembly/context key, grant,
fingerprint or valid completed work is rewritten. No backfill/reset/requalification request
or backup is necessary. Unsupported/future/malformed records reject startup without overwrite;
upgrade advancement rolls back and retry after supported data restoration is safe. Live leases
are not claimed/recovered by upgrade. Older apps reject SQLite 23.

Published content uses the **existing** mixed-assessment format 1 and conditional portable
envelope 3. Portable 1/2/3, execution **2**, usage export **2**, original finding/scoped/mixed
policies and freshness semantics remain unchanged. Raw reviews/receipts/tasks remain local-only;
portable import does not manufacture local review/apply authority. Readonly qualification
inspection now recognizes SQLite 20/21/22/23 without startup migration or model calls.

Apply revalidates current snapshot/assessment and original source/root witnesses in one immediate
transaction. Assessment revision/history, the existing exact definition-only compatibility
certificate, receipt and activity commit or roll back together. Original implementation
evidence/sessions/dates/revisions remain; only the CAS version and assessment-only certificate
advance. Existing valid legacy/modern assessment/plan/delivery reuse stays valid; real changes
or already stale work do not become current. Completed receipt reuse writes nothing and does
not requalify sources/providers. Later edits retain dated receipts instead of republishing.
See [apply boundary, recovery and tests](definition-mixed-publication.md).

Verification: full `npm test` passed **1,416 tests** (712 + 704), type checking/UI build,
all **17 browser runners** and diff check passed. The final focused 16-test publication
rerun adds explicit plan/code/run/session/delivery preservation checks. A true older-22 table
layout upgrades without changing original snapshots, saved replies, execution evidence or
another owner's live lease; future saved-review data rolls 23 ledger advancement back without
overwrite and reopens after restoration. Atomic revision/activity/execution/receipt failures
roll back together, and browser lost acknowledgements recover through explicit reads without
write replay. No model calls or data reset are needed to reuse saved valid work.

## Mixed-review browser workflow (2026-10-31)

**No persisted migration.** Source/target SQLite **22**, execution **2**, usage export **2**,
portable 1/2/3 and all frozen ordinary/scoped/mixed origins, request/assembly/context identities,
run/result formats and optimistic revision counters remain unchanged. Catalog/status/preview
responses are transient views; no provider observation or browser metadata is backfilled.

Explicit browser controls now call the existing one-request task and separate read-only source,
preview, status and original-witness operations. Older completed tasks and valid saved replies
remain reusable/recoverable without requalification calls, resets or altered dates. Damaged or
missing newest evidence fails closed rather than substituting older checkpoints. Source pages
and original-witness reads remain bounded. Read actions do not claim workers, recover replies,
write receipts or authorize automatic continuation. Exact-owned Stop preserves other workers.

There is no new assessment publisher, saved-review/apply state or implementation fingerprint
change; existing implementation reuse and dated history remain intact. Original checkpoints
and spent attempts survive cancellation/late replies and failed atomic completion. Recovery
requires another explicitly confirmed start and retains the original saved response identity/date.
See [browser boundary and verification](definition-mixed-browser.md).

Verification: final full `npm test` passed **1,400 tests** (696 pretests + 704 main),
including dated status across reopen, original-source paging, malformed/missing/orphan newest
witnesses, exact queue ownership, token/origin/method/consent gates and unchanged old-result reuse.
Type checking, UI build, all **16 browser runners**, a final dedicated mixed browser rerun
and diff check passed. Completion-failure browser fixtures preserve the original reply/date
and recover with zero further adapter calls. No live inference or assessment apply was run.

## Mixed-consistency provider bridge (2026-10-31)

**No persisted format migration.** Source/target SQLite **22**, execution **2**, usage
export **2**, portable envelopes 1/2/3 and every original request/assembly/context/source/
response/result policy/key remain unchanged. The bridge reconstructs the existing canonical
selection identity for verification; it does not rewrite the frozen mixed evidence document,
instruction, manifest or saved tasks to add provider metadata.

New explicit requests can use exact selected OpenCode/direct routing with dedicated JSON-text
prompts, no research/tools, actual-model observation checks and the existing direct
`scoped-no-tools-v1` complete-output inventory profile. Ordinary discovery/help/probe transport
and credential/refresh ownership are unchanged. No default browser/CLI/coordinator dispatcher
or publisher is installed merely by constructing the bridge.

Older completed injected-pilot tasks and valid saved replies reuse/recover with unchanged
original IDs/dates, without another provider call, credential read, reset or metadata backfill.
Missing old provider observations stay unknown; new bridge availability does not authenticate
older evidence, confer live-profile qualification or upgrade publication/skip authority.
Unsupported/malformed contexts fail before new provider work rather than downgrading profiles.
See [routing, compatibility and qualification limits](definition-mixed-providers.md).

Verification: full `npm test` passed 1,395 tests (691 pretests + 704 main), including
old saved-reply recovery/completed reuse across reopen without new inference or metadata.
The final focused mixed/scope adapter, mixed task and native-client rerun passed 62 tests;
type checking, UI build, all 15 browser runners and `git diff --check` passed. No live mixed
provider call or permission-enforcement qualification was performed for this change.

## Durable mixed-consistency pilot (2026-10-30)

**SQLite 21 → 22**, `explicit-mixed-review-pilot-v1`, adds local `definition_mixed_reviews`
and job/marker `definition-mixed-review` / `definition-mixed-review-v1`. Run format 1,
`definition-mixed-run-v1`, records exact canonical source selections, original request/
assembly/context identities, explicit one-request consent/reservation, validated reply/date,
root recovery reference and atomic completion result. Authority is review-evidence-only;
publication/request/skip flags stay false. No default provider/coordinator/browser dispatcher
or publisher is registered by the migration.

No old row/history, ordinary/scoped/mixed-reader metadata, frozen fingerprint, concurrency
counter, grant, source finding or execution evidence is rewritten. No backup/backfill or
replacement inference is needed because old payloads are unchanged. Existing reader schemas,
execution **2**, usage export **2** and conditional portable formats 1/2/3 remain. Raw mixed
jobs/checkpoints are excluded from portable authority; generic discovery/resume/baseline
paths cannot consume them. The saved v1 mixed builder/document/instruction must stay
reproducible across future compatible upgrades, not silently invalidate completed work.

Startup validates bounded run/job/marker identities and orphan checkpoints without full
source-history replay, worker claims or model calls. Transactional failure rolls back ledger/
schema advancement and new table/index creation where applicable, preserving original data
for supported repair/retry. Future/oversized/missing or changed source/root witnesses fail
closed on explicit operations; no older source/checkpoint substitution or automatic paid retry.
Qualified readonly inspection of older scoped experiments supports SQLite 20/21/22 without
upgrading the older files or reacquiring provider evidence.

Explicit completion commits result/job atomically. Saved valid replies survive completion
failure and can recover under a new local task with the original request identity/date and
zero adapter invocations. Original spent attempts and other workers' live leases are retained.
No recovery manufactures missing provider, publication or human approval evidence.
See [task, bounds, recovery and remaining gates](definition-mixed-execution.md).

Verification: type check, **1,374** deterministic tests (670 + 704), UI build, fifteen
browser runners and diff check passed. Upgrade fixtures preserve original projects/revisions,
ordinary/scoped evidence and other owners' live leases; completed mixed tasks reopen/reuse
without another request. Unsupported future mixed checkpoints roll 22 ledger/schema advancement
back without overwrite and can retry after restoration. Completion-trigger failure rolls
result/job changes back while preserving the earlier reply for zero-call recovery. Older
SQLite-20 live scope reports/row digests were reproduced readonly without migration or calls.
No live inference, publication or automatic skip was introduced by this migration.

## Mixed-source assessment reader boundary (2026-10-30)

**SQLite 20 → 21**, `mixed-assessment-provenance-format-v1`, recognizes optional
`assessment.mixedReview` format 1 (`definition-mixed-assessment-v1`). It retains exact ordinary
and scoped observation origins, complete scoped concern/result packets and a bound nine-finding
assembly/consistency declaration. Authority remains provenance-only; models cannot issue it
and no new publisher/task dispatcher is registered. Aggregate confidence is conservatively low.

This is a reader boundary, not conversion: no old project/history, semantic key, receipt,
scope request/result/origin, concurrency counter, grant, execution evidence or live lease is
rewritten. Existing unmarked/combined reviews retain their previous freshness and export
formats. Only new mixed markers use the separate conservative complete-project guard; frozen
v1 input/ordinary/scoped identities remain unchanged. Schema-only extraction preserves old
field shapes/order/limits and a pinned pre-extraction synthetic scope/context digest.

Startup validates current marked projects within 16 MiB; historical data validates on explicit
read/adoption. Unsupported future/corrupt/oversized markers reject without overwrite and roll
back schema/ledger advancement. No backup is needed because old payloads are not modified.
Retry after supported data is restored leaves valid completed work and other workers intact.

Portable `state.json` writes **format 3 conditionally** for current or referenced historical
mixed provenance. Normal format 1 and combined-only format 2 output remain unchanged. New
readers accept 1/2/3, reject mixed declarations hidden in 1/2 and reject future formats;
older readers reject 3 before dropping origins. Execution schema stays **2**, usage export
**2**, continuation/workspace envelopes unchanged. Raw scope jobs/sessions/credentials are
not exported; bounded source observations nested in mixed metadata carry no task authority.

Readonly qualification inspection supports both original SQLite 20 and new 21 without startup
migration or reacquisition calls. No source format is backfilled merely to expose the new
reader. Actual mixed source verification, durable consistency and atomic preview/apply remain
separate upgrade/authorization work. See [format and remaining gates](definition-mixed-assessment.md).

Verification: type check, **1,359** deterministic tests (655 + 704), UI build, fifteen
browser runners, focused reader/upgrade/consistency cases, offline preflight and diff check
passed. Tests preserve old raw rows/completed scoped work/live leases through repeated
20→21 startup, and future marked data rolls schema/ledger advancement back without overwrite
before successful repair/retry. Current and historical-only format-3 round trips, real folder
adoption and older-envelope rejection preserve original provenance without local task records.
Readonly inspection of all three original SQLite-20 live observations reproduced exact reports/
row digests without migration or calls. No live request was made for this reader boundary.

## Scoped finding provenance foundation (2026-10-30)

**No persisted format migration.** SQLite **20**, execution **2**, usage export **2**,
portable formats, checkpoint/job/project payloads and frozen semantic keys remain unchanged.
New `definition-scoped-finding-origin-v1` / `definition-scope-provenance-v1` format-1 packets
are transient readonly projections, not accepted assessment markers or portable authority.
Scoped observations remain distinct from ordinary v1 publication origins; no certificate,
assessment revision, publication date, confidence or human approval is fabricated.

An exact-job in-process inspection verifies bounded original/completed jobs, checkpoints,
original revision snapshots and root response witnesses within a deferred read transaction.
Recovered findings keep original response dates/request IDs and separate later completion
identities. Missing older optional job times use the existing durable run completion date,
without backfill; conflicting present times reject. Changed/oversized/future/missing witnesses
return unavailable, never an older substitute, lease claim, repair or new model request.

Existing completed/recovered scope work gains inspection without reset, revised freshness,
source mutation or calls to acquire new metadata. Ordinary/combined origins are unchanged;
no source packet is silently converted to a stricter or higher-authority policy. Later
persisted mixed/scoped assessment publication requires its own forward reader/SQLite/portable
boundary, complete assembly/consistency policy, consent and upgrade tests. See
[implemented foundation versus remaining publisher](definition-scope-provenance.md).

Verification: **1,350** deterministic tests (646 + 704), type check, UI build, all fourteen
browser runners and diff check passed. New fixtures preserve older completed/recovered v1
packets and optional missing lifecycle metadata across reopen and repeated inspection,
without backfill or replacement calls; damaged/future/oversized and missing/live root
witnesses reject without mutation. Three saved live observations also projected unchanged
original results/dates and saved-row digests. Two new live scenario calls were made for
qualification, not migration/reacquisition. No app schema/version/freshness change occurred.

## Scoped-review qualification harness (2026-10-30)

**No application migration.** SQLite **20**, execution **2**, usage export **2**, portable
formats and existing scope/context/response identities remain unchanged. Existing completed
work requires no reset, backfill or requalification call. This optional tool only creates a
new synthetic project database in a newly reserved local directory, never a personal database.

New standalone artifact: absent → `qualification.json` **format 1**, policy
`definition-scope-qualification-v1`, binding case, OpenCode route, exact provider/model,
original request and creation date. Printed report policy is `definition-scope-qualification-report-v1`.
Neither artifact has publication/skip/implementation authority or enters portable state.
Inspection bounds manifest/status/original-snapshot reads, rejects unknown future formats
and changed case/model witnesses, and uses readonly SQLite with no startup migration.

Exclusive directory creation precedes provider construction. Crash/partial setup retains
the directory and any completed manifest/checkpoint; repeating the live command fails
before provider construction, even if no reply was saved. Explicit inspection never claims
leases, retries inference, recovers replies or repairs missing provenance. Partial/future
artifacts stay intact for supported/manual inspection rather than being overwritten.
There is no older harness format to migrate. Future compatible harness changes must preserve
existing manifests and original evidence rather than require replacement calls.
See [commands, recovery and qualification limits](definition-scope-qualification.md).

Verification: type check, **1,344** deterministic tests (640 + 704), offline preflight,
CLI argument/help checks, UI build and diff check passed. New artifact tests preserve
results across reopen/repeated readonly inspection; partial runs cannot be replayed,
future/oversized manifests and database formats stay untouched, and changed original
case/model witnesses reject. No live inference or browser rerun; application formats and
existing saved work are unchanged.

Subsequent live observation: one new synthetic retention-choice run completed and repeated
readonly inspection preserved original dates/results and saved rows without additional
adapter calls. No format, schema, fingerprint or authority changed; nothing was backfilled
or made current by the check. See [dated evidence and remaining gates](definition-scope-live-check.md).

## Scoped-review browser exposure (2026-10-30)

**No persisted format migration.** Source/target SQLite **20**, execution **2**, usage
export **2** and portable envelopes are unchanged. New format-1 status/start transport
contracts are not saved into project/job/checkpoint payloads. Browser ownership comes from
the local queue and is never durable evidence. Admission/response/publication semantics,
scope/context fingerprints and original completed work remain unchanged.

Existing completed results and valid saved replies reuse with their original dates/IDs,
without backfill, history rewriting, reset or model requalification. Explicit readonly
inspection projects bounded dated records without history replay or lease claims; damaged
evidence fails unavailable, never upgrades authority or substitutes older evidence.
Reload/uncertain acknowledgements use explicit status inspection, not automatic write replay;
only the exact app-owned worker can be stopped. The existing durable pilot handles failed
completion and zero-call saved-reply recovery. See [browser/pilot behavior](definition-scope-pilot.md#browser-authorization-and-readonly-status).

Verification: **1,334** deterministic tests (630 + 704), type check, UI build, all
fourteen browser runners, focused scoped browser checks and diff check passed. Tests
preserve completed/recovered output and dates across reopen/restart, reject foreign Stop,
leave expired workers unchanged, and return unavailable for damaged/oversized/future or
inconsistent newest checkpoints without falling back or replaying original history.
No live calls, commits or pushes; effective provider/tool behavior and larger-project
status/preparation performance remain unqualified.

## Scoped-review provider bridge (2026-10-30)

**No persisted migration or schema bump:** SQLite 20, execution schema 2, usage export 2,
portable envelopes and every original scope/context/response key remain unchanged.
The provider bridge factors out the exact prior v1 job manifest and passes authoritative
project state to explicitly injected adapters. It does not rewrite old jobs, results,
grants, plans, certificates or history, and does not repeat completed work or saved replies
to add equivalent routing metadata. Older injected-pilot evidence retains its original
validated-output-only authority, never a fabricated live-provider/tool witness.

New scope requests can use existing selected-account/provider routing with strict model
identity, exact scope prompts, no research/tools, and a scoped-only direct stream profile.
Direct profile `scoped-no-tools-v1` requests no tools and rejects observed tool events,
unsupported/missing inventories and final-text mismatches. Ordinary direct request/parser
behavior is unchanged. Unknown profile parameters fail without weaker-profile/provider
fallback. No API/CLI/browser/coordinator start path or assessment publication is added.
Future persistent provider qualifications must have their own compatibility decision;
do not infer them from successful transport or retroactively invalidate valid saved work.
See [routing, checks and qualification limits](definition-scope-providers.md).

Verification: type check, **1,329** deterministic tests (625 pretests + 704 main),
focused provider/scope/pinned-client checks, UI build, all thirteen default browser runs
and diff check passed. Tests preserve older injected-pilot results/jobs without bridge
invocations or upgraded authority, while ordinary direct requests retain prior behavior.
Profile/routing/stream checks use synthetic credentials and mocked transports, not live
provider enforcement. No live calls, commits or pushes; existing bundle warning remains.

## Explicit scoped-review execution pilot (2026-10-30)

**SQLite 19 → 20**, `explicit-scoped-review-pilot-v1`, adds local `definition_scope_reviews`
and the specialized job kind/context marker `definition-scope-review`/`definitionScopeReview`.
Run format 1 (`definition-scope-run-v1`) binds strict explicit one-request authorization,
original revision/snapshot/scope/context/model witnesses, reservation, validated reply/date,
and output-only completion or original root-job recovery link. Checkpoints cap at 192 KiB;
original revision reads remain bounded. No scheduler, default provider, browser/CLI start
route or publisher is added; execution requires an explicitly constructed injected adapter.

This is additive: no old job/project/assessment/plan/check/run/receipt/grant is rewritten,
no semantic key/revision is rebased and no completed work repeated to acquire metadata.
Execution schema 2, portable formats and usage-report format 2 are unchanged. New pilot
jobs/results are excluded from continuation; imports reject markers masquerading as generic
discovery. Old SQLite-19 apps refuse database 20 before silently consuming the new job kind.
No backup is needed for the no-rewrite schema addition. Migration/startup verification is
transactional/retryable and preserves other workers' live leases. Future run/marker formats,
identity mismatches and orphan checkpoints/jobs reject without overwrite or schema advancement.

Completed exact tasks reuse unchanged; saved replies recover only under explicit action,
retaining the original observation date/spent request and linking the original root.
Original context/model/snapshot witnesses are re-verified; missing/changed witnesses never
fall back to another paid request. The v1 scope builder/document/instructions must remain
reproducible; future equivalent changes need compatibility handling, not repeated inference.
Completion commits result/job atomically and never publishes an assessment or changes
implementation evidence. See [scope, recovery and remaining gates](definition-scope-pilot.md).

Verification: type check, **1,309** deterministic tests (605 pretests + 704 main),
focused scope/joint/migration/portable checks, UI build, all thirteen default browser runs
and diff check passed. Actual upgrade fixtures preserve old rows/live leases, roll back
failed table/ledger creation, reject future checkpoints without overwrite and retry safely.
Completed results and saved replies survive reopen without another adapter invocation;
generic/portable paths cannot publish or resume them. Existing browser workflows remain
qualified by deterministic checks, not a new scoped provider/UI. No live calls, commits
or pushes; existing bundle-size warning and live/semantic/performance gaps remain.

## Local review-scope contract prototype (2026-10-30)

**No persisted change/migration:** SQLite remains 19, execution 2, portable envelopes and
all saved semantic keys unchanged. `definition-review-scope-v1` is an in-memory task-binding
prototype, not a job field, original-finding certificate or new authorization. It assigns
outputs but retains all free-form project evidence and the existing conservative guard.
No adapter, queue, API, browser or scheduler dispatches this contract; no old assessment/
job/plan/receipt is converted, invalidated or replayed to acquire it. The new result cannot
authorize publication, skips or requests. Any future persistence/dispatch needs a separate
compatibility decision; do not backfill original scope witnesses from today's inputs.

The combined evidence-document helper is extracted without changing the canonical v1
document/hash; a direct comparison with the old projection and existing upgrade/reuse
tests cover equivalence. Existing saved work needs no reset, migration or model call.
New local contracts reject omitted/masked/rehash-forged packets and stale equal-numbered
views, limit outputs/citations, and retain uncertainty for reported cross-dimension concerns.
Archived required populations and oversized envelopes conservatively remain unavailable,
not a new restriction on opening/using existing app data. See [scope and remaining gates](definition-review-scope.md).

Verification: type check, **1,296** deterministic tests (592 pretests + 704 main),
focused scope/dependency/partition checks, offline experiment regression, UI build,
all thirteen default browser runs and diff check passed. Browser checks protect existing
workflows/guard compatibility; there is no new scope dispatch to qualify there. No live
model calls, commits or pushes; bundle-size warning and live/semantic/narrowing gates remain.

## Offline narrower-boundary experiments (2026-10-30)

**No persisted change/migration.** The new authored-fixture evaluation/report has its own
format 1 and `offline-experiment-only` authority, distinct from usage export format 2.
SQLite remains 19, execution schema 2, portable envelopes, v1 input/recovery/whole-area
keys and combined project-evidence guard unchanged. No historical evidence is restamped,
backfilled, replayed or invalidated. No scheduler/API/UI consumes experiment outcomes as
authority; reports cannot authorize skips or publication. Existing completed work and
original provenance remain intact without repeated inference or reset.

Snapshots are bounded and exact-schema/origin/finding identity is checked before comparison;
invalid/missing/ambiguous/future evidence is unavailable, not a passing equality. Empty or
partly unavailable non-refuted runs are inconclusive. The script reads only synthetic
in-memory fixtures, writes no application state and performs no model/network work. See
[candidate definitions, observed counterexamples and remaining gates](definition-partition-experiments.md).

Verification: type check, **1,278** deterministic tests (574 pretests + 704 main),
focused partition/dependency tests, standalone offline experiment and diff check passed.
No UI/runtime paths changed; browser/packaging/live model checks were not rerun for this
offline slice. No calls, commits or pushes. Passing controls remain finite-corpus evidence,
not semantic qualification, performance benchmarks or request savings.

## Review and publication usage report (2026-10-30)

**Ephemeral export/API format 1 → 2 only.** The usage report adds an independent bounded
window for local reviewed combinations and validated dated publication receipts. Existing
task measurement fields retain their meanings; new counts do not claim requests/money
saved, current compatibility, product approvals or lifetime totals. Invalid/missing evidence
is distinguished from zero and no older substitute is selected. Both windows share a
consistent read transaction; only whitelist metadata/local labels cross the API/export.

SQLite remains **19**, execution schema **2**, portable envelopes/semantic keys unchanged.
No old project/job/review/receipt/certificate/metric payload, grant, concurrency counter,
completed work or historical report is rewritten. Old downloaded format-1 files remain
historical artifacts; there is no report import/migration. Current clients expect report
format 2, and external consumers must recognize it. Upgrade does not repeat inference or
require data resets. Bounded readers preserve malformed/future/oversized evidence as
unavailable without writing it. See [report boundaries](definition-joint-usage.md).

Verification: type check, **1,265** deterministic tests (561 pretests + 704 main),
focused usage/privacy/bounds checks, UI build, all thirteen default browser runs and
diff check passed. Tests distinguish review/publication, repeated saves/applies, dated
receipts after edits, cross-project/area filtering, independent windows, unavailable/
oversized/wrong-review receipts and non-substitution of older rows. No live model calls,
commits or pushes; existing bundle-size warning and live/performance/savings gaps remain.

## Apply response recovery and request binding (2026-10-30)

**No new migration or persisted format:** SQLite 19, execution schema 2 and existing
portable versions remain unchanged. Browser response validation now checks the existing
strict receipt/hash against every request identity, including the submitted apply key on
writes, rather than accepting project/review IDs alone. No saved receipt/certificate,
freshness key, revision, history or completed work is rewritten or invalidated. Valid old
receipts use the same format; mismatched transport packets fail closed with explicit
eligibility inspection, not automatic inference/retry or manufactured publication authority.

Deterministic transport tests cover failure before commit, lost response after commit,
new unchecked consent before explicit retry, receipt-only recovery/reload without write
replay, internally valid wrong-request receipts and an actual post-confirmation concurrent
product edit. Actual restoration→apply→restoration tests preserve code evidence; a later
product edit and restoration cannot bridge the broken interval. These checks add no
request permission and do not qualify arbitrary crashes/networks or narrower independence.

Verification: type check, all **1,262** deterministic tests (558 pretests + 704 main),
focused recovery tests, UI build, all **thirteen** default browser runs (including the
new transport-recovery and confirmation-race variants) and diff check passed. No live
model calls, commits or pushes. Existing bundle-size warning remains.

## Explicit reviewed definition apply (2026-10-30)

**SQLite 18 → 19**, `explicit-reviewed-definition-publication-v1`: no old payload rewrite,
backfill, new table, inference or execution schema bump. Existing reviews/jobs, counters,
plans/checks, workers and evidence remain unchanged on upgrade. Explicit apply atomically
writes an assessment revision, optional execution-schema-2 `definitionRevision` and a
bounded Activity publication receipt. Prior local reviews retain `canPublish: false` and
never grant apply consent. Confidence is low and findings retain original provenance.

Policy `definition-assessment-only-v1` uses the frozen implementation recovery-input key
and a contiguous interval, extending only current recovery/publication evidence. Original
plan/run/check revisions survive; product edits, older stale work and other freshness gates
cannot be bypassed. Schema versions remain separate from optimistic-concurrency counters.
Portable state format 2 is additionally required for this certificate; adoption validates
supported/current metadata under local rerouting without exporting native sessions or full
Activity archives. Unmarked exports otherwise stay format 1.

Receipts use `definition-combination-publication-v1`, Activity IDs
`combination-publication:<review UUID>`, a 16 KiB read ceiling and no further-work authority.
Identical requests reuse only against the exact published snapshot; later edits retain a
dated receipt but reject reapply. Startup validates receipts/certificates. Future formats
reject without overwrite; failed startup rolls back schema/ledger advancement and allows
retry. No backup/reassessment is needed for equivalent old payloads. See the
[apply contract and qualification limits](combined-assessment-format.md#explicit-current-assessment-apply-sqlite-18--19).

Verification: type check, all **1,260** deterministic tests (556 pretests + 704 main),
focused apply/recovery/portable/migration checks, UI build, all eleven default browser
runners and diff check passed. Checks include actual low-confidence browser apply, exact
receipt reuse, duplicate API requests, stale/forged witnesses, injected receipt-write
rollback, saved plan/code/paused-run/stage-attempt preservation, real folder adoption,
certificate-only format protection and 18→19 future-format failure/retry without overwrite.
No live calls, commits or pushes occurred. Narrower automatic skips, broad savings/live
semantic quality and large-project performance remain unqualified; bundle-size warning remains.

## Combined assessment provenance format (2026-10-30)

**Implemented compatibility boundary, no payload conversion:** SQLite **17 → 18**,
`combined-assessment-provenance-format-v1`, supports an optional strict app-owned
`assessment.combinedReview` packet and conditional portable `state.json` format 2.
No production publisher/API or automatic skip activation is added. No old table/row,
project revision, v1 key, saved receipt/plan/checkpoint, grant, local review, execution
schema 2 or credential/routing state is rewritten/backfilled. Older apps reject database
18 rather than silently dropping new provenance; no backup is needed for this no-rewrite
boundary. Existing work does not repeat inference solely to gain the representation.

Marked assessments bind nine exact original finding packets, dates/jobs/evidence keys,
wrapper and reviewed-content/joint references, and an additional conservative project-wide
evidence guard. The v1 inputBasis algorithm stays frozen. Only marked data uses the new
broader guard in coverage/retention; unmarked saved reviews retain previous behavior.
Model assessment output cannot issue the marker. The browser distinguishes original
finding dates from wrapper revision; imported shape/content hashes are not authentication,
publication/readiness authority or narrower independence.

Origin hashing/schema extraction is byte-compatible with the original canonical Node
SHA-256 packet. Current marked projects are bounded and validated at startup, historical
marked evidence on read/adoption; no whole-history backfill occurs. Unsupported future
formats/identity mismatches reject without overwriting evidence. Failed startup rolls
back the ledger/schema advancement; reopen supports retry while retaining old rows and
other workers' live leases.

Portable state format **1 remains byte-compatible for unmarked current/history data**.
Format **2 is emitted only when provenance occurs in current or retained historical
assessments**, protecting both from old format-1 readers. The new reader accepts legacy
1 and new 2, rejects downlevel envelopes carrying the new field, and preserves supported
metadata/semantic keys under new local account routing. Unsupported future shared data
does not overwrite local state or the folder. Manifest/layout, execution and continuation
envelope versions stay unchanged; local acknowledgement records/native sessions are not
invented or exported as authority. See [format, guard and qualification limits](combined-assessment-format.md).

Verification: type check, all **1,253** deterministic tests (549 pretests + 704 main),
focused provenance/portable/migration/retention checks, focused reader browser, full
eleven-runner default browser aggregate/UI build and diff check passed. Actual folder
adoption/checkpoint uses a new local account without calls; future data rejection retains
both local state and shared bytes. Raw 17→18/reopen fixtures preserve original rows,
local acknowledgements and live workers. The reader browser is a curated format fixture,
not publication qualification. Existing bundle-size warning remains. No live model calls,
commits/pushes or packaging occurred; atomic apply, implementation-reuse preservation,
narrower partitions and live/performance qualification remain unfinished.

## Saved local combination reviews (2026-10-30)

**Implemented forward migration:** SQLite **16 → 17**, named
`saved-definition-combination-reviews-v1`, adds `definition_combination_reviews`, an
area index and unique project/preview identity. Format-1 local review records retain the
complete exact preview, original finding identities/dates, joint/root response provenance
and a separate explicit content-review acknowledgement/save date. They always retain
`canPublish: false`; they are not published current assessments or product approvals.

This additive migration rewrites no old row and needs no payload backup. Project/job/
assessment/certificate/joint-run/result/portable formats, semantic/freshness keys,
optimistic project revisions, execution schema 2, approved plans, grants and preferences
are unchanged. Upgrade starts no model call or backfill. Existing completed checks and
older valid work remain reusable without repeats solely to gain a local review record.
Older apps reject database 17; source/target versions remain separate from concurrency.

Save requires separate explicit acknowledgement and re-verifies the expected revision,
full content/preview tokens and exact original joint/source witnesses within one
immediate transaction, with live worker guards. Record and one local Activity event
commit atomically; duplicate retries return the first immutable record/date. Failure
rolls both back and permits explicit retry without inference. Reads remain dated local
evidence, even after later edits or missing optional witnesses; no source is made current.
The table is machine-local and never exported/adopted as portable approval or skip authority.

Startup strictly validates future formats, record/packet hashes, original identity
consistency, row identity and 132 KiB bounds without overwriting incompatible evidence.
Migration table/index/ledger/version advancement rolls back on validation failure;
reopening supports retry without reset or regeneration. Tests preserve raw old rows,
completed provenance and live discovery/execution leases across 16→17 and repeated
startup, and cover transaction rollback/retry, future/tampered records, stale/concurrent
saves, project/area isolation, bounded history, portable equivalence and no additional
model calls/assessment changes. See [scope and recovery](definition-combination-reviews.md).

Verification: type check, all **1,246** deterministic tests (542 pretests + 704 main),
focused joint/save/migration/Activity checks, focused combination browser, storage-order
upgrade browser, full ten-runner default browser aggregate/UI build and diff check passed.
The save/history browser uses an adapter that rejects every new model call. Upgrade
tests preserve raw rows and live discovery/execution leases, and verify failed-startup
rollback/retry plus unsupported future records without overwrite. Existing bundle-size
warning remains. No live model calls, commits/pushes or packaging were performed; actual
current-assessment mixed publication, portability of these local records, narrower
independence and live/performance qualification remain unfinished.

## Exact combined finding preview (2026-10-30)

**Transient read-only addition; no persisted conversion.** SQLite remains **16**,
execution stays schema 2, and all project/assessment/certificate/joint run/result/job/
portable payload formats, semantic keys, grants, receipts and optimistic counters are
unchanged. Format-1 `definition-combination-preview-v1` packets are in-memory contents,
not a newly saved assessment or publication authority. No startup projection/backfill,
stored preview, original-date rebasing or model call is introduced.

An exact completed supported joint check, its original reserved response owner and all
source publications/guards are re-verified in one bounded read transaction. Original
findings/dates remain exact and distinct; current saved content is compared separately.
Duplicate current identities are rejected; missing current findings stay missing. The
preview key binds current content, source/joint identities and response evidence, not
permission to write. Any future mixed save must re-verify under its own explicit
authorization and versioned forward-compatible representation.

Missing, stale, changed, conflicted, incomplete, unsupported or oversized sources produce
no successful preview or implicit paid retry. Existing valid reviews remain valid under
their old rules, including older work without optional provenance. Tests preserve raw
projects/revisions/jobs/certificates/checkpoints through repeated reopen/preview and
exercise exact original dates, zero-request recovery roots, tampered job/context/result
identities, same-revision replacement, ambiguity, missing current assessments, bounds
and strict/no-inference API/browser reads. See [scope and limits](definition-combination-preview.md).

Verification: type check, all **1,239** deterministic tests (535 pretests + 704 main),
focused joint/preview tests, focused combination browser, the full ten-runner default
browser aggregate/UI build and diff check passed. Tests retain raw older projects,
history, jobs, publications and joint checkpoints across repeated reopen/preview.
The existing bundle-size warning remains. No live model calls, commits/pushes or
packaging were performed; live quality/permission/cancellation, large-project replay,
safe narrower partitions and atomic mixed publication remain unqualified/unfinished.

## Joint-check usage measurements (2026-10-30)

**No persisted conversion:** SQLite remains **16**, execution stays schema 2, and new
joint tasks use the already-supported optional format-1 `job.discoveryMetrics` payload.
Project/assessment/certificate/joint run/result/portable formats, semantic keys,
optimistic counters, saved receipts and grants are unchanged. Older completed tasks
without measurements stay valid, byte-identical and reusable without backfill or calls.
An explicit completed-reuse action does not reset measurements or create another job.

Measurement starts after claim and checkpoints an adapter attempt immediately before
dispatch. It is not provider acceptance/billing or a successful-review receipt. Returned
responses are categorized before validation; cancelled/late replies cannot become
successful verdicts or late measurement writes. Recovery tasks measure zero new requests
separately from the original root; pre-measurement failure and older missing measurements
remain unknown, never manufactured zero. The classifier now recognizes a returned joint
contract as analysis within the unchanged existing response-category enum.

New transient action disposition distinguishes a new attempt, completed reuse and saved-
reply recovery. It is not persisted as a new historical receipt/counter. The separate
metadata-only usage report returns at most 20 saved tasks, distinguishes partial/unknown
data and anonymizes recovery links. SQL caps metrics at 32 KiB before parsing; future,
malformed and oversized metrics stay unavailable. Inspection/export causes no state
changes or inference; old work never repeats merely to populate diagnostics. Tests
cover old saved-data reopen/reuse preservation, missing/future/partial metadata,
zero-request recovery, pre-claim failure, request/validity separation, bounds and privacy.
See [usage semantics and limits](definition-joint-usage.md).

Verification: type check, all **1,230** deterministic tests (526 pretests + 704 main),
focused joint/diagnostics/log tests, focused joint browser, full nine-runner default
browser aggregate/UI build and diff check passed. Browser export checks verify privacy
and no extra model calls; older-data tests preserve raw jobs and original checkpoints
across repeated reopen/reuse. The existing bundle-size warning remains. No live model
calls, commits/pushes or packaging were performed; broad savings/performance and live
semantic/provider qualification remain unfinished.

## Explicit browser joint finding checks (2026-10-30)

**Workflow/API projection only; no persisted conversion.** Source/target SQLite stays
**16**, execution stays schema 2, and existing `definition-joint-review-v1`, run/result,
assessment, project, certificate, portable and job formats/keys are unchanged. The
format-1 `definition-joint-view-v1` response is transient dated evidence, not a current
publication certificate. Old joint checkpoints display without backfill, revised dates,
reset attempts or repeated model calls. Expired live statuses are projected interrupted
without rewriting the worker row or claiming its lease.

The browser requires separate exact-combination consent for at most one request. The
ordinary app queue owns cancellation/close; coordinator-owned queues reject the action.
New work holds automatic saved-response processing but does not rewrite preferences or
shared grants, continue saved input, change assessments or trigger follow-up discovery.
Completed equivalent checks return unchanged; explicit recovery of saved valid replies
keeps original source jobs/dates and consumes no new request. Unproved original witnesses
block rather than silently retry. If no valid reply exists, another confirmed action can
spend a fresh one-request attempt while preserving prior spending. Restart, status reads,
reload and failed transport/status requests never authorize replay.

Status/Stop are project/task scoped; exact Stop only cancels this app's matching active
joint worker. Views are dated by revision/full-content changes, and continuing a saved
combination needs a separate selection plus consent. New source selection never silently
becomes saved-task consent. Log labels/queue status are derived only, and joint completion
does not replace the ordinary previous-coverage baseline. Portable exclusions and ordinary
discovery-resume/publication safeguards remain. See [browser behavior](definition-joint-review.md#browser-consent-and-saved-results).

Verification: type check, all **1,226** deterministic tests (522 pretests + 704 main),
focused joint/API/log tests, the focused joint browser, full nine-runner default browser
aggregate/UI build, workflow browser and diff check passed. Tests include old saved
checkpoint reopening with unchanged dates, zero-request returned-response recovery,
missing original witnesses blocking paid retry, exact task isolation, stop/reload and
unchanged assessments/grants/previous-coverage baseline. Existing bundle-size warning
remains; no live inference, commits/pushes or desktop packaging were performed. Provider
permission/cancellation enforcement, live semantic quality and large-project replay
cost remain unqualified.

## Browser inspection of original finding sources (2026-10-30)

**Read-only UI/API addition; no persisted conversion.** Source/target SQLite remains
**16**, execution remains schema 2, and all project/job/assessment/certificate/portable
formats, semantic/freshness keys and optimistic counters are unchanged. The new
format-1 `definition-source-inspection-v1` response is transient metadata, not saved
assessment authority. No new table, startup backfill, origin rebasing or model call is
required. Existing uncertified/portable reviews remain valid under their old rules;
missing provenance never forces repeat inference.

Explicit bounded source pages re-verify at most six local certificates in one read
transaction. Existing source-reader bounds apply; future/oversized/missing evidence
stays unavailable without overwriting it. Explicit per-dimension comparisons reuse
the existing guarded original-provenance preview. APIs run before generic project
history projection and make no writes. Revision/full-content tokens detect stale and
equal-revision replacement. Selection, polling, reload and failures never repeat reads
or consume model allowance automatically. The browser keeps only one page and clears
selection on page changes; there is no new persisted browser setting or continuation.

Tests cover preservation/repeated reopening with legacy missing certificates, missing
witnesses, malformed/future/oversized sources, bounded pagination, strict API guards,
partial/mixed selection, stale/concurrent changes and no inference or assessment writes.
See [browser behavior and limits](definition-finding-origins.md#browser-inspection).

Verification: type check, all **1,222** deterministic tests (518 pretests + 704 main),
the focused source-inspection browser, the full eight-runner default browser aggregate
(including UI build), and diff check passed. The aggregate's old nine-section assertion
was updated for the added inspector and now checks its collapsed/no-read controls.
Existing bundle-size warning remains. No live inference, commits/pushes or desktop
packaging were performed; large-project source-replay performance remains unqualified.

## Joint definition consistency review (2026-10-30)

**Implemented forward migration:** SQLite **15 → 16**, named
`definition-joint-review-runs-v1`, adds local `definition_joint_reviews` checkpoints,
the `definition-joint-review` job kind and format-1 context/run/result contracts.
Existing project/assessment/portable/context keys, execution schema 2, optimistic
revisions, approvals, plans, receipts and grants are unchanged. No source row is rewritten,
so the additive table needs no payload backup. Older apps reject SQLite 16 instead of
stripping specialized task evidence. Existing jobs and live leases remain intact.

Only an explicit service action can prepare one bounded joint review. All nine selected
sources must still re-verify and match their whole-area guards. Exact current evidence
and original findings are supplied together; oversized/incomplete candidates fall back
before a job or inference is created. A dedicated adapter prompt/schema rejects altered
origin keys, stale candidate/context, duplicate dimensions, unseen citations and retained
conflict members. A model-supported result remains local review judgement with
`canPublish: false`; it changes no specification, current assessment or readiness state.

The one-request reservation is atomic and never renewed on that job. Valid returned
responses checkpoint before completion, which rechecks sources/content and atomically
saves result plus job status. Identical explicit calls reuse completed records; explicit
recovery of saved responses can create a zero-request job while retaining original
attempts, source job and response date. Live owners are not stolen; expired workers'
saved replies are not repeated. Missing/changed witnesses block reuse without an implicit
paid retry. If no valid reply exists, a later explicit action can authorize a fresh
one-request attempt. Startup, Stop, timeout and mode changes never automatically retry
or renew coordinator allowance. Coordinator-owned instances cannot start this task.

Upgrade and validation are ordered/transactional. Failure rolls back table/index and
schema/ledger advancement; reopen supports retry without regenerating old reviews.
Unsupported future formats, row/job/marker mismatches and orphan specialized jobs reject
startup unchanged. Existing source/finding identities are preserved, not rebased onto
joint validation or recovery dates. Payload/source/context bounds reject instead of
truncating. Shared portable formats are unchanged: local joint jobs are excluded and
forged joint markers cannot be adopted as ordinary discovery authority. A failed joint
task cannot become generic discovery-resume permission. See [scope, limits and recovery](definition-joint-review.md).

Verification, 2026-10-30: `npm run check`, all **1,218** deterministic tests
(`npm test`: 515 pretests + 703 main tests), `npm run test:browser` (including UI
build), `npm run test:browser:workflow` and `git diff --check` passed. Upgrade tests
cover preservation/repeated reopening, transactional failure/retry, future-format
rejection and saved-response recovery without inference. Browser checks use fixture
adapters; no live model calls were made. Live model quality, effective provider-side
tool/cancellation enforcement and large-project replay performance remain unqualified.

## Per-finding origin preview (2026-10-30)

**Read-only internal addition; no persisted conversion.** Source/target SQLite stays
**15**, execution stays schema 2, and project/job/assessment/certificate/portable formats,
v1 freshness/semantic keys, optimistic counters and existing receipts are unchanged.
Format-1 `definition-finding-origin-v1` packets and
`definition-finding-origins-preview-v1` results are in-memory inspection representations,
not newly persisted assessment provenance or authority. No migration, startup backfill,
model call, allowance renewal or worker claim occurs. Valid older work remains valid;
uncertified reviews do not receive fabricated origins or forced reassessment.

Explicit bounded selections re-verify original publication certificates and their
request/response/history sources within one read transaction. Packets retain original
dimension/job/revisions/date, evidence/finding identities and full-area guards. Missing,
changed, unsupported or oversized sources stay unavailable without selecting substitutes.
Current revision plus full content token reject stale/equal-numbered replacement.
The separate `definition-finding-guard-proof-v1` policy does not weaken the existing
whole-assessment comparison or coverage/readiness rule: guard equality is only a dated
candidate fact, not proof that today's finding is unchanged or even present.

Selections from different original dates do not get a shared new assessment date.
Even a preview where all guards match has `canPublish: false`, inspection-only authority
and joint consistency explicitly unproved. Relevant changes require the existing
whole-area fallback; missing current reviews are not restored. No narrow partitions,
mixed publication, API/UI endpoint, scheduler consumption or saved-call claims are
introduced. Any future persisted mixed result requires its own forward migration and
original-provenance preservation tests. See [origin semantics and bounds](definition-finding-origins.md).

Verification: type check, all **1,196 deterministic tests** (494 pretests + 702 main),
production UI build and diff check passed. The 12 new origin tests cover distinct
original dates/conclusions, guard-only versus whole-assessment comparison, relevant/
global versus unrelated edits, partial selections, missing/changed source evidence,
stale/equal-numbered replacement, unsupported/self-declared packets, bounds, immutable
source rows, live-worker/spend preservation, repeat reopen, missing current reviews
and archived targets. Existing publication/upgrade and dependency regressions passed
in the full suite. Browser runners were not rerun for this internal read-only slice;
no new UI/HTTP behavior is introduced. The existing bundle-size warning remains.
No live inference, personal-project writes, commits/pushes or desktop packaging were
performed. Narrower independence proofs, joint-consistency qualification, saved mixed
publication, automatic skips and actual request reduction remain unfinished.

## Definition publication certificates (2026-10-29)

**Implemented forward migration:** SQLite **14 → 15**, named
`definition-publication-witnesses-v1`, adds `definition_request_witnesses` and
`definition_publications`. Existing project/portable/job/context/assessment formats,
execution schema 2, v1 semantic keys and optimistic counters are unchanged. No source
row is rewritten, so this additive migration needs no payload backup. Existing jobs,
reviews, history, approved plans, grants, spent attempts and live leases remain intact.
Older apps reject the new SQLite version rather than stripping publication evidence.

New assessment-only definition requests can record app-owned adapter-boundary facts:
input revision/snapshot, exact context payload and manifest/membership digests, and
contract-normalized response digest. Reservation alone is not a completed response,
provider delivery or billing proof. Final publication still uses existing lease,
revision, citation and complete single/exact-stage validation. Optional certificates
commit atomically with the review/revision/job completion, retaining original IDs,
snapshot/manifest keys, accepted context/response witnesses and staged ledger identity.
Both staged collection and verification must cover all broader guarded records. A
model assertion, stored result or incomplete/cancelled/stale task cannot self-issue
coverage evidence. Authority remains `publication-evidence-only`, never skip permission.

Older completed and in-flight requests are not backfilled. Missing witnesses, mismatched
original history (including compatible ordering-repair metadata differences), unread
broader guards or bounds suppress optional issuance without invalidating valid reviews,
resetting attempts or repeating inference. Same-input continuation can retain witnesses
from earlier job IDs. Local evidence is not exported as portable authority. There is
no new API/UI action, scheduler, approval or permission grant.

Certificate reads require an explicit original assessment revision. They re-create the
manifest and published findings from original bounded snapshots, the completed source
job and replayed single/staged result, then match dispatch/response witnesses. Missing,
changed or unreadable sources return unavailable without choosing older evidence or
writing state. Later edits leave dated certificates intact. These are local provenance
records, not signatures against wholesale malicious database rewriting. Future compatible
reader/encoder changes must preserve issued policies through frozen validation or a
forward compatibility path, not make users repeat valid work merely to regain evidence.

Migration/format validation is ordered and transactional: failure rolls back both new
tables and schema/ledger advancement; reopening supports explicit retry. Repeated startup
does not duplicate data. Unsupported future formats/row identity mismatches reject
startup unchanged. Certificates/witnesses are read with a **2 MiB** payload bound;
coverage is capped at **64** accepted stage contexts, original snapshots at **16 MiB**,
plus the dependency protocol's record/area/reference bounds. No successful truncated
proof is produced. A certificate insertion failure rolls back the review/history/job
completion while retaining the already returned request witness for retry without a
new model call. See [publication semantics and limits](definition-publication.md).

Verification: type check, all **1,184 deterministic tests** (482 pretests + 702 main),
production UI build, default seven-runner browser aggregate, focused workflow and
ordering-upgrade browser checks, and diff check passed. The 19 new publication tests
cover service-issued single and fully replayed staged coverage, same-input continuation
with retained requests, response immutability, forged/schema-valid envelopes, missing
or changed original sources, cancellation/staleness/expiry/partial work, optional
uncertified legitimate reviews, transactional certificate failure/retry, 14→15 older
completed/live-work preservation, repeat startup, unsupported future formats and
bounded/corrupt reads. The existing bundle-size warning remains. No live inference,
personal-project writes, commits/pushes or desktop packaging were performed;
`test:browser:all` was not run. Automatic skips, narrower dependency partitions,
mixed finding publication and actual request-savings reports remain unfinished;
live model quality and large-project certificate/replay performance remain unqualified.

## Definition dependency protocol prototype (2026-10-29)

**Core inspection-only addition; no persisted conversion.** SQLite source/target
remains **14**, execution remains schema 2, and project/portable/job/assessment/context
and exact-stage formats/keys are unchanged. The new format-1
`definition-dependencies-v1` manifest is an in-memory experimental representation,
not an issued publication/coverage certificate, persisted field or scheduling input.
No existing record, history, receipt, grant, attempt or semantic identity changes.
No startup backfill, migration, model call, worker claim or permission change occurs.

Construction requires the exact original assessed snapshot and existing matching v1
basis, rejecting field/value-converting reader projections. Inspection reconstructs
the manifest from that original and validates current revision plus full content token.
New uncited records/absence guards and linked external-area populations participate;
all findings share a whole-area guard. Missing/ambiguous/bounded/unsupported evidence
falls back without truncation or a fabricated original basis. Even matching evidence
has inspection-only authority, not an automatic skip or a saved-call claim. Existing
ordering-only repair remains separate; the prototype does not manufacture missing
older-portable witnesses or require users to repeat valid saved work.

No forward migration is necessary because there is no new saved form. Original-snapshot
purity and unsupported-manifest tests cover the in-memory boundary; existing upgrade
tests remain regression coverage for unchanged persisted behavior.
Any future persistence/activation must ship its own forward-migration and qualification
slice. See [protocol, bounds and activation gates](definition-dependency-protocol.md).
Verification: type check, all **1,165 deterministic tests** (463 pretests + 702 main),
production UI build and diff check passed. The 31 new protocol cases cover actual
saved-review inspection without writes/jobs, original provenance, population/absence
guards, new uncited area/dependency/global decisions, external scoped-answer/authority
links, backward/forward supersession, interpretation, word/array/answer changes,
unrelated edits, unsupported/forged manifests, missing/cyclic/ambiguous data, bounds,
and equal-numbered content replacement. Browser runners were not rerun for this unwired
core-only slice; no new UI/API behavior is introduced. Existing UI bundle-size warning
remains. No live model calls, personal-project writes, commits/pushes or desktop
packaging were performed. Automatic skips, request savings, live model quality and
large-project preparation performance remain unqualified.

## Retained definition reviews in specification runs (2026-10-29)

**Implemented compatibility boundary:** SQLite **13 → 14**, named
`specification-run-definition-retention-v1`. Format-1 local run receipts gain optional
`retentionStartKey` and `result.retainedDefinitions` fields. The nested evidence is
format 1, policy `definition-run-retention-v1`. Project/portable formats, execution
schema 2, assessment keys, optimistic revisions, grants and exact-stage ledgers are
unchanged. Older apps reject the newer SQLite version rather than stripping receipt
evidence. No existing payload is rewritten; no backup/conversion is needed for this
additive boundary. Existing receipts remain byte-for-byte identical and absence of the
new fields means unavailable, not zero retained work. They are not reconstructed.

New worker starts bind the actual current schema-read project content. Finalization,
inside the existing lease-owned release transaction, verifies that start/end history
snapshots match their actual current-row witnesses. Only the same complete saved
assessment with an existing basis matching the conservative v1 inputs at **both
boundaries** is recorded. Entries retain original area ID/title, assessment revision,
input-basis key, full-assessment digest and finding count, not finding/evidence prose.
New/replaced reviews, genuinely stale inputs, missing bases and archived areas are
not listed. This is dated boundary evidence, not proof of intermediate-state validity,
successful findings, dispatch skips, requests saved or semantic independence.

Comparisons are capped at 16 MiB per snapshot, 64 areas and 8,000 evidence records.
Limits and ambiguous identities return explicit unavailable evidence, never a shortened
list. Same-numbered current-row replacement yields unavailable; altered starting history
still prevents finalization under the existing receipt rule. Older in-flight runs have
no new start witness and retain their old result representation when released. No
worker, lease, allowance or model call starts or changes on upgrade. Expired/interrupted
runs still have no inferred ending or retained-review evidence. Later edits and reopen
do not relabel previously finalized receipts. These local receipts remain outside
portable exports and do not authorize planning/coding or change freshness rules.
An ordering-repaired current row may differ from its unchanged historical representation;
that can make this receipt comparison unavailable without invalidating the repaired
review or requiring reassessment. Unavailable provenance never schedules a recheck.

Upgrade and validation share the ordered transaction. Unsupported future receipt
formats/policies abort startup and roll back schema/ledger advancement, preserving the
original bytes; retry after resolving the incompatible source is safe. Repeated startup
does not duplicate migrations. Tests include older completed/live receipts, byte-exact
preservation, live-owner/spend retention, unsupported-evidence rollback/retry and
same-numbered replacement at either boundary.

Verification: type check, all **1,134 deterministic tests** (432 pretests + 702 main),
production UI build, default seven-runner browser aggregate, focused coordinated-workflow,
Manual/Guided processing and ordering-upgrade browsers, and diff check passed. The
16 new core retention cases cover current/unresolved reviews, uncited area/dependency/
project-wide changes, unrelated reuse, replaced/missing/future reviews, archive changes,
genuine staleness, ambiguity, bounds and unsupported policies. Three new storage cases
cover 13→14 preservation/reopen, live old runs, rollback/retry and boundary replacement.
The workflow browser verifies a zero-request pass retaining two original reviews,
keyboard inspection, later-change/restart/mobile preservation, and no inferred list for
an interrupted run. Screenshots remain `.reqwizit-state/browser-workflow.png` and
`.reqwizit-state/browser-workflow-mobile.png`.
No live inference, personal-project writes, commits/pushes or desktop packaging were
performed. `test:browser:all` was not run. The existing bundle-size warning remains;
finding-level skips, dispatch-level reuse proofs, broader cross-operation receipts and
live quality/large-project upgrade qualification remain unfinished.

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
