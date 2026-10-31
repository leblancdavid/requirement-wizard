# Scoped finding provenance foundation

Status, 2026-10-30: **original-witness inspection implemented; publication not implemented**.
This is the first source-provenance slice for a future separately confirmed scoped
assessment publisher. It does not change scores, assessments, permissions or saved formats.
The later [mixed reader/consistency foundation](definition-mixed-assessment.md) adds a
separate persisted marker and SQLite 21/conditional portable 3; the original scoped packets
and inspection contract here remain unchanged and do not themselves publish anything.

## Scoped observations are not ordinary publications

The existing `definition-finding-origin-v1` describes an ordinary assessment publication:
it has a certificate, input/published snapshots and an assessment revision. A scoped result
has none of those publication witnesses. It must not fabricate them or masquerade as an
ordinary origin merely to pass the old joint/combined-review path.

New browser-safe schema `definition-scoped-finding-origin-v1` describes an **original
scoped observation**, with authority `provenance-only` and false publication/skip/request
authorization flags. It binds:

- Exact project, area, dimension, original input revision/snapshot and full output assignments.
- Original request job and separately named completed task. Saved-reply recovery may have
  different identities here; neither replaces the other.
- Original reply observation date and completed-task date, separately. Recovery does not
  become the original review date.
- Scope/context, exact original response/result, exact finding text/status/importance/
  evidence order, and the complete cross-dimensional-concern identity.
- Frozen `definition-combined-project-evidence-v1` guard/key over the original complete
  captured project evidence, not just cited records or assigned categories.

`definition-scope-provenance-v1` bundles the unchanged result, canonical request/output
assignments and all per-finding origins. The result retains its original check order and
**all** concerns, including concerns affecting unassigned dimensions. There is no arbitrary
single-finding selection or concern filtering in this slice. The packet has `inspection-only`
authority, false authorization flags and a **128 KiB** ceiling. Hashes bind local content;
they are not signatures, provider authentication, human approval or proof of semantic quality.

No `assessmentRevision`, `publishedAt`, ordinary certificate or existing whole-area
`inputBasis` is manufactured for these observations. The original ordinary-origin schema,
combined-assessment format and all v1 identities remain unchanged. Model response schemas
do not gain any app-owned provenance fields.

## Explicit verified inspection

`ProjectStore.inspectDefinitionScopeProvenance(projectID, { jobID })` is a strict, exact-job,
in-process readonly operation. There is **no new browser/terminal route or automatic caller**.
It differs intentionally from lightweight status:

1. Bind the selected checkpoint to the requested project and require completed output.
2. Bound checkpoint reads to the existing **192 KiB**, each original/completed job to
   **256 KiB**, and each source revision snapshot to the existing **16 MiB** ceiling.
3. Rebuild the original v1 scope/context from authoritative original snapshots. Verify
   original model/context/job/response/result witnesses, original root identity and dates.
4. For recovered replies, verify the original root response/date, not a copied current
   snapshot or later task's claimed review date. Live root workers block; expired workers
   can supply dated evidence without being claimed, stopped or rewritten.
5. Describe the per-finding origins and whole-result packet in the same deferred read
   transaction. Return unavailable on missing/changed/unsupported witnesses, without
   falling back to another task, modifying data or invoking a provider.

The completed run's durable completion date remains authoritative when older optional job
lifecycle timestamps are absent. A conflicting present job completion timestamp rejects;
missing optional timestamps are neither backfilled nor grounds for repeating a model call.

Inspection does **not** read/rebase against today's project state or certify current
compatibility. Later product edits or equal-version replacements leave the original packet
unchanged and dated. A future publisher must independently check current complete evidence
and all source witnesses again. The pure `describeDefinitionScopeProvenance` helper describes
already-verified declarations; passing caller-supplied job IDs/dates to it does not authenticate
them or authorize publication.

## Compatibility and recovery

No application migration: SQLite **20**, execution **2**, usage export **2**, portable
formats and saved scope run/request/result/marker policies are unchanged. The new provenance
packets are **format-1 transient projections**, never written into checkpoint/project JSON.
Previously completed/recovered pilot work gains this inspection without new metadata,
replacement model calls, reset, history edits or changed freshness. Existing scope reuse
and original dates remain intact across reopen/repeated inspection.

Malformed/future/oversized original witnesses remain unavailable rather than being repaired
or replaced. Successful inspection writes no provenance backfill, lease, grant, receipt or
publication record. A later supported inspection can retry without modifying saved work.
See the [migration ledger](migrations.md#scoped-finding-provenance-foundation-2026-10-30).

## Next publication slice — still a separate gate

Before any assessment write:

- A persisted mixed assessment reader/assembly/structural-consistency representation and
  forward SQLite/portable boundary now exist separately. A real consistency receipt,
  store-authenticated source selection and publisher are still unfinished.
- Specify a complete nine-dimension assembly rule. Partial output assignments cannot alone
  establish a whole assessment. Retain unassigned findings and their original origins rather
  than inventing missing findings, approval or independence.
- Define supported mixed-origin joint-consistency validation against complete current
  evidence. The existing joint task accepts ordinary publication origins, not these new
  scoped origins. Do not bypass it or reuse its verdict as support for a different assembly.
- Keep aggregate confidence conservatively low, unresolved concerns intact, and product
  approvals, implementation readiness and request authority separate.
- Add explicit no-call preview, fresh apply consent, atomic revision/snapshot/source checks,
  immutable history, durable idempotent publication evidence and lost-response inspection.
  Preserve otherwise-valid implementation reuse across assessment-only changes, without
  reviving work already stale for product/code reasons.

These are unfinished publishing requirements, not permissions granted by a provenance packet.
Human semantic sign-off, effective tool enforcement and a sound narrower evidence boundary
also remain separate; the three small live cases do not authorize automatic skips or savings
claims. See [dated live observations](definition-scope-live-check.md).

Focused checks:

```powershell
npx tsx --test src/service/definition-scope-review.test.ts
```

Verification, 2026-10-30: type check, **1,350** deterministic tests (646 pretests +
704 main), UI build, all **fourteen** default browser runners and diff check passed.
Six new provenance cases cover exact text/evidence/concern/assignment identity, root versus
recovery dates/IDs, repeated reopen without backfill or calls, absent optional lifecycle
timestamps, later/equal-version changes, malformed/future/oversized witnesses, cross-project
isolation and live/expired/missing roots. All three earlier live run databases also produced
unchanged original provenance through repeated inspection, without a new call or saved-row
mutation. Two live requests (privacy/quoted instruction) were made in this slice; retention
was not repeated. No assessment apply, automatic skip, personal-project write, commit or push.
The existing UI bundle-size warning remains; effective permission enforcement, human semantic
sign-off, persisted mixed provenance/publication and large-project performance remain open.
