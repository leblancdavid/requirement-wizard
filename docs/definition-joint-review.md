# Joint consistency review of selected definition findings

Status, 2026-10-30: **implemented explicit engine/service and browser task**, not mixed publication
or automatic finding-level reuse. `DiscoveryService.reviewDefinitionCombination` can
validate all nine selected original findings together, using the existing selected
provider/model adapter. Overall progress now exposes separate consent, exact-task Stop
and dated saved results. There is no automatic coordinator route. Fixture execution
is verified; live model quality is not qualified.

## Browser consent and saved results

Accepted actions now distinguish a new attempt, completed-result reuse and saved-reply
recovery. **Inspect joint-check request usage** explicitly loads/downloads metadata for
at most 20 saved tasks. New tasks retain optional measured adapter attempts/timings;
older/partial/unreadable data remains unknown, and repeated completed reuse is not
manufactured into a new historical task or a savings count. See [usage evidence](definition-joint-usage.md).

Open **Overall progress → Inspect original finding sources**, explicitly load sources,
select all nine original findings and compare their provenance. Only a complete preview
with matching current whole-area guards enables the separate joint-check consent.
Tick **Allow at most one AI request for this exact joint check**, then choose
**Check selected findings together**. The consent is tied to the exact selection and
snapshot; it is cleared after submission or explicit status loading. Opening controls,
ticking consent, selecting sources or changing mode starts no work; the confirmed Check
button is the dispatch action. The chosen connection/model stays
the existing project selection; a pending unsaved selection disables starting.

The queue serializes this task with other discovery/execution/workflow operations.
Starting new work holds automatic saved-response processing, without changing its
preferences, coordinating new work or renewing grants. Completion does not process
waiting submissions or start discovery, research, questions, planning or coding. The
queue and Logs identify this as **Joint finding check**, not an ordinary discovery round;
it does not replace the previous discovery-coverage baseline.

Once a task is acknowledged, this view polls only its bounded saved status. Closing the
drawer stops that local polling, not the underlying worker. **Stop joint check** targets
the exact job owned by this app; a stale/foreign job cannot stop unrelated work. The
normal header Stop also remains available for this app's active discovery worker.
Reload/reopen performs no joint-history read or model retry. **Load saved joint check**
explicitly loads the latest local check for the chosen area and polls only if it has a
live lease. An expired worker is displayed as interrupted without rewriting or claiming
its job; recovery still requires an explicit action.

Saved results show lifecycle state, request observation/completion dates, original
finding revisions, per-dimension verdict explanations, conflicts and spent/reused
attempt provenance. This is a dated read of local evidence, not a new source-verification
or freshness certificate. Original source dates remain unchanged. Current content/revision
changes date the view and disable continuing its old combination, including equal-numbered
replacement. **Use this saved combination** separately selects a same-input saved task
for an explicitly confirmed check/recovery; it never silently replaces current selections.
The selected nine original review versions can be inspected before consent.

Every start re-verifies provenance/current tokens in the existing engine. Completed
equivalent checks and provable saved replies are reused without another request;
missing/changed witnesses block without an implicit paid retry. If an earlier task has
no valid saved reply, a new confirmed attempt can consume one more request. Prior spent
attempts remain saved. A failed status read does not replay the start request; after an
acknowledgement the view tracks its exact job or asks for explicit status inspection.

The token/host/origin/body-guarded POST endpoints are `definition-joint-start` (strict
`{ request, confirmAIUsage: true }`), `definition-joint-status` (strict area plus optional
exact job ID) and `definition-joint-stop` (strict exact job ID), under
`/api/projects/:id/`. They reject other methods, cross-project inspection/Stop and
unsupported consent/research/duration fields. Status returns bounded app-owned view
metadata/validated saved reply, never provider credentials, sessions, full prompts or
historical source snapshots. The read does not start or resume work.

## Scope and admission

The request uses the existing explicit per-dimension source selections and current
revision/full content token. Preparation re-verifies publication certificates and
original finding provenance in one SQLite transaction. All nine dimensions must have
selected verified sources whose original **whole-area** guards still match. Missing,
changed, ambiguous or uncertified sources return the existing whole-area fallback;
the app never invents a replacement or asks a model to fill missing source provenance.

The context contains exact current guarded records, active area definitions, global
interpretation/origin, and all nine original findings with their distinct original
identities/dates. Every manifest record is checked against current content before
inclusion. No finding wording, original human text, date, status or evidence link is
shortened or rewritten. If this combined payload exceeds **96,000 characters**, the
task returns `whole-area-context-limit` before creating a job or asking the model.
There is no sampled/partial joint-review path or automatic fallback inference.

A candidate key binds the exact current snapshot and original source identities;
a separate context key binds the exact context payload. The shared prompt builder
selects a dedicated `jointReview` contract for both existing OpenCode/direct adapters,
not the ordinary proposal/assessment schema. Research and tools are disabled under
the existing adapter profile. No provider, account, model or output-format switch is
performed after failure. This does not newly qualify live permission enforcement.

## Explicit allowance and result

One explicit service call authorizes **at most one** request, normally within two
minutes (caller-selected bounds are capped at three minutes). It does not spend or
renew the coordinator's shared grant, opt into automation or start independent workers.
Coordinator-owned service instances reject this operation. Existing live discovery,
workflow and execution guards prevent competing dispatch. Manual/Guided settings
retain their existing scope; saving a mode never starts this task.

The model must return one verdict per dimension, echoing its original origin key,
plus cross-finding conflicts. Decisions are `retain`, `reassess` or `blocked`. Retain
keeps the original partial/unknown/defined conclusion; it cannot upgrade it or establish
a new human preference. Candidate/context mismatch, duplicate/missing dimensions,
changed origins, unseen citations and unrelated proposals/approvals are rejected.
Members of a reported conflict cannot be retained. A supported verdict requires all
nine to be retained and no reported conflicts.

The local result is `model-supported`, `conflicted`, `reassess` or `blocked`, with
`authority: review-evidence-only`, `partition: whole-area` and **`canPublish: false`**.
It is model judgement, not formal consistency, completeness, independent dependency
proof, readiness, approval or permission to skip calls. A model may still miss a
conflict; fixture checks do not prove semantic review quality. Project revisions,
assessments, original findings, approvals, plans and readiness are never changed.

## Durable requests and explicit recovery

SQLite **15 → 16**, `definition-joint-review-runs-v1`, adds local
`definition_joint_reviews` checkpoints and recognizes a dedicated
`definition-joint-review` job kind/context marker. A request is reserved atomically
once before dispatch and never renewed on that job. Reservation counts an app attempt,
not provider delivery or billing. Returned valid responses are saved separately from
completion; completion re-verifies current source/context/content and commits the
result and completed job together.

Repeating the same explicit action under exactly matching inputs re-verifies and
returns the completed record without another request or new job. If a returned valid
response was saved but completion failed, an explicit later call can create a zero-
request recovery job linked to the original request. The original failed/cancelled/
interrupted job, spent reservation and response observation date are preserved. A
saved response from an expired worker can be recovered without repeating inference;
live leases are not stolen. Expired-job handling preserves other workers' live leases.

Missing or changed saved response witnesses block reuse without silently repeating
the request. If no valid response was saved, another explicit action can authorize
a fresh one-request attempt; it does not erase the earlier spent attempt. Stop,
timeout, startup and mode changes never automatically retry. Cancellation/time limits
also bound adapters that do not settle promptly, though provider-side cancellation
still depends on the existing integration and is not newly qualified here.

The raw checkpoint getter is dated local evidence, not a current compatibility proof.
The explicit service re-verifies source guards and current tokens before reusing or
completing it. Old supported verdicts are not projected onto changed project inputs.
Original finding dates remain separate from request-observation and recovery-save dates.

## Compatibility and client boundaries

The additive migration rewrites no previous row and needs no payload backup. It changes
no project/assessment/portable semantic key, execution schema 2, approval, grant, old
job, existing receipt or optimistic project revision. Older apps reject SQLite 16.
Old completed work is not backfilled or repeated to acquire joint validation. Upgrade
alone starts no job or request and preserves live workers/leases. Ordered transactional
failure rolls back the table/index and schema/ledger advancement; reopening can retry.

Startup rejects unsupported future checkpoint formats, mismatched row/job/context
identities and orphan joint jobs without overwriting them. Checkpoints are capped at
**128 KiB**, responses at **64 KiB**, source selections at nine, and original snapshot/
record/reference/certificate bounds remain enforced by existing origin readers. At
most two historical snapshot objects are cached during preparation. No source evidence
is truncated to create successful review evidence. Large-project replay/storage cost
remains unqualified.

Joint jobs and results are machine-local and are excluded from portable continuation,
including interrupted in-flight jobs. Imports reject a joint marker masquerading as
ordinary portable discovery. Ordinary discovery publication refuses specialized jobs;
generic discovery-resume controls cannot treat a failed joint validation as authority
to run ordinary discovery. Normal local job lifecycle may mark a workspace dirty; this
does not export joint results as shared authority or alter specification revisions.

Future automatic routing, narrower partitions and mixed-result publication
need their own consent, provenance, stale-publication and forward-compatibility slices.
Nothing here authorizes coding, commands, research, new questions or requirement changes.
See [origin provenance](definition-finding-origins.md),
[activation gates](definition-dependency-protocol.md#activation-gates--not-implemented)
and [migration ledger](migrations.md#joint-definition-consistency-review-2026-10-30).

## Checks

`src/service/definition-joint-review.test.ts` uses deterministic adapters for exact
context/prompt scope, unchanged source dates, conflicts, malformed/forged verdicts,
one-request reservations, completed reuse, returned-response recovery, expired/live
leases, cancellation/time limits, stale inputs, context bounds, portable exclusion,
ordinary-publication rejection and SQLite upgrade/reopen/failure/future-format behavior.
The queue-routing test separately prevents generic discovery resume for this task.

Initial engine-slice verification, 2026-10-30: type check, all **1,218** deterministic tests (515 pretests
and 703 main tests), the default browser suite/UI build, workflow browser checks and
diff whitespace checks passed. No live model calls were made. The build reports a
non-blocking bundle-size warning; live quality/permission/cancellation behavior and
large-project replay performance remain unqualified.

```powershell
npx tsx --test src/service/definition-joint-review.test.ts
```

The browser/API slice additionally tests explicit consent, method/auth/origin/input
guards, exact task ownership, cancel/reload, saved-response failure/recovery, no-call
completed reuse, expired status without lease claims, dated results and unchanged
assessment/grant/ordinary coverage baselines. Focused browser command:

```powershell
npm run test:browser:definition-joint
```

Browser-slice verification, 2026-10-30: type check, all **1,226** deterministic tests
(522 pretests + 704 main), focused joint/API/log tests, focused joint browser, full
nine-runner default browser aggregate/UI build, workflow browser and diff check passed.
All adapters were deterministic; no live model calls were made. The existing bundle-size
warning and live quality/permission/cancellation/large-project qualification gaps remain.
