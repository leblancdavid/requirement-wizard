# Project-focused workspace

## Confirmed interaction contract (2026-11-11)

Users answer product questions, approve requirements when necessary, resolve
conflicting intent through clear choices, and authorize consequential operations.
They should not choose batching, evidence-loading, scheduling or repair mechanisms.
Routine compatible technical recovery uses the existing authorized workflow.
Additional usage, wider permissions, file disclosure, coding and publication must
not be silently authorized in the name of simplification.

Every outstanding decision should have one home and be answerable there:

- **Design:** questions, corrections and saved input needing review.
- **Specification:** requirement approval, conflicting rules and feature organization.
- **Implement:** reviewed plans and explicit coding/delivery authorization.
- **Logs:** technical progress, diagnostic export and retained technical controls.

Notices should take users straight to the item, with its context and choices
already available. Product intent and acceptance scenarios are not debug details.
Use project-level explanations for necessary technical permissions, with optional
Details and explicit usage/scope consequences. Avoid multiple confirmation steps
for a single bounded authorization.

## Implemented first pass

- The main header has **Continue**, active-work **Pause**, and **Cancel current work**.
  It no longer opens a processing drawer. Continue selects saved clarification or
  refinement when safely resumable, otherwise uses the existing Play workflow.
  An exhausted saved-response review routes to its visible permission rather than
  silently granting more requests.
- Processing modes, independent automatic-worker preferences, technical queue,
  advanced continuation/recovery controls and question-count tuning are retained
  under **Logs → Technical processing controls and retained preferences**. Settings
  explains project assistance without requiring a processing-mode selection.
- Current shared-answer conflicts appear directly at the top of Specification,
  showing original answers, initially unselected choices and Save decision & continue.
  Cross-tab notices navigate there without a dialog. Feature-organization decisions
  also precede ordinary specification browsing.
- Additional saved-response allowance appears directly in Design (Specification for
  requirement-review input) as **A little more
  review is needed**. Continue review explicitly authorizes the existing one-time
  four-request extension; Not now grants nothing. Gap exploration similarly has one
  action with additional usage disclosed before approval. Internal counters remain
  under Details, not a separate confirmation screen.
- Failed saved answers are discoverable in Design. Saved-note recovery displays
  the original information and a direct continuation there, not in a modal.
  Specification's attention index only lists requirement-review submissions; it
  does not reproduce the Design answer/note inbox.
- Requirement links select the appropriate Specification view, clear incompatible
  search/readiness filters, open the exact record and follow its page with keyboard
  focus. Existing review drafts are retained. A ready pending requirement opens by
  default, with the rest still paginated. Question links similarly follow their page.
- Logs retain answer-group, saved-response, clarification and refinement progress.
  **Export these logs** downloads at most 250 loaded matching records with common
  credential redaction, explicit partial-history scope and a sensitive-project-data
  warning. This is distinct from the existing metadata-only discovery export.

## Specialist-screen follow-up

- Implement puts outstanding plan questions and approval before browsing. A saved
  build or approved plan prioritizes build continuation, with its destination and
  GitHub review links. Plan approval does not authorize coding.
- Four outcome filters replace the technical status-filter list. Individual results
  still distinguish unknown, partial, stale, complete-in-code and delivered evidence.
- Forced rechecks, previews, reassessment marking, reviewed code boundaries,
  assessment experiments and saved-review history recovery live in Logs. History
  recovery can archive attempts but cannot approve requirements or answer questions.
- Normal setup saves preserve hidden expert settings, including an explicit false
  assessment-reuse choice. Historical diagnostic serialization happens on demand.
- Saved conflict decisions retain inline progress during their owned review without
  becoming new decisions or granting additional continuation authority.
- Normal progress omits batch/checkpoint mechanics and numerical engine limits;
  saved evidence and technical controls remain available in Logs.

## Compatibility

There is no SQLite, portable-format, checkpoint/fingerprint, permission, authority
or migration-version change. Existing preferences, paid work, answers, evidence and
history remain unchanged. Continue still explicitly authorizes the existing workflow;
opening tabs, Settings or Logs never grants requests. Old technical controls remain
available for recovery rather than deleting saved consent or changing its meaning.
See the [migration ledger](migrations.md#project-focused-workspace-presentation-2026-11-11).

## Verification and remaining work

`npm run check`, all **2,023** tests from `npm test` (942 pretests, 802 main,
279 posttests), the UI build, focused assistance/workspace-log/review-recovery
browser runners and `git diff --check` passed. The existing non-blocking bundle-size
warning and React static-render key warnings remain. No dependencies were changed.

The new `test:browser:assistance` fixture exercises direct conflict navigation and
choices, one-action usage consent, Not now, no modal detour, mobile width and mocked
saved-choice reload without inference or store changes. It is a presentation fixture,
not proof of durable recovery or model reasoning. The focused review-recovery browser
uses real local writes for remove/combine, stale/save-failure handling, saved-note
navigation and unchanged originals/history. Workspace/log checks cover actual downloads,
redaction, keyboard, mobile, cancellation routing and no inference.

Follow-up focused planning, shared-answer, question-batch, workflow-schedule,
assessment-tools, assistance, workspace/log, review-recovery, portable,
specification and review-draft browsers passed.
Separate follow-up runs also passed assessment-history, original-source, joint,
scoped, mixed-review/publication, combined-finding and combined/mixed-reader checks.
Supplemental evidence, immutable bundles, baseline continuation and the three
source-backed change-impact browser runners passed after navigation migration.
Planning checks real fixture-service continuation and setup preservation; intercepted
check routes do not qualify live assessment or GitHub behavior. Mobile plan-review
and Logs screenshots were inspected. The modal focus trap now includes summaries
and excludes descendants hidden by collapsed details; workspace browser coverage
checks reverse/forward wrapping.

The full `npm run test:browser` suite and its `posttest:browser` recovery runners
passed after migration to the simplified navigation. This includes the main runner,
500-requirement paging/polling, plan approval, direct requirement recovery, retained
technical tools, additional usage, cancellation, reload and mobile checks. Old
header and technical navigation assertions now use Logs rather than restoring those
controls to normal UI. Retained technical workflow renderer assertions remain
tested separately. Focused planning and assistance browsers also passed separately.

The technical queue is preserved in Logs, not deleted. No live-model, desktop or
end-to-end delivery qualification was performed, and no new engine-level recovery
policies were introduced.
