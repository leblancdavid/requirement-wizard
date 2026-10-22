# Graph-backed discovery and current-specification contexts

## Implemented first slice (2026-10-22)

Storage and inference context have separate responsibilities. SQLite revisions,
original human input, earlier wording, generated explanations and completed jobs
remain intact. A discovery request is a bounded, revision-linked projection, not
an archive replay and not permission to delete historical evidence.

`src/core/evidence-graph.ts` builds an invocation-local index over requirements,
questions, sources and research. Typed forward/reverse links distinguish requirement
support, question motivation, answers, reviews and supersession. Queue traversal
visits reachable records/links rather than repeatedly scanning entire arrays.
Supersession is historical navigation, never an automatic evidence load. Shared
files and epic membership do not create inferred requirement-to-requirement edges.
Missing references remain explicit; cycles terminate. Reverse links identify
candidates, not sufficient proof of the complete impact of a change.

Legacy gap evidence identities now use this index without changing their normalized
evidence, conservative feature/dependency guardrails or `gap-evidence-v1` semantics.
Question lookup and epic-dependency lookup are indexed. Workflow planning shares an
index within one synchronous plan; it is not cached across mutable project reads.

### Current specification versus history

New workflow/dependency reviews try `contextPolicy: current-spec-v1` after reconstructing
compatible saved work under its original policy. This policy uses graph-based exact
closure and proactively compares a compact current-spec representation:

- Keep exact current requirement statements, acceptance scenarios, status and source links.
- Keep target rationale, exact human answers/notes/addenda and unknown review prose.
- Omit generated rationales only for human-confirmed background requirements.
- Omit unselected historical option consequences only when an answer exactly matches
  one unique option label. Preserve all labels, the selected consequence and the
  exact human answer. Freeform/ambiguous answers keep all consequences.
- Retain the existing verified current-decision projection: only proven superseded
  plain review snapshots can be omitted. Verified generated cleanup/resolution
  receipts describe their exact current decision, not embedded old snapshots.
- Compare plain approvals with lossless references to matching exact requirement
  wording/scenarios; choose the smaller wire representation. No semantic summary of
  human evidence is substituted for original input.
- Explicitly describe metadata omissions, but use them only when the complete
  measured package is actually smaller. Never spend recovered space on unrelated
  history in an isolated workflow request.

Original material remains available in saved records/revisions. A correction or an
explicit evidence load still pins its required records. Unknown supersession,
older human addenda and unresolved conflicts remain conservative; the app does not
guess that newer wording has absorbed every earlier exception.

The existing 72k target, 96k ceiling, staged guardrail fallback, citation validation,
expected-revision checks, cancellation and spent-attempt rules are unchanged. Staged
reviews retain their own existing policy and reconstructible exact batches. Neither
metadata omission nor graph navigation earns evidence/citation authority for unread
records. Oversized indivisible human evidence can still block.

## Measurement

Run `npm run benchmark:discovery` with Node 22.12+. It creates only disposable synthetic
in-memory data and makes no model calls. It reports:

- An adversarial reverse-ordered chain: old full-array closure versus graph build and
  queue traversal, with record/edge counts and median/p95 local timings.
- Generated-background-heavy workflow context: old `headroom-v1` versus
  `current-spec-v1`, complete character counts, section sizes and preparation timing.

One Windows Node 22.23.3 run measured 26,253 versus 10,190 characters (61.2% smaller)
with the same included evidence IDs. This fixture deliberately contains redundant
generated background; it is not a typical-project improvement guarantee. Timings
are machine/load dependent. No live model latency, token use, answer quality or
subscription savings have been established.

Verification: type check, UI build, full `npm test` (28 pretests and 632 main tests),
the final five-test graph suite (including an additional independent pre-graph hash
contract check), benchmark, and focused epic-review browser runner passed. Test and
benchmark runtime was Windows Node 22.23.3. Browser coverage includes selected-epic
routing, blockers, staged pause/resume, no-call reuse, reload and mobile layout.
The full browser suite was not rerun for this non-UI change; its previously documented
resolution-approval blocker remains outside this verification. Vite's existing
chunk-size warning remains non-blocking. No live inference or personal data was used.

## Remaining work

- Profile actual project blockers with explicit user consent; do not inspect personal
  databases or make inference calls merely to collect performance numbers.
- Introduce ranked full-text search alongside graph navigation. Existing bounded
  literal search remains unchanged, and the browser workflow path still avoids
  model-driven search/paging.
- Add explicit semantic constraint/dependency relationships and selective freshness
  rules. Existing guardrail fingerprints intentionally remain conservative: new
  constraints must not escape invalidation just because an older check never saw them.
- Broader safe projection of historical answers requires explicit, trustworthy
  supersession/decision scope. This slice does not summarize away human history or
  implement a retention/deletion policy.

See [upgrade compatibility](migrations.md#graph-backed-current-specification-contexts-2026-10-22)
and [workflow review](epic-workflow-review.md).
