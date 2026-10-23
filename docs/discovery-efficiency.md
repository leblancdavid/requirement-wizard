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

### Browser Resume routing (2026-10-22)

**Processing & queue → Resume discovery** now uses a dedicated
`POST /api/projects/:id/resume-discovery` request. The server decides from current
saved-input state rather than a stale renderer snapshot:

- With unfinished, non-archived/non-resolved input, process the finite selected
  response scope using existing isolated follow-up and recovery rules. Never fall
  through to legacy gap discovery if that scope is empty or another worker already
  completed it. Conflicts and out-of-scope responses stay retained/paused.
- With no unfinished input, run the same workflow discovery mode as **Explore next
  gaps**, respecting the selected feature, question target and research choice.
  The existing workflow planner reuses compatible saved policies, stages and attempts,
  including older headroom and staged work. It does not restart completed stages.

This fixes an inconsistency where the Design button selected workflow discovery but
the queue's Resume button could select legacy individual/lens discovery. The two
backlog ledgers remain distinct; old legacy checks/blockers are not relabelled as
workflow checks or deleted. The existing terminal/legacy analyze and explicit
Continue exploration paths remain available with their original semantics.
Processing saved responses does not authorize additional gap exploration afterward;
use **Explore next gaps** once the retained input is resolved. This routing fix does
not guarantee that every mandatory human evidence chain fits the context budget.

Verification: type check, UI build, 43 pretests / 633 main tests, and the focused
workflow browser runner passed on Windows Node 22.23.3. The broader browser command
still stops at its existing missing **Approve resolution** assertion. The focused
browser check includes Resume after reload and unchanged original staged-job evidence;
the SQLite test exercises restart without automatic inference. No live model calls.

## Measurement

### Responsive, incremental preparation (2026-10-22)

Workflow discovery now prepares only through the **first eligible package** rather
than building every package's exact context before the first request. The catalog
order, saved-policy reconstruction, split/boundary preservation and exact evidence
identities remain unchanged. A report marked `planningPartial: true` covers only the
examined prefix; neither the UI nor diagnostic backlog totals describe unseen packages
as checked, blocked or complete. With no eligible package, planning still examines the
remaining scope to establish the no-call outcome, subject to the preparation deadline.

Expensive initial context preparation runs in one owned CPU worker, separate from the
loopback API/service event loop. The parent can serve snapshots, accept **Stop**, run
deadline timers and terminate even an indivisible synchronous compaction. The worker
owns no database, provider, credentials or OpenCode server. Historical revision data
is requested from the parent only when needed for exact compatibility checks; an
invocation-local cache avoids rebuilding already prepared candidates during that read.
Prepared staged batches and their exact basis are reused instead of needlessly
rebuilding every batch for each saved-match comparison.

Before any model request, Processing & queue shows **Preparing workflow evidence…**,
with preparation counts and elapsed seconds. Local format-1 diagnostics optionally
add `planningProgress` (phase, examined-prefix count, context preparations, checkpoint
sequence and historical-revision count). Latest progress/elapsed time is saved roughly
every 500ms, plus initial/first-context/final boundaries. These are diagnostic progress
checkpoints, not completed analysis or a resumable computation cursor. Explicit retry
can redo local preparation; completed model stages and spent attempts remain intact.
Interrupted `recording` measurements now export an unknown adapter-time total rather
than a misleading zero completed-run total. Per-request entries remain unchanged.

Initial preparation has a **two-minute parent-owned deadline** within the existing
five-minute combined discovery bound and six-minute lease. No longer lease or extra
model allowance is granted. Stop/deadline/stale-input failure terminates only the owned
planning worker and preserves original evidence. A deadline explains that preparation
stopped without model inference; choosing a narrower feature may be necessary. Startup
never resumes calls automatically, and an old lease-expired job is not fabricated into
a completed plan.

This slice isolates initial workflow planning, not every local operation in the app.
Initial SQLite reads/snapshot transfer, later explicit evidence-load preparation and
independent publication-time validations retain their existing implementation. It is
not a promise that arbitrary human evidence fits, that a whole project plans within
two minutes, or that the user's interrupted run has been reproduced exactly. Source
runs use the dev TypeScript loader explicitly in the worker; emitted desktop code
uses the emitted JavaScript worker without requiring that loader.

Verification: all 49 pretests and 633 main tests passed, along with type checking,
UI build, desktop TypeScript emit and the focused epic-workflow browser check.
A normal Node compiled-JavaScript smoke check verified worker startup without a
TypeScript loader; this does not qualify full packaged Electron execution. The
broader browser command stopped at the missing **Approve resolution** assertion in
`src/web/browser-check.ts:1347`, before its portable/specification runners. The user's
exact stalled project was not reproduced, and no live provider calls were made.

### Exact-input local planning continuation (2026-10-22)

A subsequent real diagnostic reached the two-minute bound after 55 examined packages
and 3,173 context preparations, with no model request. Worker isolation kept the app
responsive but did not remove repeated preparation. Local planning now shares
immutable decision/approval-snapshot derivations and lookup indexes between context
variants; equivalent contexts and existing exact model/checkpoint keys are unchanged.

After a complete root group's local scheduling, non-pending tasks and their numeric
report basis are checkpointed in a separate SQLite table. Explicit retries, including
after app restart, reuse these groups **only for identical complete planner inputs**:
project content, ordered workflow history, submissions, selected scope and algorithm
version. This avoids rebuilding exact contexts for resolved groups before reaching
the next eligible package. Pending tasks still require fresh exact contexts. Changed
decisions, jobs, attempts, model selection or even irrelevant project metadata
invalidate this conservative CPU reuse; model-stage compatibility continues to use
its existing separate evidence checks.

Queue progress/diagnostics show numeric `reusedGroups` and `resolvedGroups` counts;
the saved receipts contain no context bodies and are never exported as model checks.
The currently unfinished root group restarts after interruption. A project retains
at most 2,000 root-group receipts/4 MiB for one input generation; reaching the cap
does not change scheduling, but stops saving additional receipts. No automatic retry,
model call, longer lease, larger context or larger model allowance is introduced.
One indivisible slow group may still time out; scope narrowing remains a fallback,
not the primary retry strategy. Numeric half-second progress pulses alone are still
diagnostic metadata, distinct from completed-group CPU checkpoints.

Schema 3 upgrades transactionally to schema 4 without rewriting saved requirements,
jobs, assessments, history or completed model work. The previous timeout cannot gain
receipts retroactively: the first run after upgrading starts the new cache. See
[migration and recovery](migrations.md#exact-input-local-planning-continuation-2026-10-22).

Verification: 633 main tests passed in `npm test`; the final pretest rerun passed
all 53 tests, including the added zero-preparation reuse case. Type checking, UI
build, desktop TypeScript emit, normal Node compiled-JavaScript worker smoke and
the focused workflow browser runner passed. Full packaged Electron execution and
the exact supplied project's performance remain unqualified; no personal database
or live provider calls were used. The broad browser suite was not rerun for this
follow-up (the earlier worker-isolation run's blocker is recorded above).

### Export a representative discovery run

1. Restart the updated app. New discovery and saved-answer follow-up jobs record
   bounded local metadata; no inference is run just to collect diagnostics.
2. Use **Design → Explore next gaps** on a representative feature as usual. Wait
   for completion or a useful blocker; exporting a running run is also supported,
   but its measurements are partial.
3. Open **Processing & queue → Discovery diagnostics**. The newest five eligible
   visible runs are initially selected. Expand **Select runs** to change selection,
   clear it or select all recent eligible runs (at most twenty). Scans, help and
   refinement jobs are excluded; selection comes from the workspace's recent jobs,
   not an unbounded archive listing.
4. Click **Export discovery diagnostics**. Review the downloaded
   `reqwizit-discovery-diagnostics.json` and share it for analysis if desired.

The authenticated same-origin API is `POST /api/projects/:id/discovery-diagnostics`
with `{jobIDs:[...]}` (one to twenty distinct project-owned discovery job UUIDs).
It reads bounded SQL metadata projections, never model outputs/history, and returns
a no-store JSON report capped at 256,000 UTF-8 bytes. Export makes no model calls,
does not revise the specification and does not change checkpoints or attempt limits.

**Included:** report-local run/package handles, input revisions, status, known
context policy, initial planning time, per-adapter-attempt duration and envelope
category, exact context character/count breakdowns from known sections, selected
current-spec context traversal counts, retained-stage/attempt/batch counts and saved
backlog totals. Workflow planning counts distinguish new packages, compatible saved
packages and packages without a compatible saved match. The latter can reflect
changed evidence, scope or grouping; it is not a semantic explanation of a change.

For finished measured runs, `timing` separates initial planning, adapter requests,
and remaining local time (evidence preparation, validation, storage and orchestration).
Request time includes adapter/server startup, tools and provider work, not just model
inference. Request entries are checkpointed before dispatch; an in-flight entry is
not proof that a provider accepted a call. Response categories are identified before
validation; a returned response is not proof of successful publication.

**Excluded:** original project/job/record IDs, project/feature names, source/requirement
text, answers, prompts, responses, error/progress prose, file paths, timestamps,
provider/model/account/session identifiers, credentials and arbitrary metadata keys.
The export uses explicit field/key allowlists rather than trying to redact arbitrary
logs. Counts, revisions, durations and package relationships can still reveal project
scale or structure; this is minimized metadata, not a guarantee of anonymity.

Older jobs have `measurements: null`; missing counts remain null. Do not manufacture
zero requests from absent measurements or replay old calls to get timings. Measured
requests belong only to that job invocation, while saved attempt/receipt counts may
span retries. Abrupt interruption retains `state: recording` and null durations for
unfinished requests; it does not fabricate a completed timing. Graph counts describe
the selected context's traversal, not every candidate/compaction attempt during planning.
Character counts describe the app context, not total runtime prompt overhead or tokens.
For staged jobs, `savedContext` can describe the publication union rather than a single
request. Use each measured request's context for actual app input sizes.
Metrics are excluded from portable continuation and never affect evidence fingerprints.

Diagnostics verification (2026-10-22, Windows Node 22.23.3): full `npm test` passed
(38 pretests / 633 main tests), with final focused diagnostics checks, type checking,
UI build and focused workflow/specification browser checks passing. Workflow browser
coverage includes selection, actual JSON download, privacy assertions, export failure,
reload, staged resume and mobile layout. Diagnostics are collapsed below active
controls; the broader runner passed its active Stop visibility check after correcting
an initial layout regression. The full browser command still stops at its existing
missing **Approve resolution** assertion (`browser-check.ts:1347`); the separately
run portable browser check still stops at its existing duplicate **Open shared
checkpoint** selector (`portable-browser-check.ts:37`). Neither suite is claimed as
passing. No live model calls or personal database inspection were used.

### Synthetic benchmark

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
  databases or make inference calls merely to collect performance numbers. The export
  above now supports user-selected metadata sharing; real-project results remain unmeasured.
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
