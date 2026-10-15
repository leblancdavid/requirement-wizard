# Browser workspace, epics, and estimated completeness

Status: first playable local browser application. It shares the existing SQLite
projects with the terminal client. No desktop installation is required.

## Run

```powershell
npm ci
npm run app
```

Open **http://127.0.0.1:4317** (or the address printed by the app). Keep the terminal
running; Ctrl+C stops the local service and cancels its active discovery work.

On Windows, exit running wizard CLI/app sessions before `npm ci`: they can lock
SQLite's native module. During this iteration, a clean reinstall encountered that
lock in an existing interview process. `npm install` restored the dependency tree
successfully without stopping the user's session; the final clean-install check
remains blocked until that session exits. Project data is separate from dependencies.

Optional development store/port:

```powershell
npm run app -- --data-dir .wizard-state --port 4318
```

Default storage is the same user-local `requirement-wizard/projects.sqlite` used
by the CLI, so existing projects appear in the project list. Old snapshots gain
project-wide and inbox areas on read without losing record IDs, original input,
or revision history. New fields are saved on subsequent mutations; the SQLite
table schema remains version 1.

Use your existing OpenCode ChatGPT connection. If needed, run `opencode auth login`
first. The UI defaults to `gpt-6.1-sol`; the context/model panel lets you select
another explicit model ID. There is no automatic provider/model fallback.

## Workflow

1. Create a named project with an idea; **Create & explore** starts its first round.
2. Open an epic card or explore the whole project map.
3. Choose a question option or type an answer, then save. No IDs need to be entered.
4. By default, each saved response triggers a new organization/discovery round.
   Disable this option to save a batch and then choose **Explore next gaps**.
   Research and automatic-follow-up preferences are retained in this browser.
5. Add free-form ideas/corrections in the note box. Original text is retained.
6. Confirm/reject requirements with a rationale. Review changes to confirmed
   information before applying material reorganization proposals.
7. Inspect research sources, coverage explanations/evidence, activity, and context
   diagnostics. Previous answers can be reopened and changed.

Each round is bounded and stops for the human. It does not autonomously run an
unlimited sequence of calls. Model calls consume subscription allowance and can
take a minute or more for detailed assessments/research.

## Epic organization

Epics have stable identities, purpose, dependencies, and question/requirement/note/research
membership. **Project-wide** holds cross-cutting information. **Unorganized ideas**
is a provisional inbox, including old projects awaiting organization.

AI organization supports create/edit, move, split, and merge operations. New records
use temporary aliases in model output; application code assigns durable IDs and
validates references. Splits must account for every source record. Merges preserve
records and redirect dependencies. Dependency cycles are rejected atomically.

Routine organization of unconfirmed work is applied automatically. Changes moving
answered/delegated questions or confirmed requirements, or changing their epic's
definition, are queued for human review. Outdated proposals cannot be approved over
newer edits; reject and rerun discovery to obtain a fresh proposal.

Use **+** to add an epic, **Edit epic** to edit a selected epic's purpose/title,
and the requirement's epic selector to move a requirement explicitly. **Restore map
before this round** restores earlier membership/epic structure while retaining all
current human answers, requirement decisions, and research. New records move to the
inbox; coverage assessments are cleared for re-evaluation. It is a map undo, not a
rollback of human input.

## Definition coverage

Every active epic has nine fixed coverage areas:

1. Purpose and scope
2. Users and workflows
3. Behavior and rules
4. Data and lifecycle
5. Permissions
6. Dependencies
7. Failure behavior
8. Quality and operations
9. Acceptance scenarios

The model proposes statuses, importance, explanations, and evidence IDs. The
application validates references and computes the score:

| Status | Credit |
| --- | --- |
| Unknown / needs review | 0 |
| Partial | 0.5 |
| Defined | 1 |
| Not applicable | Excluded only with resolved human evidence |

Importance weights are critical **3**, important **2**, minor **1**. Missing areas
remain in the denominator with weight 2. A detailed unconfirmed proposal cannot
earn defined credit; unsupported partial/N/A assertions with no evidence earn none.
Research alone cannot resolve a user's product preference. Superseded/rejected
evidence invalidates affected checks; versioned question-answer links detect changed
responses. Each assessment is tied to its project revision and marked stale after
subsequent changes.

Project coverage uses equal weights for active epics plus the project-wide component.
An empty inbox is excluded; an inbox with active questions, non-rejected requirements,
notes, or research findings is included.
Epics without assessments count as zero. Split/merge operations do not inherit old
assessment credit. Structural discovery can legitimately lower the estimate.

The UI shows the current estimate, critical assessed gaps, open decisions, scope
confidence, and the change from before the most recent successful round. Confidence
is qualitative, not a statistical probability. Even **100% is only coverage of the
identified checks**, not proof that every feature is known or the release is build-ready.
Semantic evidence relevance and check importance are model judgments, not mechanically
proven entailment. Open a coverage area to inspect the actual supporting records.

## Context management

Every round creates a fresh, revision-bound working set instead of replaying an
ever-growing OpenCode chat. It includes:

- Original human idea and project-wide notes; focused notes and any exact source
  records needed by selected requirements/answers. Notes added inside an epic are
  scoped to it; AI can reclassify notes while preserving their original text.
- A compact epic map and the previous interpretation, marked stale when appropriate.
- Full records/evidence for focused and project-wide areas, plus transitive dependencies.
- A recent-record index (up to 100 labels, clearly marked as excerpts).
- Relevant research excerpts, assessments, and pending organization proposals.

Without an explicit focus, small projects include all active areas. Larger projects
select a pending-question area and include its dependencies. Input detail is bounded
to **48,000 characters**; if it does not fit, the round fails before inference and
asks for a smaller focus/split. There is no silent truncation of human decisions.
Omitted records and excerpted indexes are explicitly reported; references to evidence
outside the working set are rejected. Each job records a versioned context manifest,
revision, focus, included/omitted IDs, and character count.

This is a conservative character budget, not an exact model tokenizer or dynamic
provider context-window calculation. Persisted source records remain authoritative;
epic descriptions and AI interpretations do not replace them.

## Research

Targeted research is enabled by default in the browser and can be disabled before
creation or in the Research tab. The CLI remains opt-in:

```powershell
npm run wizard -- analyze --project "project-id" --expected-revision 1 --research
```

The research profile exposes only `websearch` and `webfetch`. The prompt requests at
most four calls; event monitoring cancels unexpected tools or budget overruns, and
the final stored tool trace is checked before applying proposals. This is a monitored
budget, not a guaranteed pre-dispatch billing ceiling for parallel tool calls.

Findings must cite URLs observed in successful tool output. Fetched pages and search
snippets are distinguished. Links merely appearing inside a fetched page are not
treated as retrieved pages. Sources retain retrieval dates, excerpts, and findings;
full runtime tool output remains associated with the recorded OpenCode session.
Citation validation proves retrieval provenance, not the truth or entailment of every
model-authored claim. Retrieved content is evidence, not a user's product decision.

## Local service boundary

The server binds only to 127.0.0.1, validates Host, requires a per-launch session token
for APIs, checks same-origin mutations, bounds request bodies, and serves only built
UI assets. OpenCode/provider credentials remain in the runtime. Browser clients never
access SQLite or provider credentials directly.

Discovery runs as background work in the foreground service process, so closing or
reloading the page does not cancel it. Shutdown cancels owned work. After an unclean
exit, expired leases are classified without repeating model calls or stealing live
leases. CLI processes still use the shared store/service in process; automatic
daemon discovery and CLI-to-HTTP attachment are not implemented.

## Verification and known limits

October 15, 2026:

- Deterministic core/API checks cover organization, evidence validation, scoring,
  backward compatibility, context bounds, CSRF/session checks, revisions, and jobs.
- Playwright exercised project creation, epic selection, option-based answering,
  confirmation, reload persistence, and a 390px mobile layout without horizontal
  overflow. This uses a synthetic adapter with no model calls.
- A real ChatGPT `gpt-6.1-sol` round fetched the official RSS 2.0 specification and
  Atom RFC 4287 through two webfetch calls. It saved four source-backed findings,
  two functional epics, three questions, two proposals, and coverage assessments.
  The resulting project estimate was **27%**. Job:
  `0a810ac4-d98f-4ea9-948d-5aca908c38a8`; local demo store: `.wizard-state/browser-live`.
- The preceding research attempt hit an unintended 90-second HTTP deadline and
  preserved revision 1. The shared HTTP wrapper was fixed to retain SDK Request
  cancellation and allow a five-minute prompt deadline; the retry completed.
- Live webfetch is verified. Websearch exposure/extraction is implemented but live
  websearch, adversarial permission enforcement, and over-budget cancellation have
  not yet been live-qualified. No claim of a general tool sandbox is made.

Remaining work includes deeper scenario/conflict review, readiness baselines, richer
requirement editing, automatic context-summary compaction/tokenizer calibration,
provider auth onboarding, portable handoffs, and the eventual desktop wrapper.

### Browser check setup

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.wizard-state/browsers"
npx playwright install chromium
npm run test:browser
```

Browser checks build the UI and write ignored screenshots under `.wizard-state/`.
Routine checks: `npm run check`, `npm test`, `npm run build:ui`, `git diff --check`.
