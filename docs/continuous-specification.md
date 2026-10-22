# Continuous specification (DEC-030)

## Implemented first slice

Explicit queued answers, notes and targeted **Request changes** feedback can now
create or revise current requirements without a second approval. The model must
explicitly attest that the statement **and all acceptance scenarios** faithfully
capture that input and preserved constraints; unsupported product choices need a
focused question instead. This is not blanket approval based on confidence.

**Specification** replaces the Review tab. **Current specification** contains active
requirements; **Needs your decision** contains exceptions and legacy proposals.
**History**, Submitted and Refinements retain earlier workflows. Answer-derived
requirements say **Recorded from your answer**, expose their evidence/reason, and
offer **Request changes** for corrections. Design shows a quiet latest-update summary
with expandable changes and a link to inspect/correct requirements. Activity retains
previous wording and exact answers. When a new choice is unresolved, answer it in
Design or the linked clarification rather than rubber-stamping generated prose.

The internal `accepted` status means part of the current specification. Optional
version-1 `authority` metadata distinguishes answer-derived wording from explicit
human approval. It records exact source IDs, reason and publication revision. No
synthetic human confirmation or rejection is created; earlier approvals remain
dated evidence in history. Manual decisions and approved replacements clear that
answer-derived label. Coverage and planning use the current specification without
claiming its generated wording received a separate human review.

## Publication and exceptions

An optional version-1 `specificationUpdates` response envelope activates a new
requirement alias or an updated unapproved record, or revises an existing accepted /
needs-review record in place. New activation must include the current cited input in
the requirement's source links. Existing targets require their complete supporting
evidence in the detailed context. Related current requirements can join bounded
answer reconciliation; unrelated history is not loaded merely for approval removal.

Storage independently checks current applied submissions, source eligibility, exact
target scope, complete context, competing edits, active features and unresolved linked
questions/pending input. A held activation remains a proposal; a held revision
retains current wording and proposes a reviewable replacement. Duplicate/consolidation
resolutions remain explicit decisions. Structural gates do not prove semantic fidelity
or exhaustively detect contradictions: the model still judges whether prose adds a
choice. Inspecting/correcting the result remains available.

Scans, research, gap exploration, ordinary approval/rejection, delegation and deferral
cannot authorize this envelope. Existing scan-derived baselines remain review-first.
There is no retrospective startup sweep or automatic conversion of the old backlog.
Legacy responses/checkpoints without the envelope keep their original proposal rules;
pure AI wording cleanup and pair resolutions still require review. This first slice
does not implement autonomous delegated-choice resolution or automatic deletion.

All changes publish inside the existing expected-revision/lease transaction. Stale,
cancelled, expired or invalid results do not partially update the specification.
Execution continues to exclude specification writes; waiting answers are processed
after it finishes. Material wording/source changes retain existing fingerprint and
planning-freshness checks; old assessments/delivery evidence remain saved, not
recertified. **Prepare plan**, plan approval and **Start implementation** remain
separate explicit actions. Updating requirements never starts coding or grants Git
delivery permission.

## Compatibility and verification

See the [migration ledger](migrations.md#continuous-specification-dec-030) for additive
format compatibility, original evidence preservation and recovery. Deterministic
fixtures exercise the real service, queue, storage and portable boundary; they do not
establish live-model fidelity or how often exceptions will occur. No new milestone
exit criteria are marked complete by this workflow change.

2026-10-22 verification on Windows Node 22.23.3: type checking, all **613 deterministic
tests** (23 specification tests, 5 desktop-host tests and the 585-test main suite),
production UI build, both CLI help commands and `git diff --check` passed. The full
`npm run test:browser:all` rerun passed all eight browser checks, including the new
answer/create/correct/reload/mobile flow. Screenshots are
`.reqwizit-state/browser-continuous-specification.png` and its `-mobile` variant.
Earlier runs caught outdated wording assertions and a timing-sensitive pre-existing
disabled-action touch-tooltip assertion; the final full browser rerun passed without
changing the tooltip implementation. The existing >500 kB bundle warning remains.
No live provider calls or real user-data conversion were performed.
