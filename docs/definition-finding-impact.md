# Definition finding impact (read-only first slice)

**Overall progress → Inspect changes since a definition review** explains which
saved inputs changed. Open the disclosure, choose a reviewed area and explicitly
**Compare saved inputs**. Opening, selecting, polling, closing or reloading does not
fetch history or ask the AI. Inspection is available without authorizing new work.

The report separates:

- **Linked evidence changed:** a cited record, a linked source/answer/requirement, or
  a superseding record differs from the original review snapshot.
- **Other review inputs changed; independence is not established:** linked records
  match, but the area's wider evidence, project-wide decisions, organization or
  transitive dependency context changed. This is **not** an unaffected finding.
- **Same complete-area inputs:** exact compared context matches. The original finding
  can still describe a gap; existing review status and freshness remain authoritative.
- **Dependency comparison unavailable / No saved finding:** evidence/provenance is
  missing, ambiguous or beyond the read limit, or that dimension was not recorded.

Counts describe records entering, leaving or changing in the relevant context, not
records necessarily added/deleted from the project. Prior evidence remains saved.
Citations and their link closure are not an exhaustive dependency declaration. In
particular, a new relevant decision need not have been cited by an older review.
This report cannot authorize skipping a finding or reviewing only a delta.

## Safety and provenance

The comparison verifies the original assessment at its saved revision against the
retained finding, including original status, explanations, citations, answer versions
and staged-review metadata. Retained input bases must match the original snapshot.
Matching old findings without a basis can be compared as snapshot facts, but no new
basis is installed and existing legacy freshness behavior is unchanged.

For older ordering-affected reviews, the selected raw original snapshot may prove an
object-property-order-only key projection. Inspection uses that key in memory only;
all fields, values and array order must match and the raw snapshot must reproduce the
original hash. This preserves original findings/history and does not authorize
finding-level skips. Missing raw witnesses remain unknown. See
[storage-order compatibility](migrations.md#definition-storage-order-compatibility-2026-10-29).

It reads only the selected original snapshot, not an archive or a substitute older
review. Missing, invalid, mismatched or oversized originals stay unknown. The local
limit is **16 MiB** for each current/original snapshot, **8,000 evidence records** and
**64,000 references** per compared project. Oversized current requests reject before
parsing; oversized originals return an unavailable comparison. Evidence is never
silently shortened or treated as irrelevant because it was omitted.

The authenticated endpoint is revision checked and read-only. It bypasses the general
store reader's lazy legacy-history projection so that its own bounds apply first.
It does not claim workers, alter leases, grant allowance, create jobs or write project/
activity/history/settings/assessment data. No evidence prose is copied into the response.
Its format-1 `definition-finding-impact-v1` response is an advisory view, not a saved
assessment or dependency certificate. See [compatibility](migrations.md#finding-level-impact-inspection-2026-10-29).

Reports retain their inspection version separately from current state. A view-only
content token also detects equal-numbered adoption/replacement; optional legacy basis
projection is handled separately. A changed project dates the result instead of
replaying the inspection. Concurrent writes reject stale inspection requests; compare
again explicitly after reviewing the latest information. No score, finding status,
approval, assessment fingerprint or workflow readiness rule is changed.

## What is not implemented

Automatic finding-level reuse and delta-only assessment remain **unimplemented**.
Rechecks still use existing complete-area evidence and consent. No AI requests saved
or live quality improvement is claimed by an unchanged citation count.

A later reuse protocol needs versioned, reviewable dependency/guardrail manifests,
coverage of new/removed evidence and negative assumptions, exact original provenance,
atomic publication, stale-result checks and preservation of previous completed work.
Unknown dependencies, ambiguous scope or insufficient context must still fall back to
whole-area review. Calling a mutation “wording cleanup” is not a semantic proof.

An [inspection-only dependency-protocol prototype](definition-dependency-protocol.md)
now tests app-owned per-finding identities with a shared whole-area population guard.
It is not wired to this inspector or scheduling and enables no automatic skips.
An optional [local publication/coverage layer](definition-publication.md) now binds
new validated definition-only reviews to exact app-owned context/response witnesses;
older reviews remain valid without it. Finer-grained partitions, mixed publication
and skip activation remain unfinished.

## Checks

`src/storage/definition-impact.test.ts` covers original/full-context matches, new
uncited decisions, transitive dependency/project-wide versus unrelated edits, changed
answers/reviews, superseding cycles, missing/ambiguous/bounded evidence, legacy byte
preservation, equal-numbered replacement, API authorization and active-worker reads.
`npm run test:browser:definition-impact` checks explicit reads, dated and concurrent
results, conservative fallbacks, unavailable history, keyboard/mobile and no model
calls or inference-state writes. Screenshot:
`.reqwizit-state/browser-definition-impact-mobile.png`.
