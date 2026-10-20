# Deterministic first-query retrieval baseline

## Design and measurement limits

Established 2026-10-20 without live model calls. Run `npm run test:retrieval:baseline`;
it is also included in `npm test`. Fixture definitions are in
`src/core/fixtures/retrieval-baseline.ts`; orchestration/assertions are in
`src/core/retrieval-baseline.test.ts`. Each case emits a JSON measurement in TAP output.

The synthetic field-service rollout has 603 requirements (including the focused
visit-recovery task) across six business areas and the inbox, 161 retired questions, exact project-wide human
constraints and a human approval/addendum, captured documents/logs and dated research.
There are **1,487 saved searchable records** in the ordinary catalog, **5,987** in the
record-bound variant and **1,737** in the bulky-log variant. Counts include mandatory
records, which the search skips because they are already detailed. No customer data,
credentials, live URLs, filesystem scan or user database is used. The example.invalid
research URL is deliberately synthetic; nothing fetches it.

The catalog uses varied workflow wording with repeated regional/site structure, not
thousands of identical magic-keyword records. Fixed queries, desired handles and
expected returned handles are declared independently of the adapter. Cases include:
an existing requirement, a retired hardware question, an old captured dispatch receipt,
a historical research finding, opposite upload rules, ambiguous pump-seal versus
chain-of-custody language, a paraphrase, a rationale-only term, a suffix after character
4,096, records beyond scan bounds and an oversized exact-load candidate. Old source
handles are absent from startup navigation despite being saved. Two requirement handles
are already indexed: those cases explicitly measure search anyway, not necessity to
search. Retired-question guidance can display old wording without exposing its handle
or authorizing it as detailed evidence.

Each independent case uses a disposable SQLite store. Normal service operations create
the initial proposal, human approval/note and a completed gap check. A test-only import
populates the current saved catalog, leaving older revisions and jobs untouched. Real
`planGapContext` selection, `DiscoveryService`, search, exact loader, reference validation,
durable checkpoints and publication are used; there is no alternate search implementation.
The adapter submits the fixed first query (limit **2**), loads **all returned handles**,
then asks a neutral applicability question citing those exact records. It never receives
expected handles as a fallback. Empty paraphrase/field results deliberately throw a
fixture blocker, rather than pretending a normal empty analysis proves the task checked.
Only the three explicit continuation cases page; they then attempt exact loading and
hit the existing stage limit. This policy is deterministic, not a recommended model strategy.

An exact load counts only when a subsequent adapter request sees the handle in
`includedIDs` **and the entire original primary text**, expanded from documented lossless
text encoding. A committed load request alone does not count. Every request asserts exact
human constraint/addendum bytes (including CRLF and spaces), measured `JSON.stringify(data)`
length and the unchanged 96,000-character cap. Attempts come from saved retrieval work,
including failures/retries, rather than just counting successful replies.

These are curated diagnostic cases, not a random or statistically representative sample
of customer projects. They establish deterministic behavior at realistic catalog sizes,
not natural-language query generation, semantic understanding, ranking quality, latency,
token usage, provider compatibility or exhaustive recall. Ground truth is a small explicit
set per case, not a full relevance annotation of the catalog. The low limit intentionally
exposes displacement; it is not the maximum-eight-result recall estimate. No ranking,
search semantics, prompt policy, request allowance or context budget changed.

## Observed baseline

`Found` is desired handles offered by the **first** query. `Loaded` is desired handles
actually delivered in exact analysis context. `O/U/P` are first-search further matches
omitted / records unexamined / text prefixes limited. Context sizes are serialized evidence
data per attempted adapter request, not whole prompts or model tokens. Every initial
context is **20,960** characters.

| Case / fixed query | Found | Loaded | O/U/P | Later context characters | Attempts | Outcome |
| --- | ---: | ---: | --- | --- | ---: | --- |
| Requirement / warranty transfer | 1/1 | 1/1 | 0/0/2 | 21,759 → 21,549 | 3 | Exact question citation |
| Historical question / meter rollover | 1/1 | 1/1 | 0/0/2 | 21,746 → 21,581 | 3 | Exact question citation |
| Captured source / dispatch receipt | 1/1 | 1/1 | 0/0/2 | 21,813 → 21,427 | 3 | Exact question citation |
| Dated research / certificate revocation | 1/1 | 1/1 | 0/0/2 | 21,839 → 21,669 | 3 | Exact question citation |
| Negation / automatic upload | 2/2 | 2/2 | 0/0/2 | 21,989 → 21,643 | 3 | Both opposite rules loaded; no inferred consent |
| Ambiguous distractors / seal | 0/1 | 0/1 | 9/0/2 | 21,948 → 21,609 | 3 | Completes using two pump distractors, misses custody |
| Paraphrase / offline conflict resolution | 0/1 | 0/1 | 0/0/2 | 21,631 | 2 | Fixture stops on zero handles |
| Unsearched field / temperature excursion | 0/1 | 0/1 | 0/0/2 | 21,625 | 2 | Term is in rationale, not searched statement |
| Text window / hazmat exception | 0/1 | 0/1 | 0/0/2 | 21,620 → 21,845 | 3 | Next page finds handle, load blocked by stages |
| Record bound / subcontractor escrow | 0/1 | 0/1 | 0/983/1 | 21,626 → 21,877 | 3 | 5,000 scanned; next page finds handle, load blocked |
| Character bound / generator interlock | 0/1 | 0/1 | 0/742/228 | 21,625 → 21,881 | 3 | 991 scanned; next page finds handle, load blocked |
| Oversized load / incident chronology | 1/1 | 0/1 | 0/0/2 | 21,882 | 2 | Exact expansion exceeds 96,000; no analysis call |

Ordinary searches examine 1,483 omitted records. Across these 12 cases, first queries
find **7/13 desired handles**, while **6/13** reach exact analysis context. Five cases
load/use every desired handle. Six jobs complete, but one of those uses only distractors:
job completion is not retrieval success. Eight of nine offered handles reach exact
analysis context (including the two distractors); the ninth is the oversized source.
There are **33 cumulative adapter attempts** across the independent cases, never more
than three per task. The largest actual adapter context is **21,989** characters, far
below the hard cap; evidence-context pressure is not the cause of the lexical misses.
The oversized expansion is **184,393** characters after lossless sharing (207,991 before),
and is blocked before making an additional request. The saved load stage remains available.

## Safety and recovery

Assertions preserve every original requirement/approval, source, research record,
historical question, coverage assessment, older revision and previous job. A saved
implementation assessment uses actual requirement/decision fingerprints and stays current;
its original evidence is unchanged. Existing compatible gap checks remain checked; blocked
cases publish no new check or project revision. Successful citations create only a pending
human question, never a human decision, requirement approval or implementation completion.

Separate large-catalog regressions reject navigation-only citations through the real service,
retain the failed attempt after reopening, and exhaust retries without a fourth call.
Another interruption immediately after the durable search checkpoint reopens the database,
adds an unrelated billing note, then finishes exact loading/analysis with three cumulative
attempts, unchanged original search provenance and an explicit cross-revision reuse receipt.
Repeated reopening leaves saved checkpoints unchanged. Existing retrieval/migration suites
remain responsible for the broader cancellation, lease, legacy-envelope and future-format cases.

## Recommendations, not implementation changes

1. Evaluate bounded relevance ordering on the unchanged ambiguous fixture: saved order lets
   pump parts displace the custody rule. Keep omission telemetry and stable snapshot receipts.
2. Evaluate explicit field-aware indexing of rationale/acceptance and paraphrase retrieval
   against frozen desired handles. Do not silently reinterpret negation or treat semantic
   similarity as approval. Add held-out vocabulary/domains before choosing a ranking method.
3. Investigate local bounded candidate discovery that can find suffix/tail records on the
   first model search stage, **without** adding model requests or citation authority. Paging
   alone cannot provide search → load → analysis under today's three-attempt cap. Any search
   semantics change needs separate cost/compatibility review and these retained failure cases.
4. Give oversized exact evidence an explicit human scope/capture-resolution workflow, rather
   than truncating it or raising the cap. Preserve all mandatory human text and prior evidence.
5. Keep desired-handle discovery and exact-use metrics separate from job completion. Expand
   to curated multi-domain/held-out queries before making product retrieval-quality claims.

## Verification record

Windows portable Node **22.23.3**; system Node remains **20.11**. The first targeted run
could not load the repository's Node-20-ABI `better-sqlite3` binary (13 tests failed before
retrieval). `npm rebuild better-sqlite3` under portable Node 22 repaired that local dependency;
it did not modify system Node. The next run passed 10/13: two assertions incorrectly assumed
all requirement handles were undisplayed, and one expected the wrong oversized-error wording.
Assertions were corrected to measure existing navigation and actual diagnostics; the catalog,
queries and search implementation were not tuned. The subsequent targeted run passed **14/14**
including the added successful checkpoint-resume regression. These failures are not flaky
retries and are retained here explicitly. Final full-suite/browser results are recorded below.

Final type checking, both CLI help entry points and **431/431 deterministic tests** passed,
including the strengthened assertion that the original implementation assessment remains current. `git diff --check`
passed (Git reports the repository's existing Windows LF/CRLF conversion notices).
`npm run test:browser:all` passed on its first run for this change: UI production build,
controlled reliability, full workspace, focused exact retrieval and saved-navigation checks
ran sequentially without whole-test retries. The existing >500 kB minified-chunk warning
remains. This is fixture/browser verification, not live-provider retrieval qualification.

Compatibility: see [migration ledger](migrations.md#deterministic-first-query-retrieval-baseline-2026-10-20).
