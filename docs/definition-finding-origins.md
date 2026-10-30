# Original provenance for individual definition findings

Status, 2026-10-30: **implemented internal read-only preview**, not mixed review
publication or automatic finding-level reuse. There is no browser/HTTP endpoint or
scheduler consumer. Continue specification, assessments and coverage retain their
existing behavior and permissions.

## Content-bound original identity

`src/core/definition-finding-origin.ts` describes each original dimension with a
format-1 `definition-finding-origin-v1` packet. It retains the original:

- Project/area/dimension, publication job, input and assessment revisions, and
  publication timestamp—not the current preview revision.
- Verified publication-certificate key, input/published snapshot keys, manifest and
  assessment keys, finding key and input-basis key.
- Dependency policy and explicit `whole-area` guard.

An `originKey` binds the complete packet. This is content identity, not a signature or
authentication of a self-declared source. The pure descriptor validates shape only;
consumers must independently re-verify the referenced publication. It copies no
finding/evidence prose, changes no original finding and records no new preference.
Mutating a returned object does not update saved evidence or a later regenerated packet.

## Explicit source selection and verification

`ProjectStore.previewDefinitionFindingOrigins(projectID, request)` accepts the current
revision/full snapshot token, one area, and up to nine explicit selections:
`{ dimension, assessmentRevision, certificateKey }`. Duplicate dimensions, future
revisions, unsupported fields and model-supplied origins are rejected. The app does
not scan history, choose a newer/older substitute, restore a missing review or infer
origins for uncertified legacy work.

The entire operation uses a SQLite read transaction, so current state, certificates,
original snapshots and witnesses belong to one consistent database view. Each selected
publication is re-verified through the existing bounded source/coverage reader. The
selection must still match the exact certificate key. Original full-area guards are
then compared with the current content-bound snapshot, once per selected source.

The format-1 `definition-finding-origins-preview-v1` result returns all nine dimensions:

- `not-selected`: no source was selected; never treated as assessed.
- `unavailable`: source evidence is missing, changed, unsupported or over its bound.
- `guard-match`: the original full-area guards match the inspected current inputs.
- `whole-area-review`: those guards changed or could not be proved. When available,
  original provenance remains attached with its original date and evidence identity.

`sourceCount` counts explicitly selected source revisions, not successful reviews or
requests saved. A content token detects equal-numbered replacement as well as ordinary
revision changes. Later actions must revalidate their own revision/content; a preview
is not a write/permission token. No workers, leases, grants, attempts, Activity entries,
project state or historical evidence are changed during inspection.

## Guard equality is not a mixed review

The existing `definition-dependency-proof-v1` comparison still requires the entire
current assessment to match its original. A separate
`definition-finding-guard-proof-v1` policy compares only the selected source's **original
whole-area guard** against current evidence. It does not assert that today's finding
is unchanged or present. A missing current assessment stays missing after inspection;
archived target areas are not eligible. Existing freshness/readiness rules are untouched.

Findings from different verified reviews can retain different original dates even if
their guards match. Their conclusions may contradict each other under the same inputs.
The preview therefore always says:

```text
authority: inspection-only
partition: whole-area
canPublish: false
consistency: not-established
```

Matching every guard does not prove joint consistency, resolve gaps, approve proposals
or authorize skipping calls. Category labels, citations and a model's exhaustive
declaration do not establish narrower dependency partitions. Such partitions still
need sound positive/absence/global-scope guards and verified interaction boundaries.
Mixed publication additionally needs cross-finding validation, per-finding immutable
origins in the saved format, atomic stale-result checks and forward compatibility.
An explicit internal [joint consistency task](definition-joint-review.md) now reviews
all nine selected findings together against exact current evidence and saves bounded
local model judgement. The origin preview itself remains inspection-only and unchanged;
neither a supported joint verdict nor matching guards authorize mixed publication.
See [activation gates](definition-dependency-protocol.md#activation-gates--not-implemented).

## Compatibility and limits

This origin-preview slice kept SQLite at 15 and added no persisted project/job/assessment,
certificate, workspace or portable format/key changes. The later joint-review slice adds
local checkpoints through **15 → 16**; execution stays schema 2. There is no new saved origin
array, schema migration, startup projection/backfill or inference requirement. Existing
certificates are re-used as factual sources without rewriting them. Older work without
certificates remains valid under its existing rules and is not repeated to create origins.

Requests are capped at **16 KiB** and **nine selections/distinct sources**. Current and
original snapshots retain the dependency protocol's **16 MiB** bound; certificate,
job, witness, record/reference and stage limits remain enforced by the publication/
dependency readers. No successful preview is created by truncating evidence. Snapshot
prose is not cached across sources; only bounded certificates and guard results are
cached for the requested read. Multiple full source replays can still be expensive;
large-project performance is unqualified. No unbounded archive scan is performed.

Any future saved mixed-result representation needs a separate ordered migration and
preservation/reopen/failure-retry tests. It must retain these original dates and identities
without rebasing old findings or requiring repeat calls solely for a representation change.
See [compatibility ledger](migrations.md#per-finding-origin-preview-2026-10-30).

## Checks

`src/storage/definition-finding-origin.test.ts` covers different original dates and
conclusions, guard-only versus whole-assessment policies, new uncited relevant/global
decisions, unrelated edits, incomplete selections, missing legacy sources, changed
certificate tokens, stale/equal-numbered adoption, unsupported/self-declared provenance,
read bounds, unknown current fields, live leases/spend, repeated reopen, corrupt sources,
missing current assessments and archived targets. No model inference is used.

```powershell
npx tsx --test src/storage/definition-finding-origin.test.ts
```

Verification: all **12 origin tests**, full **1,196-test** deterministic suite, type
check, production UI build and diff check passed. Browser runners were not rerun for
this internal read-only change. The existing bundle-size warning remains. No live
inference, personal-project writes, commits/pushes or desktop packaging were performed.
