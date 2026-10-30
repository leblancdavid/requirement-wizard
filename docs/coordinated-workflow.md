# Coordinated workflow preview (DEC-032)

## Current controls (2026-10-29)

The primary action is now **Continue specification** (formerly Continue project).
Design/Specification and the queue use **More actions** for scoped operations;
Specification's **Improve requirements** is the former Refine requirements operation.
Earlier names in this dated guide and saved messages refer to the same existing
endpoints, grants and checkpoints—not different workflows.

**Settings → Project settings → Processing permissions** groups existing controls
without merging their authority. Browser-wide saved-input preferences and project-local
maintenance are retained but inactive during coordination. **Use separate task settings**
returns to those saved settings, including any opt-ins; it is not an all-automatic-off
switch. Pauses, saved-input flags, explicit restart consent and separate execution/
research controls remain unchanged. See [compatibility](migrations.md#specification-controls-and-processing-permission-grouping-2026-10-29).

The separate **Manual processing** mode now overrides automatic follow-up for this
project on this machine. An explicit **Continue specification** still authorizes its
bounded run, but only responses saved at that start are included. The coordinator
pauses/disarms at its next decision or pause rather than waking when a later response
arrives. Continue explicitly afterward. Original grants/spend and opt-ins are retained;
switching back keeps existing pauses and grants no new allowance. This narrowing
policy does not merge all automatic consent scopes; see [migration](migrations.md#project-local-manual-processing-2026-10-29).

**Guided processing** is now the unified bounded automatic specification choice.
Saving it starts nothing. Continue explicitly for the existing shared allowance;
eligible new answers can resume only its remaining allowance in this app session.
Separate automatic input/maintenance workers remain held, including before the first
Continue. Old save-only flags and browser preferences remain unchanged. Stop/restart/
limits require continuation, and every mode switch leaves work paused without renewing
allowance. Under Guided, switch the project processing mode before using separate task
settings; the old coordinator-disable shortcut cannot bypass the hold. See
[processing permissions](processing-permissions.md). Other permissions remain separate.

## Implemented first slice

### Definition follow-through (2026-10-29)

**Last specification run** now records each bounded coordinator worker pass across
its steps, with revision endpoints, reserved attempts and net saved-record counts.
It is distinct from the larger grant (which can span several decision wake-ups) and
from today's follow-through. Finished/stopped jobs are not a completeness claim, and
crashed runs without an ending observation stay explicitly incomplete. Original receipts
survive restart and later decisions; older runs are not inferred or replayed. This
report grants no calls or approval and does not cover separate manual/coding actions.
See [migration ledger](migrations.md#bounded-specification-run-receipts-2026-10-29).

New runs also list **Original saved reviews retained**: unchanged complete definition
reviews whose existing evidence key matches both the starting and ending project
inputs. The original review revision and finding count are shown, with dated identity
digests in the local receipt. This does not count skipped AI calls, prove intermediate
states, resolve findings or certify finding-level independence. Later changes can make
today's reviews outdated without altering this saved run record. Older/interrupted or
bounded/unprovable receipts do not manufacture a list. See
[retention compatibility](migrations.md#retained-definition-reviews-in-specification-runs-2026-10-29).

**Saved outcome and next step** combines a revision-labelled latest local
specification-change receipt with current saved/reusable evidence and pending
input/decision/definition/refinement/plan work. Receipt counts include proposals,
not approvals; current evidence is not a measured count of calls saved. Missing
local receipts remain unknown and the view does not claim whole-run completion.
Next-step guidance and opening the view grant no extra authority. See
[summary compatibility](migrations.md#revision-labelled-saved-outcome-summaries-2026-10-29).

The workflow drawer now lists current, outdated and never-assessed definition
reviews for the coordinator's requirement/dependency scope. These are evidence
freshness labels, not completion claims; a current review may still contain gaps.
Previous findings stay saved when outdated. Viewing status starts no requests.
Enabled coordinator controls remain available in the drawer even when a retained
saved-response shortcut takes priority in the header.

**Related saved work** separately explains pending refinement and implementation-plan
freshness/approval/interruption using their existing rules. Changed plan revision,
workspace and settings have explicit explanations. This is not another task grant:
implementation planning stays explicit in Implement, and no plan or suggestion is
approved by these notices. Organization changes now retain original definition
findings, including dated archived-area evidence, without assigning it to new areas.

After authorized input, required decisions and consistency checks, coordinated work
updates outdated existing reviews **before** broader gap discovery. Missing initial
baselines retain discovery-first ordering. This still uses the existing eight-request/
five-minute grant; failures pause/block, restart requires explicit continuation and
unchanged current reviews are reused. It does not add coding/scanning authority or
delta-only assessment. See [compatibility](migrations.md#definition-follow-through-projection-and-repair-first-coordination-2026-10-29)
and the [remaining consolidation work](workflow-consolidation.md).

Enable per project through **Continue project**, or Settings → Project settings →
**Coordinated workflow (preview)**. Processing & queue shows current work, allowance,
Stop/pause, blockers, and a decision inbox linking to existing questions, requirement
exceptions, refinements and saved-input issues. Advanced views/actions remain;
the redundant What's next card stays removed.

### One primary continuation action

**Continue project** is the primary action in the header and queue drawer. When
coordinated mode is off, its header button opens the queue's scope/allowance
explanation without starting model work. The drawer's explicit Continue enables
the mode and grants the existing bounded allowance. When already enabled, Continue
resumes coordinated work directly. While awaiting decisions with a live allowance,
the UI shows **Needs your decision**, not a redundant Resume button.

Narrow manual operations move under **Advanced actions** in the queue drawer:
**Process saved responses only**, **Resume this assessment**, **Resume discovery
only**, or explicit discovery/exploration continuation as applicable. These retain
their selected-feature scope, checkpoints and operation-specific allowances; they
do not enable coordinated mode. While coordinated mode is enabled, these competing
queue dispatch controls are hidden. Switch modes in Project settings to use them.
This is presentation/consent clarification, not a new dispatch or migration policy.

The coordinator sequences existing validated operations: process authorized input,
refresh stale refinement proposals, stop for decisions, establish requirement
provenance/checks, inspect similarity candidates, review epic workflow packages,
refresh stale scoped definition assessments, and clarify unresolved definition
behavior with targeted questions. It is not a second approval or
publication pipeline. Faithful answer-derived updates use DEC-030; human-reviewed
wording and valid answer-derived provenance do not need another routine cleanup
call. Legacy proposals and unsupported choices are never silently approved.

Changed input invalidates readiness and causes outstanding checks to be reconsidered
within the remaining live-session allowance. Existing exact-context checkpoints
remain authoritative. Definition refreshes review full scoped evidence, not just
deltas. Similarity selects candidates; it does not prove semantic conflict freedom.

## Consent, limits and recovery

- Default off, machine-local; scheduling and model-call authority are not exported.
  Advanced preferences survive, but legacy automatic maintenance is suspended while
  coordinated mode is enabled.
- Explicit Continue grants at most eight requests, five active minutes and twenty
  coordinator steps. Accounting is saved before dispatch and shared across steps.
  Ordinary jobs require room for three calls, so unused slots are possible. Staged
  operations retain completed checkpoints when paused.
- Waiting for decisions preserves allowance. Eligible input can resume that allowance
  in the same app session. Save-only input cannot use an earlier grant; explicit
  Continue authorizes its IDs. Restart never automatically resumes calls.
- Stop/shutdown preserve completed work. Explicit continuation can recover this
  coordinator's interrupted input, not arbitrary failed submissions. Worker leases
  exclude competing model/execution/workspace operations; stale results cannot
  overwrite newer decisions. Portable adoption pauses enabled local coordination.
- Coding, delivery, research and scans remain explicit advanced operations; this
  mode never authorizes them or silently changes provider/model.

## Readiness

**Specification checks passed / ready to plan** requires accepted active requirements,
valid evidence and provenance proofs, no pending input/decisions, completed relevant
workflow review, and current defined/not-applicable definition dimensions with valid
dependencies. Percentages alone never establish readiness. Revision-linked receipts
are archived immutably; changes invalidate current status, not dated evidence/jobs.

**Ready to implement** additionally requires a current approved implementation plan
covering the active requirements without unresolved package questions, a matching
workspace binding and saved implementation configuration. Starting coding remains
explicit. These bounded checks do not certify exhaustive completeness or replace
the user's eventual baseline review.

## Limits and verification

After current definition checks, unresolved dimensions receive a questions-only
clarification task, prioritized by importance. Each task covers one area/dimension
and proposes at most three evidence-linked questions. Its finding is an AI hypothesis,
not a confirmed product gap. Existing answers and retired questions are retained;
exact repeated questions and out-of-scope/unread citations are rejected. Answers
flow through ordinary saved-input processing, then affected assessments refresh.
Asking a question never resolves a dimension or establishes readiness.

Clarification shares the existing allowance, leases, cancellation and stale-result
checks. An unchanged completed task that found no useful product question is not
called again, including after restart/Continue. Missing evidence, invalid dependency
graphs, oversized mandatory context and assessment-only limitations remain specific
blockers linked to Overall progress. Model failures require explicit continuation.
Semantic paraphrase duplication cannot be ruled out deterministically. Automatic
plan preparation, true delta-only assessment and broader delegated-choice automation
remain follow-on work.

Manual **Specification → Clarify in Design** also provides explicit area triage
without enabling coordination. Partial assessment categories no longer count as
individual human decision tasks. One consented request can propose up to three
answer-option questions, or explain that no new human choice was established.
Existing dimension tasks remain supported, and equivalent completed no-question
receipts are reused. See [browser workflow](browser-workspace.md#resolve-assessment-findings-in-specification-2026-10-25)
and the [format/upgrade ledger](migrations.md#area-clarification-and-assessment-inbox-correction-2026-10-25).

Deterministic tests cover faithful activation, legacy choices, readiness, bounded
consent/restart, leases/Stop, stale output, API authorization and transactional schema
6 → 7 recovery. The coordinated browser runner covers answers, corrections/rechecks,
planning boundary, bounded continuation, restart and mobile without live calls.
Real-project latency/cost, live-provider coordination and actual-user database
upgrades are not qualified. See [migrations](migrations.md) for compatibility.

First-slice verification on Windows Node 22.23.3: type check, UI build, 131 pretests + 649 main
tests (780 total), coordinated-workflow, maintenance, specification and portable
browser runners, and diff whitespace check. The full browser command was rerun;
it still stops at the previously observed missing **Approve resolution** assertion
at `src/web/browser-check.ts:1352`. That suite is not passing. No live inference,
personal database changes, commits or pushes were performed.

Readiness-question follow-up verification: type check, UI build and all 787 tests
(138 pretests + 649 main) passed, along with the updated coordinated browser flow
including question → answer → fresh assessment, specification and maintenance browser
runners. Reopen tests preserve completed clarification jobs and prevent unchanged
no-question retries. The full browser command was rerun and still fails at the same
**Approve resolution** assertion. No live calls or personal database changes.
