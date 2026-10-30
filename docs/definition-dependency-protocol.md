# Definition dependency-proof protocol

Status: **inspection-only dependency comparisons**, with an implemented local
[publication-certificate layer](definition-publication.md), not an automatic skip
feature. `src/core/definition-dependencies.ts` now supports optional app-owned certificates
at validated definition publication. No scheduler, browser API or renderer uses its
comparison results to skip work.
This is the next foundation for [workflow consolidation, phase 4](workflow-consolidation.md#phase-4--safely-reduce-rechecking).

## Trust and authority

A citation is evidence, not an exhaustive dependency declaration. In particular,
an old review cannot cite a future decision. Neither a model's `exhaustive: true`
assertion nor an unchanged list of citations establishes independence.

The prototype constructs an app-owned format-1 `definition-dependencies-v1` manifest
from the **exact original assessed revision**, with an existing matching v1 input
basis. The builder rejects later snapshots, missing/mismatched bases, schema projection
that drops/converts values, and unknown fields. It does not stamp today's inputs as
old evidence. Callers must obtain authoritative snapshots from the store; hashes do
not authenticate arbitrary model/user-supplied replacement history.

Inspection re-creates the entire manifest from that same original snapshot. Shape
validation or a self-consistent model-supplied hash alone is insufficient. A different
project, area, review, dimension, answer version or staged-review identity cannot
inherit another finding's proof. The current whole assessment must be unchanged.
Unknown/missing dimensions do not count as reviewed dimensions.

Every manifest and inspection result has `authority: "inspection-only"`. Inspection
results use format 1, policy `definition-dependency-proof-v1`. The positive result is
`unchanged-guarded-inputs`, **not** permission to skip, mark findings resolved, approve
requirements or claim model requests saved. It proves equality under the declared
guard policy, not that the model considered every record or that the findings are
correct. The separate publication/coverage layer now supplies optional factual local
evidence; this alone is not sufficient to activate skips.

## Manifest v1

The bounded manifest contains no evidence/finding prose:

- Project and area IDs, original assessment revision, existing v1 input-basis key,
  and a digest of the full original assessment (including answer/staged metadata).
- One dimension/finding digest per saved finding. Every finding uses the same
  `whole-area` guard. Partial/unknown findings remain partial/unknown.
- A shared ID/kind/content-digest inventory for guarded sources, questions,
  requirements and research evidence. Record identities are namespaced by project;
  duplicate cross-kind IDs are rejected, not disambiguated by guessing.
- Guarded-area membership plus population, organization, origin and interpretation
  digests. Interpretation covers summary, goals, actors and assumptions. This is an
  additional conservative inspection guard; it does **not** change saved v1 freshness.

Construction begins with the existing conservative v1 area/project/transitive
dependency/evidence scope. It then closes over explicit source/evidence links, question
answers, requirement links, scoped-response targets, answer-derived authority, and
both backward and forward supersession links. An external record expands its entire
owning area and that area's transitive dependencies, not just its cited text. The
population guard includes **all** records in those areas. New uncited records,
removals, moves, new superseders and newly introduced dependencies therefore invalidate
the shared guard. Project-wide records and the original initial idea participate.
For a project-area review, organization additionally guards all active area definitions.

Missing references/areas and archived required areas stay unproved. Supersession cycles
are ambiguous; ordinary question/answer cycles are legitimate and traversed with
visited sets. Area/evidence identities and dimension identities must be unique.
Property ordering is normalized by the schema reader without value/field conversion;
evidence array order, wording, statuses and provenance remain exact. Keyed record
inventories and area sets have an explicit stable sort, not inferred semantic ordering.

All findings fall back together when this shared guard changes. V1 deliberately
offers **no** within-area independence claim. Unrelated area changes or local model
routing can leave the guards unchanged, but the result remains inspection-only.

## Inspection and stale-result safety

`inspectDefinitionDependencies` requires the original snapshot, manifest, current
snapshot, selected dimension, and an expected project/area/revision/content token.
The content token covers the complete schema-read current project, detecting
equal-numbered adoption as well as ordinary revision changes. A token is only a
view binding; any future write must recompute it inside the write transaction.

The result is either:

- `unchanged-guarded-inputs`: dated manifest/finding identities and current content
  token, with inspection-only authority; or
- `whole-area-review`: a bounded reason, such as missing dependency, changed guard,
  changed assessment, invalid origin/manifest, ambiguity, stale view or read limit.

Fallback is a recommendation for existing explicit/authorized review, **not dispatch**.
It grants no allowance and starts no request. Invalid original evidence is never
replaced with an earlier history candidate. A changed or unsupported policy does not
silently downgrade to citation-only comparison.

Bounds are **16 MiB per snapshot**, **2 MiB per manifest**, **8,000 evidence records**,
**64 areas**, and **64,000 explicit record/area/finding references**. All bounds return
unavailable/fallback, never truncated evidence or a shortened successful manifest.
The prototype accepts in-memory snapshots; future storage readers must enforce byte
bounds before reading/parsing database payloads. Large-project preparation performance
and live provider quality are not qualified by these deterministic bounds.

## Activation gates — not implemented

1. **Publication provenance (local evidence slice implemented):** optional certificates
   now commit atomically with validated assessment-only refreshes, binding original
   input/publication snapshots and app-owned context/response witnesses. Single and
   staged coverage is revalidated; unread broader guards and missing older witnesses
   suppress issuance without invalidating valid saved work. Loading a stored result
   or trusting an AI declaration cannot self-issue evidence. See [scope and limits](definition-publication.md).
2. **Finding-level narrowing:** define a new versioned policy for exhaustive positive
   dependencies, population/absence guards, global interpretation, scope and negative
   assumptions. A partition must account for new/removed evidence and cross-area
   interactions. Without a sound partition, retain the v1 whole-area guard/fallback.
3. **Mixed publication (origin preview foundation implemented):** an internal read-only
   preview now retains each selected finding's verified original date, source job and
   evidence identities under shared whole-area guards. It always disables publication
   and leaves joint consistency unproved; it neither restores nor rewrites findings.
   A separate explicit [joint validation task](definition-joint-review.md) now saves
   model judgement over all nine selected originals/current evidence, with bounded
   requests, durable response recovery and stale-token checks. It does not grant
   publication or narrower independence. Saving a mixed result, sound narrower
   partitions and atomic stale-publication checks remain unfinished. Never rebase an old finding's date/evidence
   onto a new assessment revision. See [original finding provenance](definition-finding-origins.md).
4. **Continuation and consent:** integrate only with the existing authorized coordinator
   and durable job/attempt ledgers. Stop, limits, restart and worker conflicts must retain
   completed calls and require existing explicit continuation. No new automatic workers.
5. **Forward compatibility:** any saved manifest/per-finding schema needs its own ordered
   migration, unsupported-future rejection and preservation/reopen/failure-retry tests.
   Preserve existing current reviews and their semantic identities without requiring
   fresh inference merely to gain the new representation. Missing historical witnesses
   remain unavailable; do not fabricate provenance from current inputs.
6. **Qualification:** record actual dispatched/skipped operation provenance separately
   from candidates, benchmark preparation versus requests, test adversarial dependency
   boundaries and mixed-result races, and qualify live quality with human-reviewed cases.
   Synthetic tests do not establish provider performance or safe semantic independence.

## Compatibility and checks

The initial prototype added no persisted fields and kept SQLite at 14. The subsequent
publication layer adds local tables through SQLite **14 → 15**, without changing project,
execution (schema 2), job, portable or saved v1 assessment/context/checkpoint keys.
Older receipts and previous ordering-repair behavior are untouched. Older portable
data without original raw provenance does not acquire new proof. See the
[publication ledger](migrations.md#definition-publication-certificates-2026-10-29) and
[initial prototype history](migrations.md#definition-dependency-protocol-prototype-2026-10-29).

`src/core/definition-dependencies.test.ts` exercises new uncited area/dependency/global
decisions, linked external-area population expansion, scope/authority/supersession
links, missing/cyclic/ambiguous evidence, array/wording/answer changes, exact original
provenance, forged/narrowed/future manifests, content-bound same-numbered adoption,
unchanged unresolved findings, unrelated edits and bounds. Run:

```powershell
npx tsx --test src/core/definition-dependencies.test.ts
```

Verification for the initial prototype slice: all **31 protocol tests**, full **1,165-test** deterministic
suite, type check, UI production build and diff check passed. Browser runners were not
rerun for this unwired core-only change. The existing bundle-size warning remains.
No live inference, personal-project changes, commits/pushes or packaging were performed.
