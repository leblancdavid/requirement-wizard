# Narrower definition boundaries: adversarial experiments

Status, 2026-10-30: **offline refutation harness implemented**, not an automatic reuse
policy or semantic-independence proof. Nothing in the application imports its results
to publish assessments, change freshness, skip checks or grant AI/coding permission.

```powershell
npm run qualify:definition-partitions
npm run --silent qualify:definition-partitions > partition-experiment.json
npx tsx --test src/core/definition-partition-evaluation.test.ts
```

The command uses only authored synthetic fixtures. It accepts no project/database/
provider input, starts no app/server, accesses no credentials/network and makes no model
calls. Its JSON includes case labels and observations, not source/finding prose, project
identifiers, hashes or original dates. It is not a user-data anonymizer or usage report.

## What is tested

`definition-partition-evaluation.ts` compares two deliberately **experimental** narrower
projections with the existing whole-area and project-evidence controls:

1. **Citations-only:** exact contents of the finding's directly cited records. This
   intentionally represents the unsafe assumption that citations are exhaustive.
2. **Question-category mask:** preserve all non-question project evidence and question
   identity/category/status/links/population/option counts, but hide question/option prose
   in categories other than the selected dimension. This is substantially stronger than
   merely selecting questions with matching labels, yet still assumes those labels bound
   influence. It is experimental masking, never an actual context/freshness projection.
3. **Whole-area control:** the existing v1 dependency manifest/inspection, unchanged.
4. **Project-evidence control:** the existing conservative combined-assessment guard,
   unchanged. It can invalidate more than the whole-area control by design.

The fixture set has **18 must-detect mutations** and **4 may-ignore controls**, initially
evaluated for a rules finding. Mutations cover cited edits, uncited additions in local/
dependency/global areas, removals/moves, differently categorized question/rationale/option
prose, reclassification, answers, new superseders, cross-area references, dependency
topology/purpose, acceptance order and global interpretation/summary. Controls cover
unchanged inputs, local routing, receipt prose and an explicitly unrelated area edit.
The tests also exercise all nine selected dimensions.

Must-detect means the authored scenario introduces potentially relevant evidence requiring
reconsideration. It does **not** establish a new human preference, approve a proposal,
resolve a gap or prove that the original conclusion is false. Original partial/unknown
findings, provenance and keys are never altered.

## Observed finite-corpus results

The executed rules-finding corpus produced:

| Projection | Required changes detected / 18 | Missed required changes | May-ignore controls invalidated / 4 |
| --- | ---: | ---: | ---: |
| Citations-only experiment | 1 | 17 | 0 |
| Question-category mask experiment | 15 | 3 | 1 |
| Existing whole-area control | 18 | 0 | 0 |
| Existing project-evidence control | 18 | 0 | 1 |

The category experiment misses changes to a **data-category** question's wording,
rationale and option consequences that affect recovery **rules**. Preserving populations,
links and all other evidence does not make those omitted words irrelevant. Categorizing
the same example as a data finding happens to detect the changes; that is not proof that
the category boundary works for other evidence or dimensions.

These are authored counterexamples, not representative error rates, model quality scores,
provider enforcement checks, performance timings or actual requests/money saved. A finite
suite can **refute** a candidate boundary; absence of a counterexample cannot qualify it.
The unrelated-area control also demonstrates the intentional conservatism of the current
combined guard, not automatic permission to remove that guard.

## Fail-closed experiment contract

Each run has at most **64 distinct case identities**; excess/duplicates/invalid labels
reject rather than truncate. Snapshots retain the existing **16 MiB**, record, area and
reference bounds. Exact schema/read identity, original assessment/input basis, selected
finding identity, missing links and ambiguity are checked using the existing dependency
protocol before candidate observations are made. Unsupported combined/future origins,
altered findings or missing evidence remain **unavailable**, never successful equality.

Report format 1 has kind `reqwizit-definition-partition-experiment`, authority
`offline-experiment-only`, `canAuthorizeSkips: false` and `canPublish: false`. Outcomes are
`refuted-by-fixture`, `no-counterexample-in-tested-cases` or `inconclusive`. Empty or
partly unavailable non-refuted runs are inconclusive; unavailable cases never count as
passes. The CLI exits nonzero if a conservative control misses an authored required
change or cannot be compared. Expected refutation of the experimental shortcuts is a
successful experiment, not activation of an alternative guard.

All original/current snapshots are treated read-only. No persisted representation,
SQLite/execution/portable version, optimistic counter, semantic key, saved job, plan,
assessment or publication certificate changes. Existing work requires no migration,
reset or repeated inference. This report is distinct from usage export format 2 and
cannot be imported as a certificate.

## Next gate

Do not activate citation/category partitions. A viable narrower contract must account
for potentially cross-dimensional free-form prose, exhaustive positive inputs, population/
absence guards, new/removed records, global interpretation and cross-area relationships.
It must be app-enforced at the **original review**, not reconstructed as a new assertion
over old evidence. Any proposed omission needs a defensible scope contract plus further
adversarial and human-reviewed semantic evaluation. Existing provenance, atomic apply,
joint consistency and consent remain necessary but do not supply independence.

Verification, 2026-10-30: type check, **1,278** deterministic tests (574 pretests +
704 main), focused partition/dependency tests, the standalone offline report and diff
check passed. All nine dimensions plus invalid/missing/future/ambiguous/record-bound
inputs are exercised. No UI/runtime paths changed in this slice; browser/packaging/live
model checks were not rerun. No commits/pushes or live model calls occurred.
