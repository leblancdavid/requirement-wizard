# Epic workflow gap review

## Implemented first slice (2026-10-21)

Use **Design → Explore next gaps**. The feature filter restricts workflow
packages to one epic and includes declared incoming/outgoing dependency-boundary
packages. **All project areas** visits epics in saved order, then boundaries. Each
click without a question target reviews **one package**, not the entire epic or backlog.
The browser action uses the compact **Questions ready** input to continue
sequential packages (at most ten packages / fifteen minutes), publishing each result
and retaining final-package overshoot. The target is project-wide even with a feature
filter. No automatic refill runs after completion/restart. Existing terminal discovery, initial
interpretation and queued answer/review follow-up retain their existing behavior.

The workflow action is now the single Design discovery button; it is absent from
Review, Project map and Activity. The explanatory card is removed; target semantics
and run limits are available in its tooltip and detailed outcomes in Processing & queue.
Legacy individual checks remain available through their API/terminal and explicit
saved-job continuation; their checkpoints are not relabelled as workflow results.

This replaces neither old saved checks nor human review. It is a separate discovery path
intended to avoid three independent lens reviews of every requirement and repeated
model-driven evidence search. Live usefulness/cost improvements have not been measured.

2026-10-22 Resume correction: **Processing & queue → Resume discovery** now uses the
workflow planner when no unfinished human input remains, including saved-stage
recovery after browser/SQLite restart. It no longer silently selects the legacy
individual-check path. Unfinished responses instead receive finite isolated
processing, with no gap-discovery fallback from an empty selected response scope.
Workflow policy/attempt/check identities are unchanged; see
[routing and limitations](discovery-efficiency.md#browser-resume-routing-2026-10-22).

### Graph-backed current-specification policy (2026-10-22)

Service preparation is now incremental and worker-isolated: prepare through the first
eligible package, not every package before the first model request. `planningPartial`
reports/diagnostics cover only the examined prefix. A parent-owned two-minute
preparation deadline and cancellation keep initial planning responsive without
extending the worker lease. Numeric local progress is saved before inference.
Original policies and exact model-stage identities still reconstruct unchanged;
staged contexts share the finalized review identity on every batch. See
[responsive preparation](discovery-efficiency.md#responsive-incremental-preparation-2026-10-22)
for limits and remaining synchronous work.

New workflow/dependency work now tries `current-spec-v1`: graph-based exact evidence
closure plus proactive omission of redundant generated background explanations,
with the existing conservative unique-answer and current-decision rules. Choose the
smaller measured representation; current wording/scenarios, human evidence and
provenance remain intact. History is not deleted or indiscriminately summarized.
Compatible saved no-policy/headroom/staged work retains its original context policy
and completed/spent calls. Headroom targets and exact staged fallback below remain
unchanged; those dated sections describe their retained policies.
See [discovery efficiency](discovery-efficiency.md) for the implemented slice,
synthetic benchmarks and remaining search/selective-invalidation work.

### Staged shared-decision review (2026-10-22)

Oversized **new/changed** packages can now use `staged-guardrails-v1`. After normal
headroom preparation, try staging the intact workflow/dependency group before
splitting its targets. Partition the original mandatory non-file record seeds into
at most sixteen deterministic batches. Every batch retains the exact target, initial
idea, linked question/answer/provenance closure and its assigned exact guardrails.
Other guardrails are explicitly deferred to other batches, not summarized, dropped,
treated as unknown preferences or declared reviewed. Static file motivation is
deferred; a missing indispensable file fact blocks rather than being guessed.

Each base batch must fit **54,000 characters**. A bounded draft pool (12,000 characters,
at most five questions/ten requirements) and staged instructions must fit within
**72,000 characters** for every actual request; the underlying 96k ceiling is unchanged.
The original `staged-guardrails-v1` policy retains these limits for saved work.
New otherwise blocked indivisible leaves may use `staged-headroom-v2`, after the
ordinary splitting/preferred-72k strategies. V2 measures exact evidence, the largest
stage envelope and the full existing 12,000-character draft allowance together
against the unchanged 96,000-character ceiling. Every actual request is measured
again; above-72k use is explicit. Evidence that cannot fit with this reserve, or a
partition requiring more than sixteen batches, still blocks. Saved v1 stages are
not relabelled or replayed as v2; completed calls and spent attempts remain intact.
See [compatibility and recovery](migrations.md#staged-headroom-v2-and-local-eligibility-upgrade-2026-10-22).

There are two passes: discover drafts against every batch, then validate the complete
draft pool against **every** batch. A validation response may select only unchanged
draft indexes to keep, never invent or rewrite proposals. A later batch can veto an
already-answered, duplicate or conflicting proposal before publication. Discovery
citations must reference exact evidence in that discovery request. Drafts/earlier
model output are not human decisions or evidence. The model's semantic checks are
not deterministic proof that all conflicts or possible cross-batch gaps were found.
This remains bounded discovery, not an exhaustive multi-record completeness audit.

No proposals publish until both passes finish. Saved format-1 `retrievalWork.epicStages`
retains the exact plan basis, phase/cursor, validated successful responses, per-stage
spent attempts and current drafts. Replay/validate those transitions locally before
resuming and independently at storage publication. Publication's citation authority
is explicitly the union of completed exact batches, **not** a claim all those records
were in one request. Storage rejects incomplete or tampered publication scopes.

Each stage has three attempts across retries. One explicit action continues a staged
package automatically through up to **32 requests or fifteen minutes**, including
preparation; it no longer pauses every six successful calls. Stop remains available.
An intentional budget stop records **Paused—progress saved**, not failed analysis,
evidence blocked or reviewed. Explicit Resume continues unfinished stages. Startup
never starts calls; reloading a live browser does not create a second worker.
The existing queue can visit up to ten packages/fifteen minutes per action; 32 is
per package, not a global click-wide allowance. Sixteen batches imply at most 32 successful stages
and 96 cumulative attempts per package. Failures stop rather than automatically retry.
Reports distinguish current-stage attempts
from cumulative attempts and show partial drafting/checking progress. Research,
search/paging and extra evidence-load requests are unsupported in this policy;
an explicit research selection is rejected, not silently switched off.

Compatible legacy/headroom reviews, partial calls, exhausted attempts, split children
and completed results keep their original policy. Previously local size-blocked work
with no inference may now stage without resetting spent model work. See
[migration ledger](migrations.md#staged-shared-decision-review).

### Proactive headroom policy (2026-10-22)

New work uses `contextPolicy: headroom-v1`: aim for **72,000 characters including
the workflow context envelope**, retaining at least 24,000 characters below the
existing 96,000-character application-context ceiling. This is a character budget,
not a provider token limit or a measurement of additional runtime/schema overhead.
The preferred threshold is soft: indivisible mandatory human evidence can still
use the hard allowance, with an explicit reduced-buffer warning. It is never dropped
or summarized to force a 72k result. Guaranteed headroom for such large shared
guardrails previously needed staged/explicitly scoped decision review. The staged
policy above now handles divisible shared evidence; old saved headroom contexts
still retain their original reconstruction and explicit exceptions.

Before splitting new groups, prepare compact policies and canonical approval
references, reclaim generated help/background explanations under the existing
conservative rules, and share exact repeated text/IDs/record structure. A bounded
literal phrase pass additionally shares repeated substrings inside distinct prose
(250k scanned characters, 4,096 candidate phrases, at most 64 selected phrases).
The existing shared-text wire form is reused, preserving punctuation, whitespace,
Unicode, citations and expanded evidence identities. Accept encodings only when
they reduce the measured context; compare plain/snapshot and whole-field/phrase
representations and keep the smaller result rather than assuming an encoding helps.
Human-only packages skip pointless repeated file-deferral work. Small index previews
are navigation, never authority.
Prefer exact linked files when the complete context meets 72k; otherwise defer static
motivation, never human constraints or explicitly loaded records. Split above-target
new packages when possible, retaining both sides of boundaries. Additional exact loads
can use the remaining hard allowance; they cannot silently truncate evidence.

Compatibility takes precedence over regrouping: reconstruct saved legacy or headroom
policies and their exact evidence first. Keep compatible completed packages, partial
stages/finals and exhausted blockers, including historical split children and
overlapping boundary counterparts. Only genuinely new/changed work takes the new
policy. Startup never starts inference and optimization never resets spent attempts.
Saved reports and source payloads are not rewritten.

**Processing & queue → Epic workflow review** now shows prepared context sizes,
available headroom, the preferred target and reduced-buffer exceptions. The evidence
buffer is character capacity, not a grant of additional requests. Saved no-call
reports show the largest prepared package and count above target. Figures describe
the saved input scope, not live completeness or a guarantee that every requested file
will fit. A deliberately irreducible synthetic global-decision fixture still needs
95,197 characters / 803 headroom and is labelled above target, not falsely improved.

### Local packages and evidence

The dated fallback notes below describe the retained no-policy/legacy reconstruction
path. New work uses the proactive policy above; compatible saved work keeps its own
policy rather than being replayed to change representation.

2026-10-22 oversized-context recovery: preparation still prefers full exact linked
evidence and the existing local package splits. If a minimum package (one workflow
record or a two-sided boundary) still cannot fit, it retries with static workspace
file motivation deferred. Requirement wording, acceptance scenarios and mandatory
human decisions stay exact. Deferred file IDs remain navigation handles, not usable
citations or claims about code; one explicit exact-load batch can retrieve them.
Explicitly requested records are never deferred, so an oversized requested file
still blocks. Surrounding omitted requirements have bounded statement/acceptance
previews and counts in the optional navigation index, never authoritative summaries.
These previews are derived afresh from current records without model calls or a
persisted summary field. They cannot justify changes to omitted decisions.

For a minimum package still oversized after file deferral, the builder additionally
tries lossless approval-snapshot references. A canonical saved approval/rejection
whose statement/scenarios exactly match a loaded requirement can share those fields
by reference, retaining its original decision and complete human addendum. Unknown,
ambiguous or mismatching historical snapshots stay as original strings. The model
receives explicit expansion instructions; evidence hashing reconstructs the exact
original string. This is structural compression, not an AI summary or deletion of
old decisions, and leaves compatible evidence/checkpoint identities unchanged.
The distributed 65-requirement/65-answered-question fixture drops from an over-budget
133,387-character working set to a 90,977-character workflow request without dropping
any human sources, statements, scenarios or question options. The real user's project
and live model comprehension are not yet qualified by this fixture.

Near-cap packages have one final local fallback: compact repeated app-generated
scope/encoding explanations and use the combined workflow prompt instead of also
repeating a legacy single-lens instruction. A long generated advisory summary may
be explicitly omitted. Only known app-owned policy fields are changed; every human
source, requirement/scenario and question/answer remains exact. Citation, scope,
single-load and output restrictions are retained. The final workflow envelope must
fit the same 96,000-character cap; genuinely oversized evidence still blocks. Old
fitting contexts are tried unchanged first, preserving reusable completed work.

Remaining oversized human evidence is not summarized away. Blockers now retain total
and section sizes plus the largest exact record IDs/sizes before lossless encoding.
App-generated diagnostic prose is bounded to the saved report's 1,200-character
reason limit, with an explicit shortening marker; human evidence is never shortened.
This corrects an initial diagnostic-overflow regression that mislabeled an internal
report validation failure as model-output validation. Duplicate identical failure
text from gap progress and the saved last-job diagnostic is shown once; distinct
errors remain visible. Type checking, 48 focused tests and the focused epic browser
check passed for this correction, including 20 oversized reasons and failed-outcome
deduplication. No live model calls were made.
An all-blocked run is labelled **Gap exploration blocked**, not a successful empty
scan. Locally size-blocked packages are reconsidered on the next explicit exploration;
startup never initiates model calls. This does not refresh whole-area coverage.

- Locally group up to six active requirements and human notes per epic. Unresolved
  questions have separate waiting-only singleton packages; they never displace
  requirements into newly regrouped packages. Shared explicit evidence links are preferred, excluding the ubiquitous
  initial idea; remaining records use stable ID order. These are **candidate workflow
  packages**, not model-discovered/named workflows or confirmed product boundaries.
- Review actors, normal behavior, state/data, permissions, failures/recovery and
  acceptance together. Do not spend this pass on generic wording cleanup.
- Prepare linked exact saved evidence before inference using the existing transitive
  evidence loader/current-decision projection. Include linked answered questions,
  exact human input/addenda, project constraints and dependency guardrails. Relevant
  historical research remains dated evidence, not human intent or current verification.
- If exact evidence exceeds the 96,000-character hard bound after lossless compaction,
  split workflow packages locally. Keep both sides when splitting boundary packages.
  An irreducible one-record workflow or two-sided boundary is explicitly blocked;
  never silently truncate human evidence or a file to make it fit.
- Missing records/labels remain navigation only. The model can request **one batch**
  of up to eight displayed, unseen saved IDs, followed by final review. There is no
  search or paging envelope. A final response may instead return a specific
  `reviewBlocked` reason. Search or a second load is rejected and blocks that package.
- At most **three model attempts across retries**, with no automatic retry/continuation
  grant. A usual review uses one call; a successful extra load uses two. The third is
  retry headroom, not permission for another navigation stage. Failed attempts count.

2026-10-22 evidence-blocker correction: explicitly unknown intended behavior can
support a focused clarification question citing the detailed requirement or note.
Missing script contents prevent claims about current code, not questions about what
the user wants. A scene attachment alone never establishes startup behavior. Exact
saved source links are closed locally; a file path mentioned inside scene text is
not itself a saved source-ID link. This change does not add file parsing, search,
automatic rescanning or access to the live workspace during review.

A valid `reviewBlocked` response now finishes the job with an evidence-blocked
report and **no review result**, proposals or specification revision. Targeted
exploration continues independent eligible packages within the same ten-package /
fifteen-minute limits. All-blocked scopes stop without inference. Provider failures,
malformed/unauthorized responses, oversized requested evidence, cancellation and
stale/expired workers still stop the run. Original blocker explanations remain
visible on later no-call reports instead of being replaced by a generic reason.

### Boundaries, waiting and progress

Workflow packages precede boundary packages. A declared epic dependency gets bounded
counterpart groups (up to three records from each side). Every side's records can be
visited, but this is **not every possible cross-epic record pair**, and undeclared
integration relationships can still be missed. Global constraints remain present.

Target-linked unresolved decisions and overlapping saved human submissions wait instead
of being re-asked. Manual epic review leaves the submission queue paused; explicitly
resume ordinary discovery to process those responses. Compatible reviewed packages and
unchanged evidence/attempt blockers are skipped on later clicks. If all work is reviewed,
waiting or blocked, save a no-call report without a specification revision.

Continuation fix (2026-10-22): newly proposed questions no longer get mixed into
independent workflow packages or dependency-boundary counterpart groups. A question
citing another workflow's requirement IDs plus a shared source (such as the initial
idea) does not freeze independent gap exploration merely because both workflows
cite that source. Direct target links, answer provenance, source-only/global
questions without explicit requirement targets, and pending human input still
block applicable work. Human approval keeps its separate conservative policy.
With eligible independent work, a target of ten can now progress through 3, 6, 9,
and 12 pending questions in one run, preserving final-package overshoot.

**Processing & queue → Epic workflow review** shows reviewed/pending/waiting/evidence
blocked package counts, attempts and up to twenty blocker explanations. Counts describe
the review's input revision/scope, not live completeness. Proposed gaps/questions still
require human decisions. Completion is not specification correctness, readiness or
verified implementation.

### Recovery and compatibility

Jobs retain separate format-1 `context.epicReview` identities and `epicReviewReport`
counts. Legacy per-record/lens checks and their exhausted allowances remain untouched;
they are never relabelled as workflow reviews. Package identities include membership,
kind, epic scope and revision-independent exact evidence/guardrails. Changed membership
can regroup packages; this first slice does not promise optimal incremental grouping.

Saved loads, spent attempts and validated final responses survive explicit retries and
restart. Reconstruct and compare exact evidence before reuse; additionally loaded records
outside a package are checked too. Unrelated revision changes alone do not reset work.
Publication remains whole-project expected-revision checked and rejects unseen citations,
unauthorized cleanup/reorganization and whole-area assessment. A crash after the final
checkpoint can publish that saved response without repeating inference. Startup never
starts model work. See [migration ledger](migrations.md#epic-workflow-review).

Older evidence blockers remain failed jobs in history and retain their unchanged-package
skip policy. New completed-but-blocked jobs are also skipped, never counted as reviewed.
The prompt clarification does not reset existing blockers or replay their calls; supply
genuinely changed linked evidence/decisions to reopen such a package. Compatible completed
checks and saved stage/final fingerprints are unchanged.

Proposal area IDs are constrained in the review response schema to the round's detailed
areas, not every area shown in the navigation map. Omitted areas default to the focused
area; explicit out-of-scope assignments are rejected before final checkpointing, never
silently moved. Diagnostics identify the offending ID and allowed IDs. Restart the app
after updating, then explicitly use **Explore next gaps** again. Older failed
jobs with an unpublishable out-of-scope final can request a corrected response within
the same three-attempt ceiling; original output and spent attempts remain in history.
Exhausted packages remain blocked. Compatible valid finals/checks still reuse normally.

Area-boundary fix verification (2026-10-21): type checking and all **535 deterministic
tests** passed on Windows Node 22.23.3, including response-schema constraints, atomic
rejection, corrected retry and older saved-final recovery across repeated reopen.
No live provider calls or browser checks were run for this service/prompt-only fix.

## Verification and remaining work

Staged shared-decision verification (2026-10-22): type checking, `npm test` (28
pretests / 626 main tests), UI build and the focused epic browser check passed on
Windows Node 22.23.3. The new tests cover intact grouped targets with distributed
oversized shared decisions; exact requirements/confirmations/answered questions and
answers across batches; six-request pause/repeated SQLite reopen; retained attempts;
late batch veto and exact-index selection; unpublished-final recovery without calls;
storage rejection of partial drafts; future state rejection without overwrites;
cancellation/staleness; and the remaining indivisible-chain blocker. The browser
fixture exercises staged progress, paused unpublished drafts, mobile layout, reload
without inference and explicit resume without repeated completed calls. Portable
and specification browser checks passed separately. The full browser command still
stops at the existing `src/web/browser-check.ts:1347` **Approve resolution** assertion;
the bundle-size warning remains. No live provider calls or user-project inspection
were performed. Staged clone/pull continuation has not been separately qualified;
the general portable tests passed, but are not evidence of that new end-to-end flow.
Semantic usefulness and missed multi-batch relationships remain live-verification
gaps, not completeness claims. With research enabled, disable **Allow targeted
research in future rounds** before retrying this exact-decision-only staged policy.

Proactive headroom verification (2026-10-22): type checking, `npm test` (28 pretests /
618 main tests), latest 127 context/retrieval/epic tests, UI production build and
focused epic browser checks passed on Windows Node 22.23.3. Tests cover proactive
splitting before the hard ceiling, exact phrase round-trip/evidence identity, choosing
smaller encodings, new human input/file-load growth, explicit reduced-buffer cases,
legacy parents/split/overlapping boundary children, completed/unpublished-final reuse,
spent attempts across reopen and future-format rejection without overwrites. The
browser check includes target/headroom presentation, reload/no-call reuse and mobile.
Portable and specification browser checks passed separately. `npm run test:browser`
still stops at the previously observed **Approve resolution** visibility assertion
in `src/web/browser-check.ts:1347`; a full browser pass is not claimed. The existing
>500 kB bundle warning remains. No live model calls or user database inspection were
performed; indivisible large global context is still an explicit reduced-buffer
exception, not a guarantee of 24k headroom.

Near-cap generated-instruction fallback verification (2026-10-22): type checking,
`npm test` (28 pretests / 608 main tests), latest 117 context/retrieval/epic tests and
the final near-cap regression passed on Windows Node 22.23.3. A 97,093-character
working set becomes a complete 95,503-character workflow request; a second fixture
covers overflow introduced by the workflow envelope itself. Every human source,
requirement/scenario and question/option is checked unchanged. A larger context
still blocks; the hard cap is not increased. Disk-backed checkpoint recovery uses
the new fallback and preserves completed calls across repeated reopen. The user's
actual project and live inference remain unverified.
UI production build and the focused epic browser check passed, with the existing
>500 kB bundle warning. No live model calls were made.

Distributed approval fallback verification (2026-10-22): type checking, `npm test`
(28 pretests / 607 main tests), latest 116 context/retrieval/epic tests, UI build and
focused epic browser check passed on Windows Node 22.23.3. Exact round-trip and
evidence-basis equality tests cover addenda, conflicting older decisions, ambiguous
envelopes, changed requirement wording, unsupported encoding and missing targets.
A disk-backed oversized approval-history fixture retains its final checkpoint through
publication failure and repeated reopen, recovers without repeating inference and
reuses the completed check. No live calls or user database inspection were performed.
The earlier broader-browser failure below remains unqualified by this follow-up.

Oversized-context recovery verification (2026-10-22): type checking, `npm test`
(28 pretests / 603 main tests), latest 41/41 epic tests, UI production build and
focused epic browser checks passed on Windows Node 22.23.3. Tests cover bounded
file deferral, exact human/requirement preservation, explicit small-file loading,
oversized explicit-load rejection, unseen-citation rejection, retained old no-call
reports and completed-check reuse across reopen, and all-blocked no-inference
outcomes. The focused browser check verifies expanded size diagnostics and mobile
layout (`.reqwizit-state/browser-epic-size-blocked.png`). Portable and specification
browser checks passed separately. `npm run test:browser` stopped at the resolution
approval visibility assertion in `src/web/browser-check.ts:1293`; the complete browser
suite is not passing. The existing >500 kB bundle warning remains. No live model
calls or inspection of the user's saved project established that its particular
blockers are resolved. Oversized shared human constraints still require explicit
scope resolution; whole-area assessment refresh remains separate follow-on work.

Evidence-blocker correction verification (2026-10-22): type checking, the full
**584-test** deterministic suite, and the latest **38/38** epic tests passed on
Windows Node 22.23.3 (the final targeted run adds a ten-package-ceiling test).
The UI production build and deterministic epic browser regression passed, including
same-click blocker continuation, retained reasons, no-call reload and mobile layout.
The first browser run retained an obsolete assertion expecting the blocker to be
the final run outcome; it was corrected to inspect the saved blocker details and
the actual no-eligible-packages outcome. The existing >500 kB bundle warning remains.
These checks do not establish live-model question quality or the user's script
capture/link state; no live calls or user database inspection were performed.

`src/core/epic-review.test.ts` covers package/lens batching, dependency boundaries, exact
local evidence, no-call reuse, legacy separation, single-load/final recovery, malformed
responses, unseen citations, cancellation/stale/lease checks, attempt exhaustion, oversized
evidence, changed additionally loaded evidence, repeated reopening, future-format rejection,
and authenticated/revision-checked API routing. `npm run test:browser:epic` uses a
deterministic adapter and no provider access; screenshots are
`.reqwizit-state/browser-epic-review.png` and `browser-epic-review-mobile.png`.

The first browser run exposed a missing progress-panel render guard for the new report;
that guard was corrected. The first full browser run then stopped at an existing pilot
assertion expecting "No candidate continuation offered" while the unchanged UI says
"No candidate search-page continuation offered"; the assertion was aligned with the
existing message without changing retrieval behavior. The full rerun of
`npm run test:browser:all` passed: reliability, main workspace, exact retrieval, saved
navigation, pilot and the new epic workflow browser check, including reload/mobile.
The UI production build passed with the existing >500 kB chunk-size warning.
Type checking, all **533 deterministic tests**, the latest **21/21** epic-specific
tests (including cross-revision final recovery), both CLI help commands and whitespace
checks passed using portable Windows Node **22.23.3**. System Node remains **20.11**.
All 111 local link targets in the affected Markdown documents exist.
The structural 600-requirement fixture (one epic, no dependency edges) produces **100
candidate workflow packages instead of 1,800 legacy record/lens checks**, with every target
record included and original human evidence retained in each package. This measures task
fragmentation only, not equivalent semantic coverage, useful gaps, actual calls or cost.
Live semantic quality, actual model cost/latency, workflow naming/curation, discovery of
undeclared cross-epic boundaries and user-facing comparisons against legacy discovery
remain unqualified/follow-on work. No existing milestone exit criteria are marked complete.
