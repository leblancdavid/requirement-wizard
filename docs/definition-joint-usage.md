# Joint-check usage evidence

Status, 2026-10-30: **implemented bounded usage inspection/export and immediate action
disposition**, not a project-wide savings report or permission to skip reviews.

## Current format 2: local reviews and assessment applies

The report now also shows an **independent latest-twenty local-review window** for the
same project/optional area. It separates validated saved review packets, dated local
publication receipts, reviews with no local receipt, and unavailable evidence. Each
window has its own `hasMore`; task and review counts must not be treated as lifetime totals.
Task links use only `check-N` labels or `outside-window`; review labels are `review-N`.
No original project/area/job/review/publication IDs, hashes, dates or content are exported.

Saving a review or replaying an identical apply request does not inflate these counts.
An apply receipt is dated publication evidence, not product approval, present-day source/
implementation compatibility or permission for further work. The apply route starts no
AI requests, but prerequisite joint checks can consume requests, including checks outside
the task window. **Neither publication counts nor zero-request recovery counts establish
requests/money saved.** There is no counterfactual full-recheck baseline. Missing local
receipts do not prove that an assessment was never applied; malformed/unsupported/oversized
or wrong-review receipt evidence stays unavailable rather than being counted as zero.

The storage reader selects at most 21 review row identities, validates only the first 20
packets under the existing **132 KiB per review / 16 KiB per receipt** bounds, and checks
receipt/review/preview/area/input identities. It does not load original source snapshots,
re-run eligibility, inspect code or ask a model. An unreadable latest review is not skipped
in favor of an older valid one. Task and review windows are read in one deferred transaction
for a consistent snapshot. Report generation remains an explicit read with no writes,
lease claims, allowance changes, inference or automatic retry.

JSON export/API `format` is now **2**, adding `reviewedCombinations`; the existing task
measurement fields retain their meanings. The browser validates format 2 and offers the
same download name. Earlier format-1 downloaded files are untouched historical reports;
there is no report-import feature, file rewrite or automatic conversion. Consumers must
recognize format 2 rather than silently assuming the extra window is a savings counter.
This is an ephemeral report change: SQLite stays **19**, execution schema stays **2**,
portable formats and all saved jobs/reviews/receipts/freshness keys remain unchanged.
No migration/reset/repeated model call is needed to gain the report. See the
[compatibility ledger](migrations.md#review-and-publication-usage-report-2026-10-30).

Format-2 verification, 2026-10-30: type check, **1,265** deterministic tests (561 pretests
and 704 main), focused usage/privacy/bounds checks, UI build, all thirteen default browser
runs and diff check passed. Browser checks cover review-before-apply, dated-receipt-after-
apply, unchanged request counts, stale-state reporting and format-2 download. No live
model calls, commits or pushes; existing bundle-size warning remains. This is not broad
savings, large-project performance or live semantic/provider qualification.

## What the browser shows

Under **Overall progress → Inspect original finding sources → Check the findings
together**, an accepted confirmed action now distinguishes:

- **New attempt:** a new task was admitted with at most one request. This is not proof
  that the adapter/provider received a request or charged allowance.
- **Completed reuse:** the existing completed task was returned, with no new task or
  adapter request. Its saved dates and measurements are not reset.
- **Saved-response recovery:** a new local task reuses a valid original reply, without
  a new adapter request; the earlier spent attempt/observation date remain intact.

The immediate disposition describes this explicit invocation, not a reconstructed
historical receipt. It is cleared on another action/status inspection and is not
persisted as a new activity/job. Repeated completed-result reuse still creates no
new task; the usage report cannot count how often that path was taken in the past.
An older server without the optional disposition is labelled unreported, never zero.
A pre-claim failure stays a new failed attempt, not a completed-reuse receipt.

**Inspect joint-check request usage → Load joint-check usage** explicitly reads at
most the latest **20** saved joint tasks in the selected area. Opening/selecting,
normal workspace polling and reload never fetch/repeat that report or authorize a
model request. It is a dated snapshot; load again explicitly for subsequent work.
The report distinguishes finished, partial, missing and unavailable measurements.
It shows observed adapter attempts, request outcomes, local/adapter durations and
measured zero-request recovery tasks, not requests/money saved. A zero observed count
with missing/partial data is not proof of zero calls.

**Download joint-check usage** exports the already loaded metadata, without another
history read. Original IDs are replaced with `check-1`, etc.; recovery links only
refer within this window or say `outside-window`. The export contains no project/
area/job/model/account identifiers, timestamps, names, paths, findings, source text,
prompts, responses, credentials or diagnostic prose. Counts/durations may still reveal
scale; review before sharing. The report does not prove its recovery links current or
independently authenticate saved local metadata.

## Measurement boundary

New joint tasks use the existing optional format-1 `DiscoveryMeasurement` job metadata.
Timing begins **after the job is claimed**; admission, initial source verification and
candidate preparation before claim are excluded. Request context sizes count app-owned
context characters/records, not tokens or runtime schema/prompt overhead. Request time
includes adapter startup, provider work and cancellation—not pure inference time.

The request record checkpoints immediately **before adapter dispatch**. A crash or
checkpoint failure around that boundary cannot prove provider acceptance, billing or
delivery. A returned reply is classified before contract validation: an invalid reply
can have a returned request and a failed job, never a successful verdict inferred from
transport. Cancellation races through the measured request so an ignored/late adapter
reply cannot mutate final measurements or publish a result after Stop. Provider-side
cancellation remains unqualified.

Saved-response recovery records a fresh local task with zero measured requests; original
root measurements remain separate. Returning an already completed equivalent task never
starts a new measurement or rewrites old timings. Reservation and measurement are different:
a reserved allowance may be spent without a valid reply, and a pre-measurement failure
can leave an unmeasured job. Missing measurements remain unknown, not backfilled zeros.

## Storage, API and compatibility

`src/core/definition-joint-usage.ts` validates whitelisted metadata and produces the
report. `ProjectStore.definitionJointUsage` selects at most **21** task metadata rows to
return 20 plus an older-history indicator, without reading project revisions, source
prose or model replies. Individual metrics are bounded to **32 KiB before decoding**;
missing, future, malformed or oversized metadata stays unknown/unavailable. More than
one request in a joint measurement is rejected as unavailable rather than exported as
a conforming one-request task.

`POST /api/projects/:id/definition-joint-usage` accepts only an optional area ID. It
shares the token/host/origin/body guards, rejects other methods/unknown consent fields,
filters by the selected project and runs before generic project/history projection.
It writes no project/job/queue/lease/allowance state. No automatic report generation,
export, startup replay or inference is introduced.

The original measurement slice used SQLite **16**; current SQLite **19** also supports
the independent review/publication features above. Execution remains schema 2. The optional
`job.discoveryMetrics` format is unchanged; the existing response classifier recognizes
the joint contract as an analysis response before validation. No project/assessment/
certificate/run/result/portable format, semantic key, optimistic counter or saved
receipt changes. Older completed checks without measurements reopen/reuse byte-identically
and do not repeat inference to acquire diagnostics. Existing portable exclusions remain.
See [migration ledger](migrations.md#joint-check-usage-measurements-2026-10-30).

## Limits and checks

This is one bounded task-family report, not project-wide request savings, a counterfactual
comparison with full rechecking, a performance benchmark or narrower dependency proof.
Explicit mixed publication is now separately implemented; safe narrower partitions, broad request-savings qualification and live
semantic/provider performance checks remain unfinished.

Deterministic joint tests cover returned-invalid replies, cancellation, completed reuse,
zero-request reply recovery, privacy, bounds, partial/missing/future metadata, pre-claim
failure and unchanged older saved work across reopen. The browser checks separate action
disposition, explicit report loading, metadata-only download and no extra model calls:

```powershell
npx tsx --test src/service/definition-joint-review.test.ts src/service/discovery-diagnostics.test.ts
npm run test:browser:definition-joint
```

Verification, 2026-10-30: type check, all **1,230** deterministic tests (526 pretests
and 704 main), focused joint/diagnostics/log checks, focused joint browser, full
nine-runner default browser aggregate/UI build and diff check passed. No live model
calls were made. The existing bundle-size warning remains; this is not live provider,
semantic quality, large-project performance or project-wide savings qualification.
