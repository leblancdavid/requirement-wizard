# Combined assessment provenance format and compatibility

Status, 2026-10-30: **reader/schema/transport foundation plus explicit atomic apply**.
Saving a reviewed combination still saves only local evidence. A separate eligibility
check and confirmation can now apply it; see the new apply contract below. Earlier
reader-only qualification results in this document remain dated foundation evidence.

## Per-finding provenance without rebasing

The optional app-owned `assessment.combinedReview` field has format 1 and policy
`definition-combined-assessment-v1`. It binds the wrapper's input/assessment revisions,
publication identity/date, reviewed-content reference/date, joint/root request references,
candidate/context/response identities, nine original finding packets and a separate
conservative evidence guard. The authority remains **`provenance-only`**: a content hash
is not a signature, independently verified adapter witness, human product preference,
approval, readiness or permission to publish/skip work.

The wrapper revision/date does not replace individual original review/input revisions,
source jobs, publication dates or evidence identities. Each finding must exactly match
its original finding key; all nine dimensions must occur once. Project/area identities
must match, the wrapper revision must match its metadata and follow its input revision,
and duplicate current assessment identities are rejected for marked data. Missing bases,
an inherited ordinary staged-review claim, altered finding text/importance/status/evidence
or unsupported future packet formats are rejected instead of silently dropping provenance.

Ordinary/staged **model output schemas omit this field and reject it**. Knowing the JSON
shape cannot issue app-owned provenance through a model assessment response. Raw imported
metadata is still a declaration, not authentication. The explicit publisher independently
re-verifies source witnesses and requires separate apply consent. Its aggregate confidence
is conservatively low; reader fixtures alone do not qualify publication.

The origin schema/hash moved to browser-safe `definition-finding-identity.ts`, sharing the
stable dimension order. It uses the exact same canonical UTF-8 SHA-256 document as the
previous Node implementation. Existing origin packets, keys and serialized field order
are unchanged; no original provenance is regenerated, renamed or backfilled.

## Additional conservative freshness, not narrower independence

The frozen v1 `inputBasis`/`definitionInputKey` is unchanged. For **marked assessments
only**, `definition-combined-project-evidence-v1` adds a separate `guardKey` over all
project evidence, not just selected citations/area records:

- Original workspace context, global interpretation/goals/actors/assumptions and all epics.
- All sources, questions, requirements and research, including additions/removals, links,
  populations and records in other areas.
- Refinement/organization proposals and scan evidence/omission metadata, conservatively.

Project concurrency, other assessments, receipt prose, local routing/account selection,
derived scope scores/notices and coding progress are excluded. Thus metadata-only revisions
or another local account need not force a recheck, but even an unrelated evidence edit
can stale this initial combined representation. This intentionally does **not** claim a
sound narrower partition or minimize requests. The v1 key and this guard must both match
for current coverage/retention; guard hashes are computed once per compared project.

Older unmarked assessments keep their exact previous freshness behavior, identities and
scores. No update converts them to a stricter policy or repeats calls to acquire metadata.
The old single-review dependency/publication inspector cannot treat a combined wrapper
as one ordinary original review or self-issue a v1 certificate. The old impact inspector
falls back to unproved provenance rather than claiming its smaller context is exhaustive.
The assessment display distinguishes original finding dates from wrapper version and
warns that metadata is not independent authentication or readiness.

## SQLite 17 → 18

`combined-assessment-provenance-format-v1` establishes a **format boundary**, not a data
conversion. No table/old row, project concurrency counter, grant, original key, local
review acknowledgement, job/checkpoint, execution schema 2 or portable code evidence is
rewritten. No backup is needed because the migration writes no old payload. Older apps
reject SQLite 18 instead of reading new marked data while dropping its provenance.

Startup validates only current projects containing the optional marker, with a 16 MiB
read ceiling and exact project/revision identity. Older unmarked payloads are not backfilled
or reparsed for conversion. Historical marked snapshots are validated when read/adopted,
not by an unbounded startup history replay. Unknown future formats reject without overwrite;
validation failure rolls back migration ledger/schema advancement, and reopen can retry.
Existing rows, completed work and live discovery/execution leases remain intact.

## Conditional portable state format 2

Normal projects still emit **byte-compatible `state.json` format 1**. The writer emits
**state format 2 only when combined provenance exists**, either in the current assessment
or in assessment objects referenced by retained continuation snapshots. Historical-only
provenance cannot be hidden behind a format-1 current wrapper. Format-1 readers reject the
new envelope before dropping unknown assessment fields; this is checked against the old
envelope contract, not a qualification run of every older binary.

The new reader accepts ordinary formats 1 and 2, but rejects a format-1 envelope carrying
combined provenance. Future marker versions are rejected, not stripped, in both current
and historical project validation. The surrounding project layout, manifest, execution
envelope and continuation format remain unchanged. Old continuation objects, semantic
assessment/checkpoint identities and model/account redaction stay intact.

Folder adoption/checkpointing preserves original finding dates/IDs, wrapper/guard identity
and saved work under a different local account without model calls. Unsupported shared
future data is rejected before local overwrite and is not rewritten in the folder.
Machine-local reviewed-content records, native sessions and publication authority are not
fabricated from portable metadata; a referenced local review UUID can be unavailable in
a clone. See [migration ledger](migrations.md#combined-assessment-provenance-format-2026-10-30).

## Remaining gates and checks

Actual publication now uses a separate explicit apply action with atomic source/current-token
verification, original-history preservation, low aggregate confidence and implementation-reuse
safeguards. Neither the local content acknowledgement nor the schema grants that authority. Narrower
partitions, automatic finding-level skips and broad live/savings/performance qualification
remain unfinished. There is no new request permission or paid probe here.

Deterministic tests cover origin-hash equivalence, exact per-finding binding, model-output
rejection, broader-guard invalidation, metadata-only/local-routing reuse, unchanged legacy
keys, current/historical portable format protection, actual folder adoption/checkpoint,
future-data rejection without overwrite, raw old-data preservation, live workers, repeated
startup and failed 17→18 validation/retry. The browser uses a curated reader fixture and
an adapter that rejects every new call; it checks original versus wrapper dates, broader
freshness, reload/mobile display and unchanged findings. It does not exercise publication.

```powershell
npx tsx --test src/service/definition-joint-review.test.ts src/storage/portable.test.ts
npm run test:browser:combined-assessment-reader
```

Verification, 2026-10-30: type check, all **1,253** deterministic tests (549 pretests
and 704 main), focused provenance/portable/migration/retention checks, focused reader
browser, full eleven-runner default browser aggregate/UI build and diff check passed.
No live model calls were made. The existing bundle-size warning remains; publication,
live semantic/provider behavior, large-project replay and actual savings are not qualified.

## Explicit current-assessment apply (SQLite 18 → 19)

Open a saved review in **Saved reviewed combinations**, then choose **Check apply
eligibility**. This read rebuilds the supported joint preview from exact original sources,
adapter/root-request witnesses and current revision/snapshot tokens. It binds an `applyKey`
to the review/preview, current assessment, proposed checks and conservative guard. The
screen discloses current/proposed area score estimates and the low-confidence policy.
The unchecked confirmation is separate from the earlier local-content acknowledgement.

`definition-combination-apply-preview` and `definition-combination-apply` are authenticated,
origin-checked POST routes with strict request shapes. The write requires `confirmApply:
true` and the exact plan key; it never accepts caller-supplied findings. Active/expired
implementation workers, pending/running discovery, unpaused workflow/maintenance and
unfinished saved input block apply. Stale sources/tokens or unsupported formats fail closed
without substituting another review or issuing inference.

One immediate SQLite transaction re-verifies sources, publishes nine original checks with
**low aggregate confidence**, retains original dates/statuses/evidence/gaps, appends history,
and writes implementation compatibility plus one bounded Activity receipt. Failure rolls
everything back. Original local reviews and old assessments remain immutable. Requirements,
product decisions, approvals, AI allowance, planning, coding and delivery are not advanced.

Receipt policy `definition-combination-publication-v1` has authority
`publication-evidence-only` and `canAuthorizeFurtherWork: false`. Its Activity ID is
`combination-publication:<review UUID>`; reads are bounded to 16 KiB. An identical request
returns its original receipt without another revision only while the exact published
snapshot is current. Later edits return `publication-not-current`; eligibility shows the
dated receipt rather than reapplying. Ambiguous transport responses are not automatically
retried: explicitly check eligibility to inspect durable evidence first. Opening history
does not check eligibility automatically.

Execution schema remains **2**, adding optional `definitionRevision` with policy
`definition-assessment-only-v1`. The unchanged recovery-input key proves a contiguous
assessment-only interval, not general equivalence or a new concurrency counter. Apply
extends a currently valid recovery/publication interval or starts at the preceding revision.
Assessment restoration can extend a current publication interval. Original plan approvals,
plan/check/run revisions, sessions, attempts and delivery evidence are never rebased.
Content/config/workspace/manual-request gates remain; already stale work stays stale.

SQLite **18→19** is a no-rewrite format boundary. Existing data gains no certificate or
receipt on upgrade. Startup rejects future receipt/certificate formats without overwrite
or schema advancement. No new tables/full Activity archive are exported. Portable state
format 2 is additionally required whenever execution carries `definitionRevision`;
adoption validates its format/current input key and preserves compatible plan/code evidence
under local account rerouting. Native sessions/local receipt authority are not exported.
Ordinary unmarked state is unchanged.

### Response recovery and confirmation races

Browser receipt validation checks the strict format/content hash and **all** request
identities: project, area, review ID/key, input revision/snapshot and, on writes, apply key.
A self-consistent packet for another request is not accepted as successful application.
This is response validation, not new independent authentication or permission to retry.

The recovery browser variant injects a pre-commit outage, then commits a confirmed write
while replacing its response with a failure. Both failures clear the plan/checkbox; a
pre-commit retry requires a new eligibility check and new confirmation. After commit, an
explicit eligibility read retrieves the original receipt. Further reads/reload never
resend the write. The race variant inserts a real concurrent product note after checkbox
consent but before the server handles apply: the old plan is rejected, findings remain
unchanged, and reload/eligibility cannot authorize a retry. These are deterministic local
HTTP/UI faults, not a claim of exhaustive production network or crash qualification.

Mixed-sequence tests restore an assessment, apply reviewed findings, then restore another
assessment using actual store operations. The interval retains original code findings.
A genuine product edit breaks that interval; a later restoration does not revive it.

```powershell
npm run test:browser:definition-combination-recovery
npm run test:browser:definition-combination-race
```

No persisted representation or freshness projection changes in this hardening slice:
SQLite remains 19, execution schema 2 and portable envelopes unchanged. Existing completed
work/revisions/receipts require no migration, reset or repeated model calls.

Recovery-hardening verification: **1,262** deterministic tests (558 pretests + 704 main),
type check, UI build, all thirteen default browser runs, focused recovery/race checks and
diff check passed. No live model calls, commits or pushes; bundle-size warning remains.

Apply verification, 2026-10-30: type check, **1,260** deterministic tests (556 pretests +
704 main), focused apply/recovery/portable/migration checks, UI build, all eleven default
browser runners and diff check passed. Actual browser apply checks explicit consent,
low confidence, receipt reuse, original provenance and reload/mobile without inference.
Saved implementation fixtures cover plans/code/paused runs, stage attempts, stale-work
exclusion, real folder adoption and certificate-only format protection. Injected receipt
failure rolls back project/history/execution; future receipt/certificate upgrades reject
without overwrite and retry safely. No live model calls, commits or pushes occurred.
Live quality/provider enforcement, narrower automatic reuse, broad savings and large-project
performance remain unqualified. The existing bundle-size warning remains.
