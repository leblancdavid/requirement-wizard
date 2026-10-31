# Durable mixed-consistency execution pilot

Status, 2026-10-30: **explicit in-process injected-adapter pilot implemented**. It verifies
actual ordinary/scoped source witnesses and executes the [mixed consistency contract](definition-mixed-assessment.md)
with a durable one-request ledger. A later [explicit provider bridge](definition-mixed-providers.md)
supports existing selected OpenCode/direct adapters; later [explicit browser controls](definition-mixed-browser.md)
add confirmed start/status/Stop and saved-evidence display. Automatic coordinator dispatch
remains disabled; later [saved-review/apply controls](definition-mixed-publication.md) provide
separate explicit assessment publication. No live mixed calls
have been run; injected/mocked adapters are not effective provider/tool qualification.

## Exact selected sources, not caller-issued assemblies

`prepareDefinitionMixedReview(projectID, request)` is a readonly exact-selection operation.
The strict request has revision/snapshot/area plus exactly nine unique dimension selections,
including at least one scoped source:

- Ordinary publication: `kind: publication`, original `assessmentRevision`, exact
  `certificateKey` and dimension. The engine verifies the certificate against original
  jobs/request/context/snapshots, recovers the unchanged finding and compares original
  full-area guards with the target snapshot. It does not infer independence from citations.
- Scoped observation: `kind: scoped`, exact completed `jobID`, `provenanceKey` and dimension.
  The engine invokes the original/root witness verifier, retains every original scoped
  concern, and requires the complete-project evidence guard to match the target assembly.

There is no latest-source lookup or caller-supplied origin/assembly/check text. Sources that
are missing, changed, unsupported, out of area, stale or not independently reproducible
reject before allocating a new task/request. Selections canonicalize to the frozen dimension
order; reversing input order does not manufacture another request identity. All-scoped
nine-finding assemblies are also supported, without pretending they are ordinary publications.

Selections cap at **16 KiB**. At most nine explicit sources are selected; preparation caches
at most two published snapshots at a time, with each source snapshot subject to the existing
**16 MiB** bound. Scoped source/job/checkpoint bounds and the full-context **96,000 character**
ceiling remain intact. No evidence is sampled or truncated. Large-project preparation time
and memory behavior are not qualified; byte/record bounds are not a whole-call time limit.

## Separate one-request authorization

`DefinitionMixedReviewService.review(projectID, { request, confirmAIUsage: true }, options)`
requires fresh explicit authorization for a new attempt. It passes the authoritative target
project, exact stored model/account selection, complete packet, abort signal and
`tools: false` / `research: false` to the separately injected adapter. These interface
constraints are not a live sandbox or independently authenticated provider metadata.

New tasks serialize through existing discovery/execution/workflow admission. Live/expired
implementation leases, active work, unpaused workflow/maintenance or unfinished saved input
block admission. Admission pauses automatic saved-response processing, not grants new
permissions. Completed exact-request reuse is a read, not new work/allowance. The service is
registered only for a separate explicit browser/queue action, not coordinator/CLI/automatic
continuation; opening a project or ordinary continuation cannot invoke it. Existing OpenCode/direct adapters now accept only the exact verified mixed
context on a dedicated JSON-text path; malformed/mixed contexts and scan/research/question-help
profiles reject before runtime construction/account access, without ordinary-profile fallback.

One app attempt is reserved atomically before an adapter invocation. The execution deadline
defaults to **two minutes**, capped at three, starting after admission/preparation. There is
no retry loop, provider/model switch, research, coding, planning or automatic follow-up.
An app reservation is not proof of provider acceptance, inference or billing. Ordinary input,
decisions, requirements, assessments/confidence, implementation state and grants are unchanged.

## Durable witnesses and no-call recovery

SQLite **21→22** adds local `definition_mixed_reviews`, job kind `definition-mixed-review`
and context marker `definition-mixed-review-v1`. Checkpoint policy `definition-mixed-run-v1`
binds canonical selections, exact request/assembly/context keys, explicit authorization,
reservation, optional original saved reply/date, completion/result and root recovery identity.
The new result is `review-evidence-only`, with false publication/request/skip flags. A completed
conflicting/blocked result is valid evidence, **not** a supported assessment or permission to act.

Before reserve, reply save, finish or reuse, the engine reconstructs the exact original packet
from original bounded snapshots and re-verifies source job/model/context witnesses. It also
checks current revision/snapshot before accepting output. Real edits and equal-numbered
replacements reject without rebasing findings or overwriting newer product decisions. The
frozen mixed assembly/consistency builder/instruction must remain reproducible across future
compatible upgrades; do not issue replacement calls just to reacquire equivalent metadata.

Validated replies are saved **before** completion. Finish re-verifies sources, root reply,
deadline and lease, then commits completed job and result together. A failed atomic completion
rolls back both while retaining the earlier reply and spent reservation. Explicit retry can
create a zero-call recovery task, linking the original request job/response date without
changing the original record. Repeating a completed exact request returns its original task.
The newest exact checkpoint is authoritative; damaged newest evidence never falls back to
an older result or silently creates another paid request.

Cancellation/deadline races settle even adapters ignoring their abort signal. Late replies
cannot mutate the saved job/checkpoint. An attempt without a saved valid reply remains spent;
only another confirmed invocation can reserve a new attempt. Live original workers cannot
be stolen. Explicit recovery can retire expired jobs through the existing recovery path,
preserving other owners' live leases and never automatically repeating inference. Startup
itself validates metadata but does not resume/claim workers or make model calls.

Checkpoints cap at **192 KiB**, original/completed job reads at **256 KiB**, replies at the
existing **64 KiB**. Unsupported future formats and changed/missing/oversized root witnesses
fail closed without repair or substitution. There is no source-history archive scan.

## Two different inspection levels

- `definitionMixedReview(jobID)` reads bounded dated checkpoint metadata only. It does not
  replay sources, authenticate current compatibility, recover a reply or invoke a model.
- `inspectDefinitionMixedReview(projectID, { jobID })` explicitly re-verifies original/root
  source witnesses in a deferred read transaction and returns the dated original assembly,
  run and original request-job identity. Its transient format-1 view has only review-evidence
  authority. Later product edits leave this original view dated and unchanged; it is not a
  current compatibility certificate. Foreign/missing/unsupported sources return unavailable.

Neither inspection starts work, claims a lease, spends allowance, writes a receipt, or confers
publication authority. Later browser polling uses a separate lightweight dated checkpoint view;
original-witness replay is an explicit user action, not a poll.

## Compatibility and exclusions

The ordered additive 21→22 migration rewrites no old project/history, ordinary/scoped origin,
completed scope/mixed-reader data, semantic key, concurrency counter, grant or execution state.
Existing valid work needs no reset/backfill/model call. Startup checks bounded new checkpoint/
job/marker identities and missing checkpoints without rebuilding original history. Failure
rolls schema/ledger advancement back without overwriting offending data; reopening can retry
after supported data is restored. Older apps reject SQLite 22 before consuming the job kind.

Execution schema remains **2**, usage export **2**, mixed-reader/ordinary/scoped formats and
portable envelopes are unchanged. Raw mixed tasks/checkpoints/replies are local-only and
excluded from portable continuation; disguising their marker as ordinary discovery rejects.
Bounded published-source provenance declarations remain a separate format-3 reader feature.
Generic discovery finish/resume cannot consume these tasks. Browser snapshots keep the
previous ordinary coverage baseline; Logs label them **Mixed finding check**, not discovery.
Usage exports do not count this new task family or invent savings. Qualification inspection
supports original SQLite 20/21 and current 22 readonly, without migrating older live evidence.

See [migration details](migrations.md#durable-mixed-consistency-pilot-2026-10-30).

## Next gates

- The dedicated provider bridge/routing and observable tool checks now have mocked transport
  coverage. Live mixed semantics/account support and effective permissions remain unqualified.
- Explicit browser start/status/owned Stop and ambiguous-response inspection are now implemented;
  see their separate deterministic verification record.
- Saved-review/preview and separately confirmed atomic apply now preserve original provenance,
  low confidence, history/idempotent receipts and otherwise-valid implementation reuse;
  see their separate deterministic verification record.
- Human semantic review, larger projects and sound narrower evidence contracts before any
  automatic finding-level skips or savings claims. Prior small live scope tests do not
  qualify the new mixed task.

```powershell
npx tsx --test src/service/definition-mixed-review.test.ts
```

Verification, 2026-10-30: type check, **1,374** deterministic tests (670 pretests +
704 main), UI build, all **fifteen** default browser runners and diff check passed.
Fifteen new task cases cover real ordinary/scoped source verification, strict consent and
selection identity, exact model inputs/reservation, completed reopen/reuse, atomic finish
rollback, original-date zero-call recovery, uncooperative cancellation/timeouts/late replies,
conflicted/blocked outcomes, real/equal-version edits, damaged sources/newest checkpoints,
active-work/automation/input admission, generic/portable/browser-baseline exclusion, provider
rejection before startup/auth, all-scoped assemblies, live/expired/missing roots, bounded
reads and 21→22 preservation/future-format rollback/repair/retry with other live leases.

Readonly checks of all three original SQLite-20 live scope experiments reproduced their
original reports and saved-row digests without migration or adapter calls. The browser
aggregate protects existing controls/reader behavior; it does not qualify new mixed controls
or provider dispatch. No live inference/authentication/permission probe, personal-project write,
assessment apply, automatic skip, commit or push occurred. The existing UI bundle-size warning
remains. Later provider/browser/publication slices have their own verification records;
live semantics, effective permissions and performance gates remain unfinished.
