# Definition publication and coverage certificates

Status: **implemented local publication evidence**, not automatic finding-level reuse.
New validated assessment-only definition refreshes may issue format-1
`definition-publication-v1` certificates. General discovery assessments, older saved
reviews and model-supplied declarations cannot self-issue them. No scheduler or skip
permission consumes these certificates. The explicit read-only
[per-finding origin preview](definition-finding-origins.md), now exposed in Overall
progress, re-verifies them as dated sources without changing saved reviews or granting
publication/skip authority. Joint model validation is a separate explicitly confirmed
browser action and still grants no publication authority.

## What is witnessed

At the app's adapter-dispatch boundary, `DiscoveryService` records a format-1
`definition-request-witness-v1` row with project/job/area IDs, original input revision
and full schema-read snapshot digest, phase, exact **context payload** digest, manifest
digest and detailed-record membership digest. A returned response completes that row
with its contract-normalized response digest. Response facts cannot be overwritten
with a different response. Digests contain no copied source/finding prose or credentials.

Reservation is not proof of provider delivery, billing or successful inference. Failed
or cancelled requests may leave incomplete witnesses. The witness covers arguments
supplied to the app-owned adapter, **not** a provider's transport, hidden instructions,
or proof that the model understood every record. Existing request allowance/attempt
ledgers remain authoritative and unchanged.

## Atomic issuance

`ProjectStore.finishJob` still applies its existing live-lease, expected-revision,
scope, citation and single-context/exact-stage validators. After successful validation,
the **same transaction** writes the original review, revision, completed job and optional
certificate. A certificate insertion failure rolls back the review/history/job
completion; the already returned response/witness can be retried without another call.

Issuance requires:

- Exact original input and published revision snapshots within the existing 16 MiB
  protocol bound, without hidden reader field/default/value conversions.
- A complete manifest re-created from the original published assessment, preserving
  original finding/answer/staged identity, evidence basis and whole-area guards.
- For a single request, a reconstructed and validated definition context/result that
  matches the dispatched/returned witness.
- For staged work, replay of every existing receipt and its original prior draft,
  cross-batch requests/follow-ups, plan and context hashes. Both collection and verification
  must be complete, and every final accepted stage context/response must match a witness.
- Every record in the broader dependency manifest supplied under the validated request
  policy, in the single request or in **both** staged collection and verification unions.

Some legitimate reviews omit historical/retired records that the experimental dependency
guard includes, or use older receipt representations without matching dispatch witnesses.
Those reviews remain valid under their original rules and simply receive **no certificate**.
Old requests are never repeated merely to acquire this optional representation. Same-input
staged continuation can use matching witnesses from earlier job IDs while preserving
original receipts and spent attempts. Cross-revision/model/input changes that cannot
reproduce the original witnesses remain uncertified, without discarding completed work.

Certificates bind original input/published snapshot keys, manifest/finding identities,
source job, accepted request/response/context references, covered-record count and staged
ledger digest. The certificate has `authority: "publication-evidence-only"`: it is not
a dependency partition, successful-findings certificate, completeness score or skip grant.
Supplemental evidence-request receipts are replayed as part of the staged ledger; the
coverage list describes final accepted read/check stages, not a billing list of all
intermediate requests, retries or unsuccessful calls.

## Verified reads and retained evidence

The internal store read requires an explicit project, area and original assessment
revision. It bounds the certificate before parsing, then re-reads original snapshots and
the completed source job. It revalidates the single/staged result, reconstructs the exact
published assessment (including app-added answer versions and staged metadata), and
rebuilds the certificate against original dispatch/response witnesses. A schema-valid
JSON envelope or matching self-declared manifest hash is insufficient.

Missing/changed/oversized source history, missing witnesses, changed source response or
unsupported evidence returns unavailable; it never substitutes another historical review,
backfills provenance or schedules a recheck. Later ordinary decisions can make today's
review outdated without relabeling the dated original certificate. Reading evidence
does not mutate project/history/jobs, start inference or grant allowance.

These are app-owned local provenance records, not signatures against malicious rewriting
of the entire database. No cryptographic authenticity of arbitrary user/model-supplied
history is claimed. Future reuse consumers must recheck original provenance and current
revision/content atomically; existence of a row is never sufficient authority.

## Compatibility and limits

SQLite **14 → 15**, `definition-publication-witnesses-v1`, adds
`definition_request_witnesses` and `definition_publications`. Existing project, execution,
job, workspace, portable and assessment formats are unchanged. No old row or semantic
key is rewritten, so no source backup is needed for this additive migration. Existing
live leases, grants, pauses, receipts and attempts remain untouched. Older in-flight work
without witnesses can finish normally without receiving a retroactive certificate.

Migration and format validation are ordered and transactional. Failed upgrades roll
back both tables and the ledger/schema advancement and can retry on reopen. Startup
rejects unsupported future formats/identity mismatches without overwriting them. Payload
reads are bounded at **2 MiB**, accepted coverage at **64 contexts**, and original snapshots
at **16 MiB**; the dependency protocol's 8,000-record/64-area/64,000-reference bounds
also apply. Limits never truncate evidence into a successful certificate.

Ordering-repaired current data may differ from immutable historical key metadata; if
the original input snapshot cannot reproduce the dispatch witness, no certificate is
issued. This does not invalidate the ordering repair or require reassessment. Certificates
and witnesses are local, not exported as portable authority. Compatible future changes
to readers/encoders must preserve verification of already-issued policies through frozen
validation paths or explicit forward compatibility, not reset data or repeat model calls.

See [migration ledger](migrations.md#definition-publication-certificates-2026-10-29) and
[remaining activation gates](definition-dependency-protocol.md#activation-gates--not-implemented).
Narrower finding partitions, mixed per-finding publication, dispatch skips and actual
saved-request reports remain unfinished. Live quality and large-project storage/replay
performance are not qualified by fixture tests.

## Checks

`src/storage/definition-publication.test.ts` covers real service single-request issuance,
exact-stage completion/continuation, immutable response witnesses, forged replies and
schema-valid forged envelopes, original-history/source re-verification, cancellation,
staleness, lease expiry, partial work, atomic rollback/retry without another request,
older-data/repeated-startup preservation, unsupported future formats, missing history,
unread broader guards, content replacement and bounded/corrupt reads.

```powershell
npx tsx --test src/storage/definition-publication.test.ts
```

Verification for this slice: **19 publication tests**, full **1,184-test** deterministic
suite, type check, production UI build, default seven-runner browser aggregate, focused
workflow/ordering-upgrade browser checks and diff check passed. Existing bundle-size
warning remains. No live inference, personal-project writes, commits/pushes or desktop
packaging were performed. `test:browser:all` was not run.
