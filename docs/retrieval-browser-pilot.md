# Default-off saved-evidence browser pilot

## User controls and scope

2026-10-20. The prefix-preserving auxiliary merge is available for deliberate browser
testing, **not enabled by default or qualified for broader rollout**.

1. Open a saved project after initial interpretation, then **Settings → Experimental
   saved-evidence search**.
2. Check **Use prefix-preserving auxiliary merge for manual Explore next gaps**.
3. Return to Design and explicitly click **Explore next gaps**. Existing model allowance
   applies; selecting the checkbox or opening/reloading Settings makes no model call.
4. Uncheck to return new searches to original prefix search. Reloading or changing project
   also resets the selection to default. It is tab-local React state, not a persistent
   project preference, local-storage setting or automatic change to other clients.

The pilot applies only to newly requested manual next-gap search stages. Initial
interpretation, queued-answer/review processing, scans, Refine, question help and terminal
commands retain their existing behavior. If queued responses are processed instead of an
empty-queue gap pass, they do not inherit the pilot. Busy projects disable the control.
All model, research and account selections stay as chosen; no live provider qualification
is implied by deterministic checks.

The algorithm and limits are unchanged from the [merge evaluation](retrieval-merge.md):
primary prefix results retain priority/order, auxiliary prefixes fill unused slots, and
the same 5,000-primary-record, 1,000,000-total-text-character and 4,096-per-record scan limits
apply. There are still two navigation stages, three cumulative model attempts and a
96,000-character context cap. No candidate paging is added.

## Policy and omission visibility

Processing & queue distinguishes:

- **Requested for new searches in this job**: default prefix or `prefix-aux-v1`.
- **Saved policy** for each issued search stage, including its original revision. A
  default request can legitimately display a saved experimental stage on compatible retry.
- Primary/auxiliary scan characters, primary records scanned, auxiliary records examined
  and auxiliary text-limited counts, with their unchanged ceilings.
- Primary unexamined records and additional matches omitted. Zero reported omissions is
  **not** a claim that every auxiliary field was searched: primary slot saturation or scan
  limits can prevent auxiliary reads. Unknown matches are not invented as zero exhaustive recall.
- No candidate continuation; previously issued legacy cursors keep original prefix semantics.

Navigation labels never authorize citations. The next explicit load must deliver the exact
saved record before it can be cited or changed. Evidence-derived questions are pending human
review, not approvals. Turning the pilot off does not reset attempts, discard checkpoints,
rerun earlier misses or relabel older evidence. It affects **new** searches only. Compatible
saved stages/final responses retain original provenance; relevant changed human/loaded
evidence continues to block reuse.

## API and persisted-data compatibility

Authenticated same-origin `POST /api/projects/:id/analyze` accepts optional
`savedEvidencePolicy: "prefix" | "prefix-aux-v1"`. Missing means existing default behavior.
Unknown values/types fail validation; pilot requests for initial interpretation or Refine
are rejected. Revision checks, busy guards, token/host/origin validation and body bounds
are unchanged. Queue plumbing passes a policy only to manual gap work, not saved submissions.

Retrieval work **1** gains optional `requestedPolicy` using the same enum. This records the
current job's explicit request, **not** a claim about the policy of reused stages. Browser
manual default requests can also record `"prefix"`. Older jobs missing the field stay
missing on read/reopen; it is not copied from a prior job or backfilled with invented consent.
Issued `searchResult.policy` remains the independently versioned original stage receipt.
Snapshot responses include the requested choice without exposing final model payloads.

SQLite **3**, project JSON, execution **1**, workspace **2**, gap/check and implementation
assessment identities are unchanged. There is no schema migration, startup rewrite, reset,
reassessment or automatic call. Older saved jobs continue to reopen/retry; unknown future
requested policies reject reads without overwriting data. Reopening never resumes inference.
Downgrading to a binary that cannot read the additive policy fields is **not qualified**.
See [migration ledger](migrations.md#default-off-browser-retrieval-pilot-2026-10-20).

## Independent review gate: still pending

Four new ticketing-domain relevance cases and their intended questions are prepared in
[the review packet](retrieval-pilot-review.md), with fixtures at
`src/core/fixtures/retrieval-pilot-review.ts`. They include accessibility acceptance text,
opposite refund observations, a deliberately saturated release query and a paraphrase miss.
The deterministic checks verify the declared behavior; they **do not independently review
their own relevance annotations**. The same assistant authored the code and proposed labels.

No external/human reviewer has signed off in this work. The packet remains
`pending-independent-review`; do not mark this gate complete or cite these four cases as
independent retrieval-quality validation. Broader rollout remains gated on that review and
the existing cost/omission/coverage limits. No new live model calls were made for qualification.

## Verification scope

`src/web/retrieval-pilot.test.ts` tests real authenticated API/queue/service checkpoints,
invalid/stale/cross-origin requests, explicit opt-in, default behavior when omitted,
switch-back reuse, exact loading, snapshot provenance, older missing-field jobs and repeated
future-format rejection/reopen. Additional rendering checks cover requested versus saved
policy and the non-exhaustive auxiliary-limit explanation.

`npm run test:browser:pilot` builds and runs a deterministic browser/API/store scenario:
default off; explicit checkbox selection; committed-search interruption; policy/limits/
omissions in Processing & queue; reload without inference; switching back; original receipt
reuse with three total attempts; exact loaded citations and pending question; preserved
requirements/sources; mobile width; project-switch reset. It uses only disposable SQLite
and a deterministic adapter. Screenshots are `.reqwizit-state/browser-retrieval-pilot-{interrupted,mobile}.png`;
failures save bounded/redacted diagnostics at `browser-retrieval-pilot-failure`.

`npm run test:browser:all` builds once and now runs **five** browser scenarios serially,
including this pilot. Do not run build-and-test commands concurrently against `dist/web`.
The focused pilot run and initial 26 relevant tests passed; final verification is recorded
below. These are technical workflow checks, not live quality or independent relevance review.

Final type checking and **450/450 deterministic tests** passed on portable Windows Node
**22.23.3**, including existing baseline/merge/recovery tests and the new API, rendering,
review-ready annotation and persisted-data compatibility checks. No targeted test failure
or focused browser retry occurred in this step. Diff checking passed with the repository's
Windows LF/CRLF notices. The system Node installation remains **20.11**.
Final UI build and all **five** serial `test:browser:all` scenarios passed on their first
run for this step, including the new pilot; no whole-test retries or live inference. The
existing >500 kB minified-chunk warning remains. No user databases were modified and no
commits or pushes were made.
