# Mixed-source assessment reader and consistency contract

Status, 2026-10-30: **persisted reader/schema foundation and pure consistency contract
implemented**. A later [in-process durable pilot](definition-mixed-execution.md) now verifies
actual sources and retains task/reply/root witnesses under SQLite 22; automatic dispatch,
save/apply endpoints and publication remain unwired. Later [browser controls](definition-mixed-browser.md)
provide separately confirmed requests and read-only selection previews. A later
[explicit provider bridge](definition-mixed-providers.md) now supports dedicated selected
OpenCode/direct requests, with mocked transport checks rather than live qualification.
The browser runner uses a deliberately curated reader
declaration, not a real publication or model response. No live call is needed for this slice.

The later pilot's verification now includes 1,374 deterministic tests and all fifteen default
browser runners; see its separate record for actual task/recovery checks. Reader fixtures
still do not authenticate a publication or qualify live provider semantics/permissions.

## Distinct origins, unchanged originals

Optional `assessment.mixedReview` uses format 1, `definition-mixed-assessment-v1`, with
`provenance-only` authority. It is distinct from the existing `combinedReview`; neither
frozen ordinary nor scoped origin policies acquire new meanings. Its assembly retains:

- Exactly nine findings, in canonical dimension order, with unchanged text, importance,
  status and evidence order. Each carries its exact ordinary publication **or** scoped
  observation origin. At least one scoped origin is required; ordinary-only combinations
  keep their existing representation and workflow.
- Complete scoped provenance packets for the selected scoped findings, including original
  result order, assignments and **every** original concern, even about unassigned dimensions.
  Sources are uniquely/canonically ordered and all must be referenced; omitted/replaced
  scoped sources and findings with different keys reject.
- Exact project/area/revision/snapshot, the frozen conservative complete-project evidence
  guard, and a self-consistent assembly key. Scoped observations must match that complete
  evidence guard; this slice does not permit stale scoped results to be relabelled current.
- Separate wrapper publication identity/date/revisions and a saved consistency declaration
  referring to its original request/completion jobs and response observation date. These
  declarations are not independent authentication of any local worker or consent.

The reader requires low aggregate confidence, a v1 input basis, one assessment per area,
all nine exact checks, matching wrapper/project identities and no competing staged/combined
marker. Metadata cannot grant product approval, implementation readiness, request allowance
or automatic skips. App-owned provenance is rejected by ordinary/staged model-output schemas.
The entire new marker/assembly is bounded to **2 MiB**, with existing nested limits retained.

No existing assessment is converted, wrapped, rescored or invalidated to acquire this marker.
The frozen ordinary `definitionInputKey` remains unchanged. Only new mixed markers add the
same conservative `definition-combined-project-evidence-v1` guard already used by combined
assessments. Product evidence changes can stale them even outside the cited area; local
routing, receipt prose and assessment-only revisions do not. Coverage is still an estimate,
not proof of readiness or semantic independence. Old single-review publication/impact
inspectors cannot treat a mixed wrapper as an ordinary original review.

## Pure mixed-consistency contract

`prepareDefinitionMixedConsistency` requires a matching assembly and complete authoritative
current project evidence. It retains every source concern and produces an exact context key.
Contexts above **96,000 characters** reject; evidence is never sampled or truncated. This
function does not authenticate the candidate's original stored jobs/certificates. The separate
durable pilot now verifies all ordinary and scoped source witnesses before invoking it;
direct pure callers still supply declarations, not independent authentication.

`validateDefinitionMixedConsistency` accepts only the dedicated strict format-1 response:
exact assembly/context keys, nine unique exact-origin verdicts with cited captured evidence,
the complete canonical original-concern key inventory, and any explicit conflicts. Replies
cap at **64 KiB**. Wrong keys, missing origins/concerns, external citations and extra fields
reject without fallback. A structurally supported result additionally requires all nine
verdicts to retain, no conflicts, and no original scoped concern touching a retained finding
marked `defined`/`not-applicable`. The latter intentionally prevents a concern about an
unassigned dimension from being hidden behind an old defined finding.

Even structurally supported output has `review-evidence-only` authority and false publication,
request and skip flags. A declared concern inventory is not proof the model understood it.
No ordinary joint verdict can stand in for this different assembly/contract, and knowing its
JSON shape cannot authenticate source jobs, provider identity, user consent or publication.
A dedicated provider prompt/adapter now accepts only exact verified contexts on explicit
requests; later explicit browser dispatch is implemented, while automatic coordinator
dispatch and live mixed qualification remain separate.

## SQLite 20 → 21

`mixed-assessment-provenance-format-v1` is an ordered transactional **reader boundary**.
It rewrites no existing row, revision counter, fingerprint, original origin, completed scope
result, grant, saved request or execution state. Older apps reject SQLite 21 before they can
silently strip the new optional assessment field. No backup/backfill/model call is necessary
because no old payload is transformed.

Startup validates current projects containing either combined or mixed markers within the
existing **16 MiB** read ceiling. It verifies project/row identities; historical marked
snapshots validate on explicit reads/adoption rather than whole-history startup replay.
Invalid/future/oversized marked data rolls back ledger/version advancement without replacing
the data; supported data can be restored and startup retried. Live workers and other owners'
leases stay untouched. Execution schema remains **2**, usage export **2**.

Existing qualification manifests/runs retain format 1. Their readonly inspector now explicitly
supports original SQLite **20/21** and current **22**, without migrating older evidence or
repeating calls. Schema-only extraction into `definition-check.ts`,
`definition-review-scope-schema.ts` and `definition-scope-provenance-schema.ts` preserves the
old field order, limits, canonical hashes and helper export paths. A pinned pre-extraction
synthetic scope/context identity test guards against an accidental representation change.

## Conditional portable state format 3

Unmarked exports keep format **1**; combined-only/definition-revision exports keep **2**.
The writer uses **3 only when mixed provenance exists**, either currently or in referenced
historical assessment continuation objects. Formats 1/2 carrying mixed provenance reject
before adoption; an old 1/2 reader rejects format 3 before silently dropping the new field.
The rest of the workspace layout, continuation/execution envelopes and semantic identities
are unchanged.

The reader accepts 1/2/3 and rejects unknown marker/envelope versions without overwrite.
Clone/adoption/checkpoint retains exact original scope/ordinary dates, keys, concerns and
confidence under another local account, without inventing missing local task/certificate
records. Native sessions, credentials and raw scoped jobs/checkpoints remain excluded.
Bounded source observations nested in a marked assessment are provenance declarations,
not a portable execution session or grant of publication authority.

## Browser presentation and unfinished publisher

Overall progress distinguishes original ordinary publication dates from scoped input/reply/
completion dates, wrapper revision and consistency response date. It shows complete original
scoped concerns, low confidence and the warning that displayed metadata is not independent
worker verification or approval. Output is escaped plain text; freshness/reload/mobile checks
use curated fixtures with an adapter that rejects inference.

Still required before actual mixed/scoped apply:

1. The exact-source candidate verifier and durable injected-adapter task are now implemented
   separately. Dedicated provider routing/profile, user-facing selection/start/status/Stop
   and ambiguous-response handling remain gated.
2. Qualify the real provider bridge and source/task inspection path before treating a durable
   result as eligible for any separately confirmed publication. The task itself grants no such authority.
3. Saved-review/preview and atomic apply contracts, fresh consent, current source/assessment/
   snapshot checks, immutable history, durable idempotent receipt/lost-response inspection
   and assessment-only implementation compatibility preservation.
4. Human semantic qualification and broader effective permission/performance checks. The
   three earlier small live scope runs are not qualification of this new consistency contract.

There is no automatic scheduling, skip permission or savings claim here. Existing separate
ordinary-combination apply remains unchanged; temporary score proposals clear both provenance
markers rather than inheriting unrelated original-source claims.

```powershell
npx tsx --test src/storage/definition-mixed-assessment.test.ts
npm run test:browser:mixed-reader
```

Screenshot: `.reqwizit-state/browser-mixed-assessment-reader-mobile.png`.

Verification, 2026-10-30: type check, **1,359** deterministic tests (655 pretests +
704 main), UI build, all **fifteen** default browser runners, focused mixed reader tests/
browser, offline scoped preflight and diff check passed. New cases cover distinct unchanged
origins, model-output rejection, exact concern/identity/citation binding, conflicts/blocked
verdicts, broader versus metadata-only freshness, current/historical portable protection,
real folder adoption, raw 20→21 preservation with completed scope work/live leases, repeated
startup and future-format rollback/repair/retry. The browser checks original/recovery/wrapper
dates, escaped text, complete concerns, stale evidence and keyboard/mobile/reload with no calls.

All three existing SQLite-20 live qualification databases were inspected readonly with the
new code; their original CLI reports and saved-row digests matched and their database versions
remained 20. No calls were repeated to gain metadata. This slice made no live model call,
personal-project write, assessment apply, automatic skip, commit or push. The existing UI
bundle-size warning remains. Durable mixed consistency/source authentication, atomic apply,
live semantic/permission checks for the new contract and larger-project performance are open.
