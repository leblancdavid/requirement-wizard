# App-owned definition review scope contract

Status, 2026-10-30: **local core contract plus injected-adapter execution pilot**.
The later [durable pilot](definition-scope-pilot.md) adds explicit in-process execution,
job markers and checkpoints under SQLite 20. An [explicit provider bridge](definition-scope-providers.md)
now supports the existing adapters, with later explicit browser/queue dispatch. No publisher
or automatic skip is enabled for this contract.
This follows the [counterexamples to category/citation narrowing](definition-partition-experiments.md).

## Output scope is not evidence scope

The app assigns one to nine output dimensions explicitly. It still supplies the complete
project-evidence envelope: all source/question/requirement/research populations, original
wording/options/answers, project interpretation, epic definitions/dependencies, refinement
and organization proposals, and scan evidence/omission metadata. Other categories' prose
is never hidden. Existing assessments, receipts, local model routing and derived execution
state are not product evidence; the separate full-snapshot token still binds the view.

This is a defensible task boundary, **not a narrower dependency proof**: asking for only a
rules finding does not establish independence from a data question or permit retaining
the other eight findings after a change. The guard remains the existing conservative
`definition-combined-project-evidence-v1`; all authored must-detect mutations in the
22-case experiment change it. There is no request-reduction claim or savings baseline.

## Build and verify locally

`prepareDefinitionReviewScope(project, request)` accepts an exact project ID, active area,
revision/full snapshot key and distinct assigned dimensions. No caller-supplied evidence
subset, category filter, grant, model assertion or `allowAI` field is accepted. Dimension
order canonicalizes using the stable wire order; duplicate/unknown assignments reject.
Fresh tasks need no previous assessment and never mint missing original provenance.

The returned packet contains:

- Scope format 1, `definition-review-scope-v1`, authority `task-binding-only`.
- Project/area/revision/snapshot, assigned outputs, complete evidence inventory and guard.
- `scopeKey` over those fields and `contextKey` over the exact complete context.
- `canPublish`, `canAuthorizeSkips` and `canAuthorizeRequests` all **false**.
- The full evidence context and explicit instructions to retain uncertainty, report
  cross-dimensional concerns and invent no preferences/approvals/implementation proof.

Keys are content identities, not authentication or authorization. Future callers must
load authoritative state from storage, not accept a model's replacement project object.
`verifyDefinitionReviewScope` rebuilds the entire expected packet from that state. Merely
rehashing a packet with omitted questions, masked prose or a modified inventory cannot
make it the app-owned scope. The model must receive the complete packet, including its
outer context key; the helper's context object alone is not a future dispatch contract.

Same-numbered content replacement, changed revisions, wrong projects/areas and obsolete
packets fail closed. This prototype does not issue calls or auto-retry after mismatch.
Even metadata-only view changes can require rebinding a local packet; this is not a rule
to invalidate older saved assessments or replay existing completed jobs.

## Strict output and cross-dimensional concerns

`validateDefinitionReviewScopeResponse` first re-verifies the authoritative packet, then
requires a strict response with echoed scope/context keys, exactly one check per assigned
dimension and a separate `crossDimensionConcerns` array. Checks cannot alter unassigned
dimensions, add requirements/approvals, set aggregate confidence, self-declare exhaustive
scope or issue publication authority. All citations must exist in the supplied inventory.

A reported concern must span at least two distinct dimensions, touch an assigned dimension,
and cite supplied evidence. Any assigned check touched by a concern must remain `unknown`,
`partial` or `needs-review`, not `defined`/`not-applicable`. A concern does not grant an edit
to an unassigned finding. Validated results have `validated-output-only` authority and all
three authorization flags remain false. Their shape cannot be used as an ordinary complete
nine-dimension assessment or as a saved combined publication certificate.

These validators enforce structure and reported uncertainty. They cannot prove that a
model noticed every relationship, cited appropriate evidence or reported every concern.
Model/human semantic qualification and an eventual joint-consistency/publication boundary
are still required; omitted concerns are not a mathematical independence proof.

## Bounds and conservative failure

The core reuses dependency snapshot validation: exact schema without dropped/converted
fields, 16 MiB snapshots, 8,000 evidence records, 64 areas and 64,000 references. All records
seed the closure, including unrelated populations; missing links, duplicate identities and
supersession cycles reject. Ordinary answer/question cycles remain supported.

The pilot also rejects any archived area needed by this full-population closure, including
an unrelated archived area that still owns records. It does not silently omit those records.
Archive-aware envelope treatment remains a future extension, not a reason to reset/archive
user data or replay old model calls. Default browser/CLI discovery does not use this new helper.

Contexts above **96,000 characters** return `complete-envelope-context-limit`, never a
sampled/truncated success. Packets cap at **1 MiB**, replies at **64 KiB**. Oversized or
unencodable packets/replies reject. No partial contract is published on failure.

## Compatibility and next gate

The initial core prototype changed no persisted versions; the later execution pilot adds
SQLite 19→20 and local scoped jobs/checkpoints. Execution 2 and portable formats remain.
The extracted shared evidence-document
helper preserves the exact frozen combined guard document/hash; old metadata and freshness
semantics are not redefined. No history is rewritten or existing completed work invalidated.
Tests compare the extracted hash with the previous literal document and preserve inputs.

The separately authorized injected-adapter execution pilot now retains original scope/context/
response witnesses with explicit cancellation/recovery, without downgrading old provenance.
Provider integration and explicit browser dispatch are implemented with deterministic
checks; live provider/semantic qualification remains a separate gate.
The [readonly original-provenance foundation](definition-scope-provenance.md) now describes
verified original scoped observations without rebasing them. Before saving findings as
assessments, add a forward-compatible persisted representation and atomic whole-assessment/
joint-consistency rules. **Automatic finding-level reuse remains blocked**
until there is a sound narrower evidence contract plus adversarial and human-reviewed
qualification. The local output-scope contract alone does not establish that independence.

```powershell
npx tsx --test src/core/definition-review-scope.test.ts src/core/definition-partition-evaluation.test.ts
```

Verification, 2026-10-30: type check, **1,296** deterministic tests (592 pretests +
704 main), focused scope/dependency/partition checks, offline partition regression,
UI build, all thirteen default browser runs and diff check passed. Tests cover all nine
assignments, exact envelope preservation, rehashed omissions/masking, stale equal-numbered
views, output/citation/concern enforcement, missing links including empty-area dependencies,
supersession cycles, archive fallback and packet/context/reply bounds. Browser runs qualify
existing workflows after the shared guard extraction, not a new scoped-review UI/dispatch.
No live model calls, commits or pushes. Existing bundle-size warning remains; live scope
execution, semantic independence and automatic savings are not qualified.
