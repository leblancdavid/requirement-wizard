# Bounded first-query candidate evaluation

## Scope and reproducibility

2026-10-20, deterministic and offline. Run `npm run test:retrieval:evaluation` or `npm test`.
The original [baseline corpus, queries and service/checkpoint tests](retrieval-baseline.md)
are unchanged. Production `gap-navigation.ts`, service, prompts, cursors and saved formats
are unchanged. **No candidate is enabled in the application.**

Test-only code in `src/core/fixtures/retrieval-candidates.ts` compares four policies over
the original 12 field-service queries and ten additional museum-collection queries:

| Policy | Matching and ordering | Sampling |
| --- | --- | --- |
| saved-order | Calls actual production first-query search | Original prefixes and saved record order |
| ranked-prefix | Same literal all-term eligibility; term-occurrence count divided by square root of scanned text length, ties in saved order | Same prefixes/record window as production |
| ranked-fields | Same density ordering, terms can occur across explicit fields | Primary field gets 3,072 characters, remaining 1,024 split across auxiliary fields; single-field sources retain 4,096 |
| sampled-fields | Same field allocation and ordering | Spread at most 5,000 record positions uniformly across omitted saved records; long fields sample quarter head, quarter middle, half tail |

Additional fields are requirement rationale/acceptance, question explanation/options and
research title/captured excerpt. Human review notes are **not** added to candidate search.
IDs and epic IDs remain eligible literal navigation matches; density uses only scanned
text, not ID occurrences. These are literal substring experiments, not tokenization,
stemming, synonym expansion, embeddings, negation understanding or preference inference.

All candidates retain the existing local ceilings: **5,000 text-scanned records**,
**1,000,000 scanned text characters**, **4,096 per record**, at most two returned handles
for this comparison and no text beyond character **65,536** of a field. Lengths are checked
before slicing/normalizing. As in production, scanning stops at the first whole record
window that does not fit; it does not secretly examine smaller later records. Sampling
changes which positions/windows receive the allowance, not the allowance itself.

The experiments enumerate saved metadata to count positions, then visit selected records.
`inventoryVisits` reports that overhead separately from text scans; it is not bounded to
5,000 and can approach twice the catalog size. Production also traverses the inventory
to count unexamined records; the experiment's extra pass is a real additional local cost.
These visit counts describe each search algorithm, excluding comparison instrumentation
(such as the production branch's extra length-counting pass and repeated determinism checks).
No latency, token-cost, memory or cross-machine performance qualification is claimed.

The second domain (`src/core/fixtures/retrieval-heldout.ts`) has **1,197** saved records:
452 requirements including the focused task, 81 retired questions, 663 human/captured
sources and one dated synthetic research record. It covers accession, loans, transfers,
conservation and visitor access. Cases deliberately include opposite loan rules, a short
irrelevant-label ranking trap, paraphrase and out-of-range misses, an early-window hit
that sampling loses, and a middle-window hit. This set was not used in the original
baseline, but is **not a blind independent holdout**: the same author defined the generic
policies and second-domain cases before the first comparison. Do not treat aggregate
scores on these curated examples as customer retrieval quality or tune away these failures.

## What is actually measured

Each JSON row records returned handles, desired handles found, text scan/character counts,
unexamined records, omitted eligible matches, limited records, metadata visits and context
sizes. Selected handles are put in explicitly experimental navigation, **not forged into
production search receipts/cursors**. Production navigation validation rejects citations
before loading. The actual `nextGapContext` planner/loader then loads full saved records;
tests require detailed IDs, entire primary text, mandatory human text and the unchanged
96,000-character context cap. Normal final/reference validators accept only the loaded
records. Oversized evidence remains blocked. Inputs and persisted fixture projects are
unchanged by evaluation.

`Loadable` below means exact context construction and citation validation succeeded locally.
It is **not** an adapter attempt, published proposal, durable candidate checkpoint or live
analysis result. There are **zero candidate model/adapter requests**, no request-budget
extension and no projected attempt count presented as actual telemetry. The unchanged
baseline separately exercises real search → load → analysis, three cumulative attempts,
checkpoint recovery, approvals/history and current implementation assessments. Candidate
end-to-end service integration and upgrade/cursor behavior remain qualification work before
any production promotion.

The original catalog variants and desired handles are reused without edits, but this
comparison's focused synthetic task is different. Its context sizes therefore differ from
the original baseline report; they are not an updated baseline. `limitedRecords` is relative
to the candidate's searched fields/windows and is not identical in meaning to production
prefix telemetry. Matching across separate sampled windows can find a co-occurrence that
does not establish a contiguous phrase; full exact loading remains essential.

## Results

| Domain / policy | Desired handles found | Desired handles loadable | Total scanned characters across queries | Total text-scanned records |
| --- | ---: | ---: | ---: | ---: |
| Field service / saved-order | 7/13 | 6/13 | 3,984,805 | 20,821 |
| Field service / ranked-prefix | 8/13 | 7/13 | 3,984,805 | 20,821 |
| Field service / ranked-fields | 9/13 | 8/13 | 5,166,430 | 20,767 |
| Field service / sampled-fields | 11/13 | 10/13 | 5,165,126 | 20,795 |
| Museum / saved-order | 5/11 | 5/11 | 1,509,370 | 11,930 |
| Museum / ranked-prefix | 4/11 | 4/11 | 1,509,370 | 11,930 |
| Museum / ranked-fields | 7/11 | 7/11 | 2,169,990 | 11,930 |
| Museum / sampled-fields | 7/11 | 7/11 | 2,169,990 | 11,930 |

Totals above sum independent first queries, not a per-task allowance. All individual queries
stay within the original local ceilings. Ranking-only tests additionally assert identical
scanned counts/characters to production. Equal-length ties preserve saved order; a boundary
regression checks 244 whole 4,096-character records (999,424 characters), with the final
record unexamined and no hidden text overspend.

Key gains **and regressions**:

- Density ranking retrieves the field-service custody seal, but promotes two short museum
  “Hold” labels over the longer legal restriction. It is not a generally safe ranking upgrade.
- Field-aware matching adds the cold-chain rationale and museum acceptance/explanation/title
  hits. It reads about 43.8% more text per ordinary museum query (216,999 versus 150,937).
  Under the field-service record-bound variant it consumes the character allowance earlier:
  4,972 scanned / 1,011 unexamined rather than production's 5,000 / 983. Extra fields are not free.
- Sampling finds the saved hazmat suffix and subcontractor escrow tail on the first query.
  For the 5,987-record variant it scans 5,000 positions / 998,555 characters and visits 11,974
  metadata entries. The desired handle is included, but 983 other records remain unexamined.
- Museum sampling gains fumigation clearance but loses silver tarnish at character 2,500.
  The aggregate 7/11 hides this swap. No claim of a monotonic improvement is justified.
- The character-bound generator rule still misses for **all** policies. Field-aware/sampled
  candidates examine 965 records with 768 unexamined, versus production's 991 / 742. Front-loaded
  bulky logs still consume the budget; uniform record positions do not solve character fairness.
- Paraphrases remain misses in both domains. Text beyond the explicit window range stays
  missed. Both positive/negative rule handles remain discoverable; neither becomes human consent.
- The incident chronology remains discoverable but not loadable under every candidate. No
  summarization, truncation or cap increase is used to manufacture a successful result.

## Recommendation

**Do not promote density ordering or replace prefix search with sampling yet.** Prioritize
a separately reviewed field-aware candidate with explicit field-budget tradeoffs, while
preserving existing prefix coverage where possible. Evaluate a bounded merge of current
saved-order results and ranked candidates rather than replacing all candidates on density.
Keep the museum legal-hold and early-window regressions as hard comparative evidence.

For suffix/tail coverage, investigate a fair per-record text allocation or bounded local
index in a separate experiment, recording index-build/update costs and provenance. Do not
increase model attempts, silently read unmetered text or erase omitted-record telemetry.
Before production promotion, add independently authored domain/query annotations, exercise
the actual service/checkpoint path with versioned search/cursor semantics, and verify legacy
receipt reuse without resetting checks or replaying model calls. Semantic retrieval remains
deferred; these measurements do not justify choosing an embedding system.

## Verification and compatibility

Initial type check and both comparative tests passed. Review then found an experiment-only
accounting/confounding issue: the first implementation skipped oversized windows and tried
smaller later records, and sliced text before checking the aggregate allowance. That was
corrected to the production stop policy and length-first accounting; the ranking-only
scan-equivalence and whole-window boundary assertions guard it. Preliminary results are not
the table above. No corpus, desired handle or ranking weight was adjusted after measuring.

Production SQLite/retrieval/execution/workspace versions, checks, freshness identities,
approvals and persisted data remain unchanged. No user database, live call, system Node
installation, commit or push is involved. See [migration ledger](migrations.md#bounded-retrieval-candidate-evaluation-2026-10-20).

Windows portable Node **22.23.3**: type checking, both CLI help entry points and **434/434 deterministic tests** passed,
including the unchanged service/checkpoint baseline, existing upgrade tests and all three
new comparative/accounting tests. Diff checking passed with Windows LF/CRLF notices only.
The system Node installation remains **20.11**; no dependency rebuild was needed in this step.
`npm run test:browser:all` passed on the first run: UI production build and all four serial
browser checks (reliability, full workspace, exact retrieval and saved navigation). No
whole-test retries were used. The existing >500 kB minified-chunk warning remains.
