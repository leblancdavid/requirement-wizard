# Definition coverage and discovery status

Implemented 2026-10-23 for RW-019. Definition coverage estimates recorded product
decisions; it is not readiness, code completeness, or verified delivery to main.

## Refresh the overall view

Open **Overall progress → Refresh definition coverage**. Expand Definition coverage
for per-area refresh actions, explanations and linked evidence. The refresh:

- Assesses complete current areas separately, with project/dependency guardrails and
  linked evidence. It cannot propose questions, edit requirements, reorganize areas,
  change global interpretation or authorize coding.
- Requires saved responses to be processed first. It never processes those responses
  or starts gap discovery implicitly. Research is disabled.
- Reuses current assessments without model calls. Unassessed/outdated areas get a
  bounded assessment covering all nine dimensions; large areas use exact batches. Missing evidence
  remains unknown; proposals/delegation/research do not establish human decisions.
- Runs at most ten attempted areas/fifteen minutes per action, using ordinary
  five-minute per-request bounds. Stop retains completed areas. Explicit refresh
  continues unfinished areas; startup/reload never initiates calls.
- When a complete area exceeds 96k, partitions the complete prepared evidence set
  into exact-record batches, never a sample or a truncated human constraint. Every
  batch is read to accumulate a bounded nine-dimension draft, then every batch
  checks that draft before publication. Verification can downgrade findings or raise
  importance, never add positive coverage. Indispensable unresolved relationships
  block rather than being guessed. See the staged protocol below.

Definition freshness now compares versioned SHA-256 identities of relevant saved
inputs, not the optimistic-concurrency revision counter. Inputs conservatively
include the area, project-wide records, transitive declared dependencies, linked
evidence, superseding sources and explicitly cited assessment evidence. Project-wide
assessments also track the active epic map. Relevant changed/new/removed records
invalidate coverage; model selection, another assessment, an empty discovery pass,
and unrelated area changes alone do not. This is bounded declared dependency/record
tracking, not inferred exhaustive impact analysis. See [upgrade behavior](migrations.md#definition-coverage-freshness-and-near-limit-staging-2026-10-23).
When completed areas are current but other areas have no assessment, the aggregate
label is **Assessment incomplete**, not **Assessment outdated**. Old evidence is
labelled outdated only when it actually needs rechecking. Per-area states remain
current/outdated/not assessed; partial batch work cannot make one current.

## Discovery is a separate ledger

The progress dialog also shows the latest available workflow discovery report,
separately from definition coverage. Reports explicitly distinguish reviewed,
pending, waiting for decisions and evidence-blocked packages. Examined-prefix counts
are not whole-project totals. Old reports retain their saved revision/scope and are
not silently presented as current completeness. Recent browser job history is bounded;
absence of a report does not establish that no discovery has run.

No new questions may mean no consequential gaps were found in a reviewed package,
unpublished staged drafts are still being checked, or other packages could not be
reviewed. Blocked packages are never counted as reviewed. **Discover missing
decisions** still cannot refresh whole-area definition assessments.

## Large-area assessment and continuation (follow-up, 2026-10-23)

`exact-batches-v1` fixes the reported 145,769 / 96,000 whole-area dead end without
raising the input cap. Exact record links may cross batches; an unread link is not
authority to cite its contents. Human evidence stays exact across the complete
partition. Partial findings remain unpublished; earlier assessments stay dated and
outdated until all read/verification stages finish. Independent batch checks cannot
prove all cross-batch relationships: saved assessments explicitly identify this
method and cap confidence at medium. Missing decisions remain unknown/partial or
needs-review, not artificially defined.

There are at most sixteen batches / 32 stages, a 12k accumulated assessment draft
cap, three spent attempts per unfinished stage, and 32 requests per explicit staged
area action within the existing fifteen-minute refresh window. Each request also
has a five-minute timeout. Oversized individual records, over-sixteen-batch areas,
missing records and model-identified indispensable missing evidence stay explicit
**Evidence blocked** outcomes, not successful reviews or silent truncation.

**Refresh definition coverage** or **Resume processing** after a paused/cancelled/failed
assessment continues saved stages. Ordinary Discover missing decisions remains gap
discovery. Compatible saved partitions/attempts take priority even if a newer local
preparation could fit a single context. Restart never initiates calls. A completed
final checkpoint can publish after recovery without repeating inference. Relevant
input changes preserve earlier work as history rather than publishing it as current.
Portable continuation retains current partitions, exact receipt identities and
original stage/model provenance, without account credentials or runtime sessions.
The migration ledger describes format checks and recovery.
Resume uses the saved assessment area unless the feature filter selects another;
the drawer labels that scope explicitly. To continue all other areas, use the global
**Refresh definition coverage** action; already-current areas need no new calls.

Follow-up verification (2026-10-23, Windows Node 22.23.3): type check/UI build,
91 pretests and 647 main tests passed. Portable and specification browser runners
also passed separately. The focused workflow browser runner includes
the new large-area assessment, a saved stage through reload, no premature coverage,
final publication and mobile layout. The full browser command still reaches the
previously documented **Approve resolution** failure at `src/web/browser-check.ts:1352`;
the aggregate suite is not claimed passing. No live inference or personal-project
database migration was performed.

## Near-limit exact evidence

New otherwise blocked indivisible workflow leaves can try
`staged-current-spec-v3` after existing staged policies fail. This combines the
current-specification projection with an **8,000-character accumulated draft
reserve**, rather than v2's 12,000. It leaves more room for exact human constraints
under the unchanged 96,000-character input ceiling. The model is told to return
fewer concise proposals; existing drafts and evidence are never truncated to fit.
Over-reserve drafts fail explicitly. Generated background projection has the same
conservative unique-answer/supersession rules as ordinary current-spec contexts.

This is a proposal-capacity tradeoff, not a provider-context increase or a guarantee
of useful gaps. All discovery/validation batches must finish before publication.
Compatible older stages reconstruct under their original policy, reserve and spent
attempts. Original reports remain history. Local size/batch-limit CPU receipts can
be reconsidered once under v3 without replaying model work or clearing true saved
model/attempt blockers. See [workflow review](epic-workflow-review.md).

Deterministic checks cover refresh scope/preservation, unrelated/relevant changes,
unknown dimensions, malformed/unseen citations, cancellation/staleness, indivisible
oversized no-call outcomes, original-snapshot legacy upgrade/reopen, API bounds and unprocessed
input rejection. Synthetic staged regressions reproduce the supplied 97,489–99,403
character failure totals, exercise the reduced draft cap and retain checkpoints
through SQLite/portable reopen. These are not the user's actual evidence chains or
live model qualification. Browser verification covers refresh, no-call reuse, reload,
separate blocker status and mobile layout in the focused workflow runner.

Initial-slice verification (2026-10-23, Windows Node 22.23.3): type check, UI build, `npm test`
(79 pretests / 646 main tests), focused workflow browser checks, portable browser
checks and specification browser checks passed. The full browser command was run;
after updating its progress-section count for the new sections, it reaches the
previously documented missing **Approve resolution** control at
`src/web/browser-check.ts:1352` and stops. The aggregate browser suite is not passing.
The existing >500 kB UI bundle warning remains. No live inference, personal-project
database changes or packaged Electron verification were performed.
