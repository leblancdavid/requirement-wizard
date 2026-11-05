# Durable, incremental long-running workflows

User-approved direction, 2026-11-03. This is a phased implementation plan, not a
claim that incremental continuation is already available throughout the app.

## Contract

Citation advice no longer depends on reaching v3: v1/v2 seed and dispatch callers,
v3 batches and v3 joint review share explicit rules and bounded packet encoding.
Fitting v2 requests cannot bypass the positive/historical restrictions already used
by validation. Accepted lookups and saved verdicts retain their original hash-bound
reuse path even when new dispatch advice consumes extra space. See the
[all-protocol compatibility and tests](migrations.md#shared-citation-authority-across-all-change-review-protocols-2026-11-05).

Exact positive citation advice now covers **both** v3 batch and joint stages, with
lossless sharing of the existing ID table when duplicated literal IDs would consume
the bounded context. Each stage is offered only its own JSON response grammar.
Original findings' citation lists are preserved, but do not grant permission to cite
their missing bodies in a different batch. Frozen context identities, accepted
lookups/batches and charged attempts remain unchanged. See the
[new epic's read-only reproduction and compatibility ledger](migrations.md#positive-citation-authority-for-every-batch-stage-2026-11-05).

Joint v3 review now prints the exact positive citation allowlist from the same
function used by validation. Navigation/served-record inventories cannot silently
grant new citation authority. Required uncited records need explicit whole-body
rehydration and fresh semantic review. The reported task retains all three completed
batches; this advice/diagnostic fix changes no saved hashes, attempts or allowances.
See [compatibility and checks](migrations.md#exact-joint-review-citation-allowlist-2026-11-05).

V3 request advice now exposes the existing validator's historical-only citation IDs.
A superseded source can remain in a full historical batch without its successor;
the model must not infer that presence means current authority. Advice is reconstructed
without changing frozen keys or resetting saved work. The reported job retains two
accepted batches/two unfinished attempts; a corrected response is still needed, not
silent acceptance of the rejected citations. See the
[compatibility ledger](migrations.md#explicit-historical-citation-authority-for-change-batches-2026-11-04).

User-approved bounded change-review batching (2026-11-04) now follows the source-backed
lookup implementation: only size-blocked unfinished v2 tasks adopt v3 during explicit
owned continuation. Immutable original citations and accepted reads become exact
bounded source batches; each accepted local response is durable. All nine original
findings/changes stay complete. A final joint semantic verdict, not batch/citation
independence, is required for currentness; unresolved batch concerns cannot be blessed
as unaffected. Joint source rehydration uses bounded replaceable windows and the
remaining original lookup budget, preserving checkpoints/attempts across Pause,
restart and portable adoption. See [migration and remaining limits](migrations.md#bounded-change-review-batches-and-joint-verdict-2026-11-04).

Oversized cumulative change-check contexts now try lossless identifier sharing,
retaining exact bodies and the original expanded-data hashes. Accepted reads and
charged attempts therefore remain reusable across reopening/portable adoption without
a format migration. The reported blocked request prepares at 89,502 / 96,000
characters; actual model completion remains untested. Distinct evidence can still
exceed the unchanged bound. See the [compatibility and verification ledger](migrations.md#lossless-change-check-identifier-sharing-2026-11-04).

Source-backed change-check continuation is now implemented under explicit v2
work/receipt formats. The model can request exact missing bodies; accepted lookups
and spent attempts survive interruption, reopening and portable adoption. Missing
evidence is no longer limited to the old final-only `review-needed` response path.
All findings/changes remain supplied and currentness still requires a validated
semantic verdict. Oversized cumulative evidence pauses rather than being truncated
or silently treated as independent. See the [migration/verification ledger](migrations.md#source-backed-resumable-change-checks-2026-11-04).

**Real-project finding before v2 (2026-11-04):** answering a project-wide Design question
still changes every area's conservative guard. The present delta-only change-impact
request often omits the original cited evidence, so its safe `review-needed` fallback
can lead back to broad reassessment. Read-only investigation found this pattern in
23 assessed areas, including multiple live completed impact responses reporting
missing evidence. The memory mitigations do not solve it. A bounded, durable
on-demand evidence-loading protocol was needed and is now implemented above; neither relabeling the UI nor
graph/citation-based independence claims are a substitute. See
[observed limits](definition-coverage.md#check-decision-impact-before-repeating-completed-reviews-2026-11-04).

Memory-pressure mitigation, 2026-11-04: a user-reported native V8 heap allocation
failure during Continue specification is confirmed, but its exact application
callsite remains unknown. Scheduling now retains compact validated receipts rather
than full job ledgers across inference; initialization/completion use scoped reads,
and portable publication encodes one historical assessment snapshot at a time.
Saved evidence, attempts, hashes and continuation identities are unchanged. The
128-MiB capped-heap synthetic publication check passed; this is not reproduction
of the user's crash or a universal memory bound. See [desktop findings](desktop.md#assessment-memory-pressure-mitigation-2026-11-04)
and the [compatibility ledger](migrations.md#assessment-memory-pressure-reduction-2026-11-04).

The 2026-11-04 change-impact slice now integrates with Continue specification:
eligible added-answer deltas get a bounded semantic comparison against all nine
original findings before full refresh. Exact unaffected receipts preserve current
compatibility separately from original findings/dates; affected or uncertain areas
take the existing full-review path. Eligible checks run ahead of potentially long
full reviews. No startup calls or extra consent workflow are introduced. Three
charged attempts survive explicit retry; validated saved replies can publish after
recovery without repeating inference. Database 24 / portable state 4 protect the
new evidence. See [migration ledger](migrations.md#dated-definition-change-impact-reviews-2026-11-04)
and [eligibility limits](definition-coverage.md#check-decision-impact-before-repeating-completed-reviews-2026-11-04).
Deterministic integration/browser checks pass; live semantic and actual-user desktop
qualification remain outstanding. This is not general delta-only verification.

A decision may invalidate a conclusion, not erase the work that produced it.
Preserve original inputs, IDs, exact evidence, dated outputs, checkpoints, spent
attempts, and coding artifacts. Keep saved progress distinct from current validity.
Reject stale publication without discarding validated computation. New decisions
attach explicit impact/reconciliation work to the baseline; they do not silently
rebase historical conclusions or authorize more requests. A question pauses its
dependants, not necessarily the entire project. Cross-cutting changes can still
require broad review, with a specific explanation.

## Ordered slices

1. **Close completed-response loss windows (first implementation slice).**
   Definition stages and scan batches must retain a valid response that arrives
   after a concurrent project edit, under its original inputs. Stop before another
   request/publication. Preserve live-worker ownership, cancellation and validation
   boundaries. No format migration or inference is needed for this slice.
2. **Assessment baseline plus change follow-up (initial collection-reuse slice implemented).** Retain completed and partial
   reviews across changed input keys. Bind a new follow-up to both original and
   current snapshots; enumerate added/changed/removed evidence and affected scope.
   Reconcile the change against original findings and exact relevant evidence;
   unchanged citations/categories alone cannot establish independence. Reuse proven
   compatible work, escalate cross-cutting uncertainty and validate joint consistency
   before publication. Integrate with Continue specification, not another manual
   advanced-tool workflow. Preserve genuinely stale history and provenance through
   a versioned forward migration where necessary.
3. **Decision-aware scheduling and progress (conservative evidence-review slice implemented).** Persist waiting dependencies and
   distinguish completed/current, completed/impact-review-needed, waiting, and not
   started. Continue safe independent tasks under the existing grant; never guess
   answers or repeat question preparation unchanged. Show retained/reused work and
   explain necessary rechecking without resetting the user's visible progress.
4. **Discovery, saved-response processing, refinement and clarification (staged and retrieval response-loss windows fixed; broader audit incomplete).** Audit
   revision/material/context-key resume gates and post-request stale checks. Give
   each a frozen baseline and explicit reconciliation boundary, with no duplicate
   application of proposals/answers. Preserve validated responses on interruption
   where worker ownership and cancellation semantics allow it.
5. **Scans and implementation planning (response preservation, exact-input reuse, bounded evidence follow-ups and cross-target source carry-forward implemented; broader reconciliation pending).** Separate reusable file capture/observation
   from current-project interpretation and publication. Resume only changed file or
   planning tasks when compatible; model/context changes must not mix unverified
   outputs. Preserve complete earlier snapshots, package drafts and dependencies.
6. **Implementation and delivery.** Retain branches, worktrees, commits, checks,
   sessions and delivery evidence. Reconcile changed requirements against completed
   versus pending work before replanning. Never equate retained evidence with
   delivery or weaken explicit coding/delivery permission.

## Efficiency requirements for every slice

- Measure model dispatches separately from local preparation/replay/publication.
- Prefer deterministic exact change checks before model impact review; cache only
  immutable, revision-bound computations. Avoid repeated full-history replay where
  verified immutable checkpoints can safely provide the same guarantees.
- Do not repeat accepted identical-input calls. Changed-input reconciliation may
  require new calls; report actual attempts, not hypothetical billing savings.
- Bound context and work; load exact evidence in coherent groups rather than
  repeated single-link lookups. Never summarize away human constraints or use
  citation-only/category-only skipping as a shortcut.
- Preserve grants, attempts, timeout/cancellation and worker leases. No startup
  inference, silent provider/model switching, or allowance resets.

## Verification and upgrade gates

For each workflow: complete multiple expensive steps, introduce an unrelated and
then a relevant decision, restart, explicitly resume, and assert original inputs,
outputs, IDs, attempts and dates survive. Count calls to prove identical completed
tasks are not repeated. Cover cross-cutting changes, malformed/unsupported outputs,
concurrent edits, stale publication, cancellation, lease expiry, live-worker
ownership, repeated restart, portable continuation and interrupted migrations.

Use older saved fixtures and transactional/additive forward migrations for new
representations; record source/target formats and recovery in migrations.md.
First qualify deterministic behavior; live semantic qualification is separate and
requires bounded calls with an explicit provider/model. Do not modify the user's
affected project during diagnosis or claim its recovery from synthetic tests.

## Findings from the initial audit

- Definition history is selected by exact area/input key. Unrelated evidence can
  already reuse a saved plan, but changed guarded inputs require a new review.
- Definition dispatch rejected a response on revision mismatch before accepting
  or checkpointing it; checkpoint storage also rejected revision changes outright.
- Scan checkpoint storage stopped on revision mismatch without saving the newly
  completed batch. Resuming a stale/changed-project scan remains unavailable.
- Discovery planning uses input-keyed receipts; submission/refinement replay binds
  exact materials; staged implementation planning rejects changed input keys.
- Implementation planning/run freshness gates remain conservative. Existing
  branches/sessions are retained, not automatically reconciled.

Progress and actual verification of each slice must be recorded below, without
marking the broader workflow redesign complete.

### First slice implementation (2026-11-03)

Implemented historical response retention in definition-stage processing and scan
checkpoint storage. The checkpoint commits before the stale error is raised;
newer decisions stay unchanged and no subsequent dispatch/publication is allowed.
Original job history and attempts survive repeated database reopen. Compatible
unrelated-area continuation reuses collection/verification, including zero-call
publication of a fully checked assessment. Relevant changes still require the next
baseline/reconciliation slice. The existing portable projection does not export
obsolete changed-key definition history; address baseline portability alongside
the new versioned reconciliation representation, not by exporting the full archive.

The new regression file is included in `npm test` and available separately through
`npm run test:resilience`. No model/provider calls or user-project writes are needed
for these tests. No UI, desktop package or installed application is rebuilt by this
slice. Full verification results are recorded after execution in migrations.md.

### Baseline collection reuse (2026-11-03)

Implemented for eligible staged reviews through the existing Continue specification/
Refresh dispatch. Start from the exact nine original findings, collect every changed
record, then verify the complete current evidence. This avoids repeating unchanged
collection, not full consistency checking. The source is authenticated against its
original publication snapshot and completed assessment-only result; source lookup
does not deserialize its historical request archive. Exact scope/population changes
are compared deterministically before dispatch. Unsupported origins and destructive/
structural changes fall back to full collection, never a guessed independent finding.

New checkpoints bind the original baseline, changed-record list and full verification
schedule. Complete dimension views can fit a large starting draft without cutting it.
Attempts, original jobs/findings and restart/adoption identities remain intact. Portable
continuation keeps compact original-publication receipts and necessary snapshots,
not obsolete response archives. Original v1 work/fingerprints stay unchanged; older
readers fail closed on new marked checkpoints. V1 full-collection publication
certificates are not issued for this different collection method.

Remaining: safe incremental verification, decision-aware independent scheduling, richer retained versus
current progress, other workflow types and live/actual-user qualification. Full current
verification is still required and may be long. Relevant edits while a follow-up is
unfinished retain its old work but can require a new baseline-bound follow-up; no
unsupported cross-revision verification reuse is claimed.

### Unfinished review collection reuse (2026-11-03)

Implemented for eligible partial first reviews and changed-key unfinished follow-ups.
Cooperatively replay exact original receipts, retain the provisional findings and
fully collected reads, independently pack changed/unread records, then verify every
current batch. No finding-independence claim or old verification skip is introduced.
Partial dimension reads and supplemental pages alone cannot complete collection.

Source reads/candidates/ancestry and derived-draft caches are bounded; active workers
pin their origins until exit. Cancellation during local replay makes no model call.
Required source digests are checked again before publication, preventing a cached
draft from hiding source changes. Portable state retains required unpublished
ancestry and answer-before-follow-up candidates. Old collection schedules and spent
attempts are not rewritten; see the [migration ledger](migrations.md#unfinished-assessment-continuation-after-an-answer-2026-11-03).

### Decision-aware review scheduling (2026-11-03)

Implemented a conservative question-scoped definition-review schedule under the same
existing coordinator grant. Exact transitive provenance and declared dependency
scope determine waiting reviews; unknown/global questions and other pending
decisions hold all affected/uncertain work. Only evidence reviews outside that scope
can proceed, never speculative answers, proposal updates or coding. Full verification
and all current readiness/consent/stale/lease checks remain.

The owned coordinator persists dated waiting-dependency snapshots. The queue shows
original review revisions and retained partial steps independently from current
validity, with lazy paged details. Compact read-only progress caches invalidate across
processes even when checkpoints do not change the project revision. Reading progress
does not arm work; old grants remain suspended after restart. Compatibility, bounded
inventory and verification are recorded in the migration ledger.

Still pending: scheduling beyond definition evidence review, semantic dependency
proofs, narrower verification, other workflow audits/reconciliation and live or
actual-user qualification. Conservative shared provenance may still hold all areas.

### Staged input, clarification and refinement response preservation (2026-11-03)

Fixed the post-response revision-loss window in saved-answer follow-up, staged Design
clarification, and individual/pair refinement. Each validates the completed reply
against original materials, commits its receipt, then stops stale without publication
or a subsequent request. The same-job task/material/plan binding cannot be replaced;
Stop, cancellation, expired leases and malformed replies do not gain accepted status.
Revision-only checks no longer decode the entire project.

Original IDs, exact inputs, receipts and spent attempts survive reopen. Compatible
explicit resume and portable adoption do not repeat the newly accepted read; a
complete final verification can publish on explicit compatible resume without any
new model request. Relevant changes remain incompatible with old current authority.
The existing separate refinement-plan path is not changed-input collection reuse.
No old missing response is manufactured by upgrade. See the
[migration ledger](migrations.md#preserve-staged-answer-clarification-and-refinement-responses-across-edits-2026-11-03).

The subsequent discovery/planning slice below closes those response-loss windows.
Ordinary single-request discovery outcomes outside retrieval still need a separate
durable-result/publication assessment. Scan changed-file reuse,
incremental implementation planning, and changed-material reconciliation for the
three workflows above remain unimplemented. This slice must not be called a complete
cross-workflow audit or protection for every process.

### Retrieval, epic reviews and planning response preservation (2026-11-03)

Retrieval now retains validated exact-load/search/final responses under original
inputs before stopping stale. Staged epic drafts and final verification have the same
boundary. Compatible explicit continuation replays saved original receipts and makes
only unfinished calls; completed final verification can finish with zero requests.
Transactions preserve ownership, original task/policy/plan identity and spent attempts,
and stop before publication or stale lease renewal.

Planning now saves owned validated original packages/stage receipts before checking
current project/workspace inputs. Final proposed-plan publication remains current-input
checked; historical failed output cannot be approved. Its public-edit lock remains
intact, so changed-input integration tests use explicit synthetic external DB changes.
Cancellation/expiry/replaced workers cannot save late replies. Revision-only checks
avoid full project decoding.

Focused regression coverage includes original-task rebinding, related/unrelated edits,
reopen, zero-call final recovery, initial/final staged checks, and planning ownership/
validation failures. All 137 focused tests, 53 resilience tests and type checking
passed; `npm test` also passed all **851 pretests and 770 main tests**. The UI build
and all **22** default browser regression runners passed using fixture adapters.
See the
[compatibility ledger](migrations.md#preserve-retrieval-and-implementation-planning-replies-across-edits-2026-11-03).
Changed-input planning reuse/reconciliation, single-request discovery outcomes outside
retrieval, newly stale discovery portable-adoption qualification and live/desktop
qualification remain outstanding. No workflow or milestone is declared fully qualified.

### Exact-input planning continuation across revisions (2026-11-04)

Explicit Prepare plan can now retain compatible per-target packages and exact staged
progress across a project revision change, rather than discarding the whole plan.
Each newly dispatched target gets a versioned exact-input receipt; completion binds
the saved package digest. Complete current supplied evidence, global context,
dependency candidates/guardrails, assessment metadata and runtime/schema/skill text
must still match. Only single-context unrelated omitted-source inventory counts are
excluded as non-evidence metadata; staged material keys retain their existing stricter
comparison. Current references and prerequisite scope are revalidated. No reasoning
about semantic independence from unchanged citations or area names is introduced.

A new current plan retains original receipt origins and archives its predecessor
unchanged. Unchanged targets skip model calls; changed targets use separate fresh work.
Partial exact stages preserve receipts and spent attempts. No old missing proof is
manufactured, and older same-revision progress/approvals remain valid. New portable
receipts survive adoption and repeated follow-ups; unsupported formats fail closed.
Approval is still explicit and revision/CAS checked. See the
[compatibility ledger](migrations.md#exact-input-implementation-planning-across-revisions-2026-11-04).

The scan audit found cumulative project decisions/prior drafts in every batch prompt.
Unchanged file hashes therefore do not authenticate reusable independent observations;
changed-file model-call reuse needs a separate observation/reconciliation protocol.
Scans remain conservative. Changed-material planning/submission/refinement/clarification
reconciliation and ordinary single-request discovery outcomes remain outstanding.

The 77 focused planning/implementation/migration tests, **862 pretests and 770 main
tests**, type/diff checks, UI build and focused planning-browser runner passed. These fixture
checks do not qualify semantic independence, live providers or an installed desktop.

### Additive-evidence planning follow-up (2026-11-04)

The next planning slice retains completed collection and a provisional draft when
new human evidence is added without changing target/global policy or original
record contents. Eligible format-1 original work is replayed and preserved in a
bounded self-contained witness; the follow-up collects every added/unread record,
then verifies all current batches. Original verification is never credited as
current verification. Earlier questions cannot be silently resolved by dropping them.

New format-2 ledgers keep collection and verification schedules separate. Original
source IDs/revision, reads, outputs and spent attempts survive restart and portable
adoption; the current follow-up's retries retain their own spent attempts. UI/logs
show retained original reads separately from required current verification. Old
work is not rewritten or invalidated by upgrade; unsupported future formats fail
closed. See the [migration ledger](migrations.md#additive-evidence-planning-collection-follow-ups-2026-11-04).

The 85 focused tests, **870 pretests and 770 main tests**, type/diff checks and
enhanced planning-browser runner passed. All **22** default browser runners and the
UI build also passed. The browser uses a
fixture adapter; no live inference, GitHub delivery, installed desktop or real-user
project recovery is qualified.

Still conservative: changed/removed original records, target/global changes and
structural additions require full new collection. The first implementation does not
chain multiple changed-input follow-ups: a changed format-2 source gets separate full
work while its original witness remains preserved in history. Broader planning and
submission/refinement/clarification reconciliation, scan observation reuse, and
single-request discovery outcome preservation remain future slices.

### Repeated additive planning follow-ups (2026-11-04)

Staged-work format 3 closes the first follow-up's chaining limitation. A later
evidence addition can retain validated collection across earlier partial follow-ups,
including one that saved only spent attempts and no new accepted response. Source
work/inputs/drafts remain self-contained and immutable. Only accepted collection
batches count as read; every current verification batch is still required. Earlier
verification and unfinished requests grant no completion credit.

Ancestry is bounded to six snapshots and the existing one-million-character JSON baseline witness
cap per target. Depth/cycle guards run before recursive parsing; source revisions
must strictly precede their descendants. At the depth bound, fresh collection is
explained without discarding source history. Same-input Stop/resume does not extend
the chain. Model context receives only the latest provisional draft and current batch,
not the historical witness. Full execution-history serialization/deduplication remains
a separate local-processing/storage concern.

The UI/logs show retained record counts and source checkpoint revision separately
from unfinished current steps. Portable adoption can continue a follow-up and later
create another follow-up after an added note. Existing format-1/2 work and request
identities are not rewritten; unsupported nested future formats fail closed. See the
[compatibility ledger](migrations.md#repeated-additive-planning-follow-ups-with-bounded-ancestry-2026-11-04).

The 89 focused tests, **874 pretests and 770 main tests**, type/diff checks and enhanced
planning-browser runner passed. All **22** default browser runners and the UI build
also passed. No live provider,
installed desktop or real-user-project recovery is qualified. This additive-only slice
did not reconcile changed/removed old records; the format-4 slice below adds evidence
reconciliation while target/global and requirement-structural changes remain fresh work.

### Changed/removed planning evidence (2026-11-04)

Staged format 4 retains only unchanged accepted reads when source/question/research
records change or leave the mandatory context. It collects current changes and unread
records, explicitly reviews historical retirement entries, then verifies every current
batch. It does not interpret leaving context as a decision to remove product behavior.
Source drafts and dependencies remain in the immutable witness; affected prerequisite
proposals are excluded from the active seed pending current evidence and explicit
review. Superseded IDs cannot authorize current dependencies even if their historical
bodies remain supplied. Earlier questions and an app-owned evidence-review warning
cannot silently disappear. Reviewed execution dependencies remain unchanged.

New schedules/deltas replay against exact frozen and current materials. Six-snapshot,
one-million-character witness and existing attempt/context/action limits remain. Known
source-plan dates travel with new witnesses; unavailable historical dates are not
invented. Format-1/2/3 work is not rewritten. See the
[compatibility ledger](migrations.md#planning-evidence-revisionremoval-reconciliation-2026-11-04).

The 101 focused planning/implementation/migration tests, **886 pretests and 770 main
tests**, all **22** default browser runners, enhanced planning-browser checks, UI build
and type/diff checks passed.
Source edits in regression fixtures are explicitly curated/external transitions,
not qualification of a new editing API, live providers or installed desktop behavior.
Target/global-envelope or requirement-guardrail changes still require fresh work and
normal approval gates remain. Existing-record human content is preserved in original
snapshots/witnesses, not overwritten by AI reconciliation.

Audit finding at that slice: if replacement preparation stops before visiting later targets,
their original reusable work may remain only in history. Immediate-predecessor
selection and compact portable projection do not yet carry those unprepared sources
forward. Already-prepared target recovery is verified, but cross-target source
retention/selection is the next planning gap. Full-history serialization/deduplication,
scan observation reuse, other workflow reconciliation and general single-request
discovery outcome preservation remain separate work.

### Unvisited planning target recovery (2026-11-04)

Planning envelope 2 now captures eligible per-target historical sources under the
owned startup lease before replacing the plan or making any request. Separate pending
capsules survive repeated early failures, restart and portable adoption without the
full archive. Nearest touched targets, review decisions and settings/binding/model
epochs bound history selection; newer attempts cannot be bypassed for older successes.
Current target packets consume sources atomically only after validation/preparation.
Frozen materials preserve exact partial request identity; changed evidence retains
its source receipt and still verifies current inputs. Pending sources never count as
current packages and block publication until processed.

Formats/fingerprints already saved remain unchanged; original snapshots supply legacy
materials only where available. Capture errors leave the old plan intact and make no
model request. The [migration ledger](migrations.md#unvisited-planning-target-source-carry-forward-2026-11-04)
records portable binding changes and compatibility. All **109** focused tests, **894
pretests and 770 main tests**, type/diff checks, UI build, enhanced planning-browser
checks and all **22** default browser runners passed. Multi-target recovery itself is
qualified by deterministic service/storage/portable tests, not a new browser scenario
or live inference.
This closes the identified unvisited-target carry-forward gap, not broader target/global
reconciliation, scan reuse or whole-history serialization/deduplication.
