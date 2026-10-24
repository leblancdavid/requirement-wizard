# Guided workflow and automatic definition maintenance (DEC-031)

The newer [coordinated workflow preview (DEC-032)](coordinated-workflow.md) suspends
the legacy automatic maintenance scheduler while enabled. Saved preferences and
completed work remain intact.

## Implemented first slice

The separate **What’s next?** card was removed because it duplicated existing views.
Use Design for stories/questions, Specification for current requirements and pending
decisions, Overall progress for definition coverage, and Processing & queue for saved
input, current work, blockers and continuation. Project setup and automatic maintenance
configuration remain in Settings. No workflow action or maintenance capability was
removed with the card. A completed assessment no longer leaves an idle **Resume
processing** action merely because the legacy input queue is paused.

The normal path is **add information → process saved input → review exceptions /
answer questions → see updated definition progress**. Explicit-input faithful
specification updates retain DEC-030's existing validation; this feature grants no
new approval authority. Discovery, scans, refinement, implementation and delivery
remain available as explicit operations. Moving all of those controls into a unified
Advanced actions menu is not part of this first slice.

## Opt in

Open **Settings → Project settings → Automatic maintenance** and choose **Enable
automatic definition updates**. This project-local, machine-local setting defaults off on
upgrade and is not exported to shared workspaces. Enabling records the current
scheduling baseline; it does **not** assess the existing backlog. Use
**Overall progress → Refresh definition coverage** when a
full initial baseline is wanted.

Settings contains only configuration (enable/disable and usage limits). Queued
areas, specific blockers and pause/resume live in **Processing & queue**. Stop stays
on the current task. The duplicate **What’s next?** card is no longer shown. The
queue links directly back to this settings section, restoring keyboard focus there;
Settings retains its **View background work** link to the queue.
Opening these views does not enable maintenance or start model calls. Existing
preferences, pause state and saved tasks are preserved by this UI-only relocation.
Active work and its Stop control appear before maintenance details in the queue.

Saved-input processing retains its separate existing consent control, now labelled
**Settings → Automatically process saved inputs**. Each input has its own follow-up;
it is not a request for unrelated gap discovery. With definition maintenance enabled
in this session, a newly submitted automatic input can start processing even after
a manual assessment left the old processing queue idle/paused, but unresolved input
failures must be reviewed first. Saved-only input is not silently processed by the
maintenance setting.

After input processing completes, relevant human-source/current-requirement or
area/dependency changes queue affected definition areas. Scheduling identities use
a narrower decision projection than assessment freshness: model-only requirements,
unanswered generated questions and research do not themselves grant more calls.
Actual assessments still use their complete original evidence identities, not that
projection. Changed shared constraints and dependencies can affect several areas.
Human deferral/delegation may change the review input but do not become confirmed
preferences. Existing proposals are never approved automatically.

## Bounds, pauses and recovery

- Combine relevant changes until they have settled for twenty seconds. Processing
  and unresolved input failures take priority; maintenance waits for a clear queue.
- Each burst allows **eight model requests, five minutes, and three areas**, shared
  across that burst. These calls consume provider allowance. This is not a daily
  cap: later new decisions can trigger additional bounded bursts while enabled.
- Current assessments are reused. Oversized areas use existing exact stages,
  checkpoints, reference validation and independent publication checks.
- A budget stop or interrupted/stale/failed assessment pauses maintenance. Explicit
  resume grants another bounded burst, preserving spent stage attempts and completed
  calls. Unchanged failed tasks remain blocked rather than automatically retrying.
  Changed decision inputs may queue a new review without deleting earlier evidence.
- **Pause automatic updates** in Processing & queue prevents the next automatic assessment; an in-flight task
  may finish. Input processing retains its own consent. **Stop assessment** in
  Processing & queue interrupts the current task and preserves its checkpoint.
- App shutdown cancels owned work. Restart preserves the opt-in setting and durable
  tasks, but requires explicit resume before this new app session can start calls.
  Reloading the browser alone does not end the server session's consent.
- A successful publication followed by a scheduler checkpoint crash is reconciled
  against current coverage without repeating the completed call.
- Scheduler CAS claims and existing job/execution leases prevent duplicate dispatch.
  A competing worker's live task is not relabelled failed or reset by this scheduler.
  Read-only browser projection labels an abandoned saved running task paused when
  no live discovery worker exists; it does not infer its original interruption cause.

Automatic maintenance never starts gap discovery, scans, research, coding or GitHub
delivery. It does not approve plan/specification proposals or certify readiness.

## Incremental scheduling versus incremental evidence review

Implemented: schedule only changed areas, coalesce edits, skip current coverage,
and reuse compatible saved stages. Each affected area still receives a full evidence
review. Broad shared changes can therefore require substantial work and pause at a
burst limit. The UI explicitly says this is not a cheaper delta-only assessment.

Future: a separately versioned incremental review protocol proving which findings
and supporting evidence remain reusable after changes, with explicit cross-area
invalidation and full-review fallbacks. No existing full assessment/checkpoint is
invalidated or relabelled incremental by this first slice. Live model cost/latency
improvements and semantic fidelity have not been qualified.

See [migration ledger](migrations.md#opt-in-guided-maintenance-2026-10-23) for storage
compatibility. Deterministic verification uses no provider inference; browser
screenshots are `.reqwizit-state/browser-maintenance.png` and `-mobile.png`.
The queue/settings mobile views are captured separately as
`browser-maintenance-queue-mobile.png` and `browser-maintenance-settings-mobile.png`
in the same directory. Placement checks visit every workspace tab to ensure the
full maintenance controls are not repeated there.

Verified on Windows Node 22.23.3: type checking, UI build, **119 pretests + 648 main
tests (767 total)**, and focused maintenance/workflow/portable/specification browser
runners passed. The maintenance browser check includes decision navigation, explicit
consent, story processing before assessment, pause/reload, server-restart consent,
keyboard focus and mobile layout. Idle maintenance polling uses the lightweight
revision counter rather than repeatedly decoding/hashing an unchanged large project.
The full `npm run test:browser` command was run and still stops at the pre-existing
**Approve resolution** assertion at `src/web/browser-check.ts:1352`; downstream
portable/specification runners passed separately. No live provider call or changes
to the user's saved project database were made. Real-project latency/usage and the
future incremental evidence protocol remain unqualified.
