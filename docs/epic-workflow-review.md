# Epic workflow gap review

## Implemented first slice (2026-10-21)

Use **Design → Review next epic workflow**. The feature filter restricts workflow
packages to one epic and includes declared incoming/outgoing dependency-boundary
packages. **All project areas** visits epics in saved order, then boundaries. Each
click reviews **one package**, not the entire epic or backlog; there is no automatic
model-call loop. Existing **Explore next gaps**, terminal discovery, initial
interpretation and queued answer/review follow-up retain their existing behavior.

This replaces neither old checks nor human review. It is a separate discovery path
intended to avoid three independent lens reviews of every requirement and repeated
model-driven evidence search. Live usefulness/cost improvements have not been measured.

### Local packages and evidence

- Locally group up to six active requirements, unresolved questions and human notes
  per epic. Shared explicit evidence links are preferred, excluding the ubiquitous
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

## Verification and remaining work

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
