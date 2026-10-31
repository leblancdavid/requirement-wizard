# Reviewed mixed findings: local history and explicit assessment apply

Status, 2026-10-31: **saved review history, exact publication preview, eligibility and
separately confirmed atomic apply implemented**. This completes the assessment-only path
after the [explicit mixed browser task](definition-mixed-browser.md). It does not enable
automatic finding-level skips, product approvals, planning/coding, more AI requests or
semantic/live-provider qualification. Tests use synthetic adapters, not live inference.

## Three separate permissions

These optional experiments are in **Settings → Advanced assessment tools**, not Overall
progress. For everyday use, simply refresh definition coverage from Overall progress; missing
experimental source records do not invalidate saved assessments or require another model call.

1. **Start mixed review** authorizes at most one consistency request, not publication.
2. **Preview mixed findings for review → Save reviewed mixed findings** retains an immutable
   local content acknowledgement, not a replacement assessment or product decision.
3. **Check mixed apply eligibility → Apply reviewed mixed findings** requires separate,
   initially unchecked confirmation bound to that exact saved review, inputs and apply plan.

Opening controls, loading history, reading a review and checking eligibility do not write
reviews/receipts, reserve requests, acquire workers or run a model. The task's supported
verdict and every hash retain their previous evidence-only meanings; neither can publish alone.

## Exact supported-source preview and immutable history

The publication preview is distinct from the pre-request candidate preview. It requires an
explicit completed mixed job, its actual verified original/root request and reply, structural
support, all nine exact origins and full original scoped packets/concerns. Original witnesses
are replayed through the existing bounded store verifier; caller-supplied declarations or
`supported` booleans cannot substitute for them. Reassess/blocked/conflicting judgments, stale
inputs, changed equal-numbered snapshots, missing/changed sources and unsupported formats reject.

It captures current revision/snapshot, current assessment identity and each current finding,
alongside unchanged proposed findings, original publication/scoped response dates, recovery
completion dates, mixed request/root identities, original response and complete concerns.
The browser displays differences without rewriting original status, uncertainty, explanation,
evidence order or concern text. Acknowledging reviewed contents is not approval of product
choices, verification of semantics or proof of narrower independence.

Saving re-prepares the exact preview in an immediate transaction and checks its key. Saved
reviews have stable IDs/dates and `review-evidence-only` authority with `canPublish: false`.
The same exact preview reuses its review rather than duplicating local acknowledgements.
History pages contain at most ten reviews, replacing the displayed page; dated reads do not
assert current eligibility or silently select a substitute. Reviews survive later edits,
publication and reopen without requalification/model calls. Malformed entries fail closed.

## Current eligibility, fresh confirmation and atomic apply

Eligibility revalidates the saved preview against exact current source/root witnesses,
project revision/full snapshot and current assessment identity. It reports current/proposed
score estimates and **low** aggregate confidence. Existing idle/paused-workspace admission
rejects active or expired implementation leases, active jobs/workflow, unpaused workflow or
maintenance, unfinished saved input and unsupported execution evidence. It does not stop,
recover, resume or spend another worker's allowance.

Apply requires a fresh `confirmApply: true` and the exact plan key. Under a single immediate
SQLite transaction it redoes eligibility/source/current-input checks, then commits:

- One new project revision replacing only the selected area's assessment and receipt prose.
- Exactly nine unchanged original findings, preserved original ordinary/scoped provenance and
  every original concern in the existing `definition-mixed-assessment-v1` representation.
- Conservatively low confidence and unchanged statuses/gaps, not a new whole-area confidence
  judgment, product approval or readiness certificate.
- Revision history, definition-only execution compatibility evidence, a durable publication
  receipt and activity entry together. Failure at any point rolls all of these back.

No source/requirement/question/decision/model, approval, AI grant, task attempt, native coding
session, implementation assessment/plan/run/delivery evidence is rebased or deleted. The existing
`definition-assessment-only-v1` certificate extends only an exact contiguous assessment-only
revision interval. Legacy and modern otherwise-valid implementation reuse remains available;
already stale work and real content/workspace/config changes stay stale. Execution schema **2**
and its fingerprints are unchanged. An execution CAS version advances for the certificate;
original evidence dates/revisions/sessions remain original.

## Receipts, races and uncertain responses

A unique per-review receipt binds the exact saved review/preview/apply keys, input/published
revisions and snapshot keys, final assessment/provenance hashes, publication ID/date and separate
apply authorization. Its authority is `publication-evidence-only`, with further-work permission
false. Repeating the exact committed apply returns the same receipt/project without another
revision or execution write while that publication is current. After later edits, eligibility
returns a dated receipt with `current: false`; it does not republish or rebase old findings.
Corrupt/unsupported receipts never fall through to another write.

A failed or ambiguous save/apply response is never automatically replayed. A save uncertainty
requires an explicit history read before another explicit save. An apply uncertainty removes
the plan/confirmation; **Check mixed apply eligibility** inspects any existing receipt using
the original saved review/input token, even if the workspace has advanced. If no write occurred,
another eligibility check offers fresh unchecked consent, not an automatic retry. A concurrent
human edit invalidates the old apply plan; the browser clears effective confirmation and retains
dated evidence. Reload loads nothing until explicitly requested; saved history can recover the
review and its receipt without another model call or write.

## Compatibility, bounds and remaining limits

Verified on 2026-10-31: `npm run check`; full `npm test` (**1,416 passing**:
712 pretests + 704 main); UI build and all **17 browser runners** (the new publication
runner exercises normal, recovery and concurrent-edit scenarios); final focused **16-test**
publication rerun after expanding implementation-evidence preservation fixtures; and diff check.
The existing UI chunk-size warning remains non-blocking. No live calls, commits or pushes.

**SQLite 22→23** adds `definition_mixed_saved_reviews` and `definition_mixed_publications`.
Saved review/receipt policies are new local-only format-1 records; old task checkpoints,
ordinary/scoped origins, request/assembly/context keys, mixed assessment reader format,
execution **2**, usage export **2** and conditional portable envelopes **1/2/3** are unchanged.
Published mixed assessment provenance and definition-only implementation compatibility already
fit portable format 3; raw reviews, receipts, provider/native sessions and task archives are
not portable authority. Import does not recreate local publication receipts or permission.

Migration is ordered/additive and transactional with the ledger; no old row, timestamp,
fingerprint, concurrency counter or completed work is converted. No backup/reset/backfill or
repeat model call is needed. Startup validates bounded local record formats/identities, not
historical source semantics or provider support. Future/unsupported formats reject without
overwriting data and roll back upgrade advancement; supported restoration permits a retry.
Other owners' live leases remain intact. Older apps reject SQLite 23 before consuming new state.

Saved reviews cap at **3 MiB** including full preview/origins/concerns/current findings; receipts
cap at **16 KiB**. Existing mixed task/source/context bounds remain: complete captured context
96,000 characters, original snapshots 16 MiB, checkpoints 192 KiB and job witnesses 256 KiB.
History validates at most ten bounded records per page. No evidence is sampled/truncated;
whole-call time/memory on larger archives remains unqualified. These are structural/witness
checks, not independent provider authentication, human semantic sign-off, effective tool
enforcement or measured savings. Automatic skips and narrower evidence boundaries stay disabled.

```powershell
npm run check
npx tsx --test src/storage/definition-mixed-publication.test.ts
npm run test:browser:mixed-publication
```

Deterministic coverage includes real original-source preview, unchanged findings/full concerns,
separate consent, immutable save/reuse/history paging, strict API gates, stale/equal-version and
damaged sources, active-work admission, low-confidence apply, original dates and portable reader
roundtrip, valid/stale implementation reuse, atomic failure injection at receipt/revision/activity/
execution writes, dated idempotent receipts, future-format rejection and upgrade preservation/retry.
Browser scenarios cover normal apply, lost saved-review acknowledgement, pre-commit failure,
lost committed apply response without replay, a real concurrent product edit, reload and mobile.
