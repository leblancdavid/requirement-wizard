# Prefix-preserving auxiliary-field merge

## Scope

2026-10-20. This is the next **opt-in evaluation**, not a browser/terminal search rollout.
Run `npm run test:retrieval:merge` (also included in `npm test`). The original baseline
corpus/queries/tests and previous density/sampling comparisons are unchanged.

`src/core/gap-prefix-aux.ts` implements `prefix-aux-v1`. An optional search dependency on
`DiscoveryService` allows deterministic tests to select it through the real planner,
service, SQLite checkpoint, exact-loader and transactional publication path. All existing
browser/terminal/provider service construction omits that dependency and continues to use
the original `searchSavedEvidence`. No setting, CLI flag, prompt recommendation or automatic
policy switch enables the candidate. There are no live model calls or user-data imports.

## Algorithm and fixed budgets

1. Scan **exactly the original primary prefixes**, in saved requirements → questions →
   sources → research order. Use unchanged literal all-term matching of IDs, epic IDs and
   primary text, case-insensitively with NFC normalization. At most 5,000 omitted records,
   1,000,000 primary text characters and 4,096 per primary record. Stop admitting records
   at the original whole-window/character/record bounds, while counting the unexamined tail.
2. Preserve every offered primary handle **and label in its original position**. No density
   score, sorting, sampling, synonym expansion or shortening to 3,072 characters is used.
3. Only if primary results leave a free slot, examine auxiliary prefixes of already scanned
   records that did not match primary evidence. For each such record, split its unused
   `4,096 - primaryLength` allowance equally among auxiliary fields. All auxiliary reads
   share the remaining `1,000,000 - primaryCharacters` allowance. Check lengths before reads;
   stop at the first whole auxiliary bundle that cannot fit. No previously unexamined
   primary record can enter through this pass.
4. Fill free result slots with auxiliary matches in saved order. Terms can be distributed
   across the primary/metadata and auxiliary prefixes; this is not phrase entailment. A
   bounded auxiliary pass that was started finishes within those limits to count further
   matching records omitted. Primary matches are never duplicated or displaced.

Auxiliary fields: requirement rationale/acceptance, question explanation/options and research
title/captured excerpt. Human review notes are not searched. Sources have no auxiliary text.
If primary results already fill the requested limit, no auxiliary pass starts. Thus the
merge intentionally cannot improve the ambiguous “seal” result at limit two: two primary
distractors still occupy both slots. Preserving prefix results and adding new candidates
at fixed capacity necessarily limits what can improve.

The 5,000-record allowance counts distinct primary records; auxiliary work revisits only
those identities. The algorithm retains at most 5,000 record descriptors/term-match arrays
between phases, not a persistent or unbounded text index. It adds local bookkeeping and
auxiliary matching work; unchanged ceilings do **not** mean equal CPU/memory or text cost.
Record ordering/omission enumeration still traverses saved metadata, as production does.

The existing **two navigation stages, three cumulative model attempts and 96,000-character
context/output caps** are untouched. Every offered handle remains navigation only; a
separate exact-load call is required before citations or changes. This is not a way to
truncate human constraints, replace evidence with labels, or treat a finding as approval.

## Measured results through the actual service

The 12 frozen field-service queries and ten museum queries each run independently with
both default and candidate search: **44 measured service jobs** with deterministic adapters
(in addition to fixture setup and recovery-control jobs).
No desired IDs are supplied to adapters as a fallback. Adapters search once, explicitly
load every offered handle, then ask a pending applicability question citing exact loaded
records. Exact primary **and auxiliary fields**, mandatory human constraints and review
addenda (including CRLF/spaces) are asserted in the detailed context. Empty results throw
an explicit fixture blocker rather than recording a misleading completed gap check.

| Domain / policy | Desired handles found | Desired handles exactly used | Actual cumulative adapter attempts |
| --- | ---: | ---: | ---: |
| Field service / current | 7/13 | 6/13 | 30 |
| Field service / prefix-aux-v1 | 8/13 | 7/13 | 31 |
| Museum / current | 5/11 | 5/11 | 24 |
| Museum / prefix-aux-v1 | 8/11 | 8/11 | 27 |

Totals cover those measured jobs, excluding setup and assertion-only local comparisons;
they sum independent tasks, not a larger per-task allowance. Successful search → load →
analysis takes three actual adapter attempts; intentional misses and oversized loads take
two and publish no task check. More successful tasks account for the larger total attempt
count; the per-task budget did not grow. Unlike the original baseline's explicit paging
cases, **neither side pages in this comparison**. These totals must not replace the original
33-attempt baseline, or be compared as if that navigation policy were identical.

Observed gains and retained failures:

- Field-service cold-chain rationale: now discovered, exactly loaded and cited. Ordinary
  primary scanning remains 1,483 records / 209,050 characters. When an auxiliary pass runs,
  it reads up to 107,822 additional characters across 764 already scanned records.
- Museum transfer acceptance, historical insurance explanation and research title: now
  discovered/loaded/cited. Primary scanning remains 1,193 records / 150,937 characters;
  auxiliary passes read 66,062 more characters across 533 records when slots are available.
- Museum legal hold retains its original first position rather than losing to terse label
  distractors. Silver tarnish at character 2,500 remains discoverable. A separate control
  also preserves a long requirement's match beyond character 3,072.
- Both opposite upload/loan observations remain available; no consent or preference is
  inferred. Saturated primary windows do **zero** auxiliary text reads.
- The record-bound escrow tail remains unexamined: 5,000 primary records / 897,669 characters,
  983 unexamined. The remaining allowance admits 102,246 auxiliary characters across 703
  already scanned records, not new tail records.
- The character-bound generator rule remains missed: 991 primary records / 996,636 characters,
  742 unexamined. Only 3,224 auxiliary characters across 21 records fit before the next
  auxiliary bundle is rejected. No smaller later bundle is secretly read.
- Paraphrases, hazmat suffix, fumigation middle-window and text beyond the explicit range
  remain misses. The large incident chronology remains discoverable but blocks exact loading.
- Ambiguous seal still completes using two distractors and misses custody. Job completion
  still must not be counted as desired-evidence retrieval success.

Every matrix row asserts that candidate primary results exactly equal the default's entire
offered prefix list before any additions. Saved requirements/approvals, sources, research,
historical questions, old revisions/jobs, prior gap checks and a current fingerprinted
implementation assessment remain unchanged. Only successful grounded analysis creates a
new pending question; blocked cases publish no revision/check. The first-query fixtures are
curated diagnostic samples, not independent/blind customer relevance annotations, model
query-quality measurements, live semantic evaluation or proof of exhaustive coverage.

## Receipts, checkpoints and upgrade compatibility

An optional versioned `searchResult.policy` receipt labels new candidate results:

```text
{ format: 1, id: "prefix-aux-v1", primaryCharacters, auxiliaryCharacters,
  auxiliaryRecords, auxiliaryLimitedRecords }
```

The top-level saved-search format stays **1**. Experimental limitation text is distinct
from the old prefix-only statement; the schema requires it together with the policy tag,
checks aggregate character bounds and record counts, and rejects unknown policy versions.
`prefixLimitedRecords` continues to describe primary prefixes only; auxiliary limits have
their own count. `unexaminedRecords` describes primary records not scanned, **not** an
exhaustiveness claim for auxiliary fields. In particular, zero primary omissions does not
mean all auxiliary text was searched. `omittedMatches` counts additional matching handles
from the bounded passes that actually ran, not unknown matches outside their bounds.

New candidate results intentionally offer **no continuation**. They must not reuse the
old cursor offsets for different field/merge semantics. Existing witnessed legacy cursors
are delegated to the original search function and retain the original snapshot, saved order,
query/limit/scope binding and old semantics. Invented/stale cursors still fail. Candidate
receipts cannot carry forged old page metadata. This leaves full candidate paging as future
work, not an implied feature or a reason to expand request allowances.

Real SQLite recovery tests cover:

- interruption immediately after committed candidate search, repeated reopening, an
  unrelated revision, then exact load/analysis with **three total attempts** and no new search;
- an older prefix receipt with neither `page` nor evidence basis, unchanged on disk and
  adopted from its immutable original input hash before compatible retry (no invented policy);
- candidate final-response checkpoint publication under the default service after reopening
  and a compatible navigation-only revision, with no fourth request;
- changed human evidence in the **loaded** area blocking final reuse while preserving the
  original response, with no automatic replay or new gap check;
- navigation-only citation rejection, followed by reopen/load/retry exhaustion at three
  attempts without resetting budgets across policies;
- unknown future policy versions rejecting reads on repeated reopen without overwriting
  their raw payload or the saved project.

Saved receipts are reused **as issued**, not rerun to improve discovery under a different
policy. Navigation remains advisory and excluded from the authoritative evidence basis;
loaded records and all human constraints remain binding. SQLite **3**, retrieval work **1**,
execution **1**, workspace **2**, gap-check and assessment identities do not change. There
is no startup rewrite, data conversion, reset or reassessment. Old readers are not qualified
to open experimental policy receipts; the candidate is not enabled for user databases.
See the [migration ledger](migrations.md#prefix-preserving-auxiliary-merge-evaluation-2026-10-20).

## Findings and next gate

This isolates a useful field-coverage gain without the measured density/sampling regressions
on these cases. It is **not a production qualification**. Before considering rollout, obtain
independently authored relevance cases, review the field-cost and saturated-window limits,
and decide whether candidate paging/auxiliary omission UI is required. Add browser/API
integration coverage for an enabled candidate and explicitly review compatible receipt
behavior on an actual deployment. Do not simply enable the constructor hook globally.

## Verification history

The initial seven targeted tests and type checking passed. After extending recovery coverage,
one run passed 10/11: the proposed “unrelated” note was actually in the newly loaded record's
feature, and the service correctly rejected stale final evidence. The test assumption was
corrected, not the safety behavior: retain the loaded-area change as an intentional blocker
and add a genuinely compatible navigation-only revision case. The next targeted run passed
**12/12**, including exact auxiliary-field checks, future-policy reopening and budget controls.
No corpus/query/desired handle was tuned and no failed browser run is hidden by retry.

Final type checking, both CLI help entry points and **446/446 deterministic tests** passed on portable Windows Node
**22.23.3**, including the unchanged baseline and earlier comparisons, migration/reopen
tests and all new service-level merge checks. `git diff --check` passed with Windows LF/CRLF
conversion notices only. The system Node installation remains **20.11**.
UI production build and all four serial browser checks passed on the first
`npm run test:browser:all` run for this step, with no whole-test retries. These browser
checks exercise the unchanged default policy, not an enabled candidate UI. The existing
>500 kB minified-chunk warning remains. No live calls, user-database changes, commits or pushes.
