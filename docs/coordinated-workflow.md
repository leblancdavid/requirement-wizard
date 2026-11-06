# Coordinated workflow preview (DEC-032)

## Shared answer integration (2026-11-06)

After **Submit saved responses**, the coordinator can integrate **two to five new,
concrete, unscoped answers in the same feature** together. Each original question,
options, answer and current source stays distinct and pinned in every request. The
complete mandatory evidence sets from the individual tasks are pooled without dropping
records; one collection pass builds a combined draft and one verification pass checks
that frozen draft against every evidence batch. Publication is atomic only after all
checks pass, with an explicit model outcome/explanation for each original submission.
Outcomes are model judgments, never human approvals. Existing automatic-activation
gates still require current authorizing answer sources and full original target support.

Reviews, targeted answers, delegated/deferred choices, research, pair-resolution work
and already-started individual work retain their established paths. Shared fit is checked
before dispatch; a group that cannot fit may use individual processing only before any
shared request starts. Once started, the original group, replies and attempts stay
bound together across Pause, failure, restart and portable continuation. A new grant
cannot turn paid shared work into fresh individual attempts. Later input remains in
the next batch. No partial changes, tools, organization/global interpretation, automatic
choice precedence or verification skipping is authorized. Indispensable joint evidence
must fit exactly or the group stops, rather than relying on separately read fragments.

Shared steps have four attempts each, up to 32 exact batches per phase, a 96,000-character
input cap and a 24,000-character draft reserve. Accepted exact lookups retain their
step/context identities; malformed attempts and cancelled calls stay spent. Completed
drafts survive failed publication and resume locally without another model call. Valid
replies arriving after an edit are saved historically before stopping stale. Changed
group inputs still require review: changed-material reconciliation, group-specific
exhausted-step extension and automatic clarification of rejected shared drafts are not
implemented. An old task is never silently abandoned to reset its allowance.

**Deterministic request comparison:** the same synthetic five-answer/nine-evidence-batch
fixture requires **90** individual read/check requests versus **18** shared requests,
with all original evidence retained. This is an 80% request-count reduction for that
fixture, not a measured live speedup, provider bill or semantic-quality qualification.
Additional exact lookups, incompatible scopes, smaller groups and larger drafts change
the actual cost. No real-project latency improvement is claimed yet.

Processing & queue shows the group's answer count and read/check progress; raw drafts
and receipts are stripped from browser snapshots. Logs count actual requests once.
SQLite 32 and conditional portable format 9 protect the new readers while leaving old
single-answer work untouched. See [upgrade details](migrations.md#shared-exact-answer-integration-2026-11-06).

## Save-first answer collection (2026-11-06)

New explicit continuous **Continue specification** runs adopt save-first collection.
When the workflow reaches a decision, saving answers does not wake the coordinator
or spend AI allowance. Keep answering, then choose **Submit saved responses** in
Processing & queue (also available in its header). A partial submission is allowed;
unanswered questions remain open. The action captures only responses already saved
at its start. Later input waits for another explicit batch, including input arriving
during answer integration, not just during area assessment. Pause/restart and stale
publication guards remain unchanged. Local plain approvals still need no AI call.

This first slice separated interaction from processing; the later shared integration
above now pools compatible new answers. Other answers still integrate individually
through the existing exact-evidence read/check protocol. It does not
change question-generation stopping targets, skip
verification or promise faster inference. Original paid work and assessment identities
are preserved. Existing grants without the new policy retain their original behavior
until explicit continuous continuation; opening/reloading the app adopts nothing.

New staged-answer diagnostics expose numeric local costs for history loading,
preparation, replay, context construction, checkpoint persistence, response validation
and publication. These are synchronous phase totals, not model time or an exhaustive
CPU profile; publication includes final replay/storage, and earlier queue preflight
is outside the job. Missing older measurements remain unknown. Local measurements
are omitted from portable evidence. `npm run benchmark:submissions` runs a disposable
synthetic nine-batch fixture with no model or user-database access; it does not
reproduce the attached real project's large local overhead or qualify live speedups.
The staged-submission lookup now selects only its latest matching ledger in SQLite,
instead of loading/deserializing the whole job archive twice. Saved scope, row-order
selection and full validation of the selected original ledger remain unchanged.
Recovery/clarification validation likewise loads the complete matching submission
history rather than unrelated job payloads; original sources and ledgers still replay.

Next slices: profile a real staged-answer run using the new export, qualify shared
integration on actual project inputs, then tune bounded question-batch discovery.
See [compatibility](migrations.md#save-first-answer-collection-and-local-timings-2026-11-06).

Verification: the full deterministic and default/post-browser suites, separate
Manual/Guided and coordinator browser checks, type checking and UI/desktop builds
passed. Final scoped recovery tests also pass without loading the unrelated archive.
No live model speed, semantic effectiveness or installed-desktop qualification is implied.

## Question batches and fixed review checkpoints (2026-11-05)

On explicit Continue specification, the coordinator now collects answers/proposals
and related follow-up questions before reviewing definition validity. Pending
decisions hold **all** automatic area assessments, even structurally outside-scope
ones. A single answered question does not end the batch: related question discovery
runs first. A settled discovery pass with no pending decisions closes collection;
the existing change-impact/full-review sequence then reviews the accumulated changes.
This ordering supersedes the earlier automatic outside-scope scheduling below.
The dependency view remains navigation, not automatic review permission.
Compatible already-saved assessment/change-review work can resume directly on
explicit continuation; collection must not invalidate paid work by first generating
new questions against identical saved inputs.

**Review changes** in Processing & queue explicitly starts a bounded review-only
checkpoint (up to eight requests/five active minutes). Process saved responses first.
It can review the currently saved evidence while some questions remain unresolved,
without answering/approving them. It runs existing eligible impact checks/deeper
assessments, not input processing, conflict cleanup, broad discovery or coding. It
stops at completion or the existing allowance/failure boundary. Continue specification
can resume identical unfinished work under its normal displayed allowance.
Completion always pauses, including when unanswered questions remain: saving a
later answer cannot spend the leftover review-only allowance on processing/discovery.

Each checkpoint records its exact semantic input key (including global interpretation)
and original starting revision independently of assessment publication dates. Area
review publication does not change that key. New queued input or a product edit
during review stops the cycle before another area is dispatched; completed replies,
checks and attempts remain saved. Explicit continuation processes the next batch;
it does not automatically chase edits or rewrite old findings. Restart never arms
the scheduler. Saved scores remain visible with pending validity until reviewed.

Scheduling avoids repeated cycles; bounded shared impact requests below additionally
reduce initial area calls when their exact evidence fits. Large/uncertain areas can
still require individual source/batch/joint work.
Answer processing and adaptive question discovery can still consume AI calls.
Separate legacy automatic-maintenance/scoped actions retain their explicit settings;
use the coordinator/Guided processing for this checkpoint behavior. See
[upgrade and verification](migrations.md#question-batch-review-checkpoints-2026-11-05).

## Shared multi-area impact requests (2026-11-05)

Within a fixed review checkpoint, compatible **new** change-impact tasks can share
one request for two to four features, capped at 96,000 context characters. Full
original nine-finding assessments remain intact. Exact record versions and changes
are pooled losslessly, not summarized or truncated. Compatible paid single-area
tasks keep their existing protocol and take precedence over fresh grouping.

Every selected feature must return its own exact-task-bound nine-check verdict or
explicit source-review deferral. Missing/extra features, guessed/foreign citations,
model/profile violations and malformed replies publish nothing. Valid publication
is atomic. An affected/uncertain finding never becomes unaffected because a neighboring
feature passed or citations/labels stayed unchanged. Missing indispensable bodies
defer to established individual source-loading/batched review, inheriting all spent
shared attempts and authenticated parent provenance. Shared calls are final-only;
grouped lookup turns are not implemented. Failure, Pause and restart retain accepted
replies/attempts; continuation requires explicit consent.

Each resulting receipt additionally guards all co-read feature/evidence roots,
including foreign evidence left uncited. Later foreign edits invalidate it even if
its narrow original input key is unchanged; subsequent comparisons include those
exact foreign changes. Original assessment identities, findings, dates and evidence
are never rebased. Processing & queue displays the shared scope/attempts; Logs count
one actual request, not one per feature.

**Read-only fit measurement:** saved revision 3178 had 23 dated assessments. Nine
authenticated incremental baselines remained available; 22 impact tasks fit as
15 initial requests (three three-feature cohorts, one two-feature cohort, eleven
individual tasks). The remaining area still needs the existing deeper path. This
is seven fewer initial requests (32%), not a semantic verdict or guaranteed total
saving: this measures fresh context fit, not saved-job scheduling eligibility;
paid compatible tasks still take precedence. Deferrals/affected findings may require
further calls. Nothing was written
to the user database and no inference was run. Reproduce with
`npx tsx scripts/measure-change-groups.ts --database <sqlite> --project <id> --revision <n>`;
the script uses read-only SQLite and `query_only`, never `ProjectStore`.

See [compatibility and verification](migrations.md#shared-area-impact-review-2026-11-05).

## Retain staged input and question work across edits (2026-11-03)

Staged saved-answer processing, clarification and refinement now retain a valid
completed response under its original inputs if another edit arrives mid-request.
The worker then stops stale, without publishing or making another call. Compatible
explicit continuation reuses the saved step; changed materials still need review.
Invalid/cancelled/stopped/expired replies do not count as completed. Original human
answers, proposal history and spent attempts are not overwritten or reapplied.
See [compatibility and verification](migrations.md#preserve-staged-answer-clarification-and-refinement-responses-across-edits-2026-11-03).

## Question-scoped review scheduling (2026-11-03)

A pending question no longer necessarily stops every evidence review. Continue
specification can review an area outside the question's recorded dependency/evidence
scope using the existing grant. The question's area, its consumers, shared linked
evidence and the project-wide review wait. Global/unclear questions and pending
approvals, organization changes or input issues still hold all reviews. Exact
question provenance, including superseding sources, is followed transitively;
missing/ambiguous/oversized scope never grants an outside-scope request.

This applies **only to definition evidence review**, not broad discovery, proposal
refresh, new clarification, implementation planning or coding while waiting. It is
not semantic independence or permission to skip verification. Saved input keeps its
existing processing priority and separate consent. Technical failures still stop
the coordinator rather than automatically retrying or bypassing the failed task.

Processing & queue shows **Saved work and waiting decisions**: current reviews,
saved reviews needing impact review, unfinished checkpoint steps and not-started
reviews remain distinct from waiting dependencies. Details load lazily and paginate.
These labels grant nothing; original dated reviews/ledgers and spent attempts remain
unchanged. Restart remains suspended until explicit Continue. See
[compatibility and limits](migrations.md#decision-aware-evidence-review-scheduling-and-retained-progress-2026-11-03).

## Bounded exact evidence bundles (2026-11-03)

Explicit continuation can now recover a rejected canonical answer lookup when a
saved current question in another feature explicitly cites a supplied requirement.
It restores complete question/options/answer pairs and exposes exact validated
cleanup approval receipts, without treating quoted proposal disclaimers as a later
revocation. All paid responses, lookups and attempts remain saved. Later foreign
answer edits invalidate the resulting review's extended freshness scope even if
the model left its citations unchanged. See [compatibility and limits](migrations.md#bounded-cross-feature-provenance-and-authenticated-approvals-2026-11-05).

User-approved continuation can package directly linked question/answer/approval
provenance together rather than spend model calls following each link separately.
This is bounded structural retrieval, not permission to infer precedence, approval or
new product constraints. Existing saved loads can be enriched locally after validated
replay while keeping original receipts and every spent attempt. No ninth successful
lookup or broader inference consent is granted. Current-step bundles remain exact;
whole connected provenance groups stay together if existing pages are needed. The
final original check still requires indispensable joint evidence to fit. Repeating
the same eight-load block cannot dispatch another call unchanged. See
[compatibility and limits](migrations.md#bounded-exact-evidence-bundles-2026-11-03).

## Versioned bounded evidence capacity (2026-11-03)

An eligible legacy 64-step schedule can now activate a versioned receipt-backed
all-nine-check view without inventing a dimension split. This resolves the case
where already-read whole question/answer pairs made the old unscoped request
overflow, while the existing dimension protocol's complete view fits. Historical
responses, hashes, exact evidence and attempts stay saved; indispensable joint
evidence still must fit or block. This happens only during explicit continuation,
not reopening the app. See [compatibility and qualification](migrations.md#receipt-backed-all-dimension-continuation-2026-11-05).

User-approved continuation can upgrade the original 64 exact-evidence partitions to
128 per phase after validating saved history and the capacity boundary. This is a
one-time scheduling policy, not model allowance or broader consent. Existing request,
failure, exhausted-step recovery, 2,304-step execution and 64 linked-page partition
ceilings remain. Original receipts and spent attempts are never reset. Separate pages
still cannot establish a relationship requiring an exact joint read; that check must
fit or stop safely. See the
[compatibility ledger](migrations.md#bounded-partition-capacity-upgrade-2026-11-03).

## Cooperative saved-definition validation (2026-11-02)

Continuous consent does not justify repeatedly losing a worker lease during local
preparation. Definition replay now yields between saved receipts, checks Pause/stale
revision changes and renews only a still-live lease. Progress explicitly reports
saved stages validated locally; it does not count new model work or publish coverage.
Rendering-local caching preserves exact evidence/context semantics and is discarded
before mutations. Existing action/request deadlines and recovery consent remain.
See the [compatibility ledger](migrations.md#cooperative-definition-replay-and-rendering-local-caches-2026-11-02).

## Within-step supplemental evidence pages (2026-11-02)

User-approved continuation can page accumulated exact evidence inside one unfinished
assessment check when even its complete selected finding plus gathered records cannot
fit. Whole records and supplied current question/answer pairs remain intact. Accepted
pages save draft progress, but cannot publish the area or establish cross-page
consistency. The final original check must reload indispensable joint evidence exactly;
if that bundle still cannot fit, work stops safely without repeated paging.

Pages share existing partition/execution ceilings, request/failure limits and explicit
recovery consent. Original attempts and successful loads stay charged. Pause, restart
suspension, stale-result rejection and real product blockers remain in effect. No
additional page lookups or linked-answer recall are allowed before the final check.
See the [compatibility ledger](migrations.md#within-step-supplemental-evidence-pages-2026-11-02).

## Stage-scoped supplemental evidence (2026-11-02)

User-approved continuation keeps each unfinished step's exact supplemental loads
through local repacking, then stops automatically carrying their bodies into later
steps after acceptance. Every original request/receipt, finding, citation and spent
attempt remains saved. Required earlier text must be reloaded exactly, within the
existing action and failure allowance; navigation or omitted findings cannot justify
new conclusions. Previously validated linked load IDs remain eligible for exact
reload, not unrestricted project-wide access. Existing Stop, stale/lease guards,
context limits, genuine blockers and explicit exhausted-step recovery are unchanged.
See the [compatibility ledger](migrations.md#stage-scoped-supplemental-evidence-bodies-2026-11-02).

## Exact saved-answer recall for scoped ambiguity (2026-11-02)

The user approved restoring full previously reviewed, retained-draft-cited human
question/answer pairs directly linked to records named by a later lookup blocker.
Omitted dimension findings stay omitted: the exact human question, options and chosen
answer support the next check, not an AI summary or inferred preference precedence.
All linked candidates are recalled or none, within ten complete pairs/twenty records
and 96,000 characters. The blocked response stays spent; no successful-load credit,
failure reset or additional consent is manufactured. Already-present evidence and
genuine product/technical blocks retain their stop rules. Original receipts and
attempts replay across reopen and portable continuation. See the
[migration ledger](migrations.md#exact-linked-answer-recall-after-scoped-ambiguity-2026-11-02).

## Bounded invalid-assessment citation correction (2026-11-02)

User-approved correction also covers invalid citations in definition assessments,
updates and verification verdicts, not just evidence lookups. The entire rejected
response leaves saved findings unchanged. The next request permitted by live consent
gets validation feedback, without guessed replacements, partial application or a new
allowance. Citation and lookup failures share the existing three-failure limit. Other
errors/blockers, Stop, stale-output protection and separately confirmed exhausted-step
recovery retain their rules. Exact saved contexts and attempts survive replay/reopen
and portable continuation; see the
[migration ledger](migrations.md#bounded-correction-of-invalid-assessment-citations-2026-11-02).

## Bounded invalid-lookup correction (2026-11-02)

The user approved letting a definition step correct invalid evidence references using
precise validation feedback, within its existing three-failure limit and live action
consent. Rejected batches load nothing; even valid references in a mixed invalid batch
must be resubmitted completely. Every rejected attempt is charged, not credited as a
successful load. Unknown IDs/labels are never guessed or silently dropped. Exhaustion
still stops and the separate one-request recovery remains explicit; ordinary Continue
cannot reset it. Other failures/blockers retain their existing stops. Saved checks and
accepted loads replay unchanged through reopen/portable continuation. See
[compatibility ledger](migrations.md#bounded-correction-of-invalid-evidence-lookups-2026-11-02).

Verification: **1,469** full-suite tests, all 18 default browser runners, five final
focused correction tests, a focused correction/Pause/reload browser flow, type checks
and UI/desktop/Windows Electron checks passed. No live inference or real-project writes.

## Task-derived dimension scheduling (2026-11-02)

Continue/Refresh can resume a compatible saved review whose auxiliary dimension work
filled the old 128-step schedule. After replay, an optional policy budgets the complete
bounded task grid: two phases × (64 evidence partitions + 64 linked-page partitions)
× nine dimensions, up to 2,304 steps. All completed responses, exact evidence, selected
checks, lookup hashes and failed attempts remain saved; no new action/recovery grant
is inferred. Legacy work retains its previous bounds until activation; restart alone
does not dispatch. Metrics can retain the associated bounded request ledger. See
[migration details](migrations.md#task-derived-definition-dimension-execution-2026-11-02).

A read-only unchanged-findings simulation of the real checkpoint completed at 173
steps (55 simulated new checks), preserving all 118 saved stages and accepted loads.
Its largest request was 95,929 characters. No live model calls or project writes were
used; future live interpretation remains unverified.

Verification: **1,464** full-suite tests, all 18 default browser runners, focused
continuous/limit browser checks, type checking, UI/desktop builds and Windows Electron
checks passed. Upgrade tests retain an unfinished portable/SQLite checkpoint and
independently enforce per-phase evidence/page limits.

## Continuous Continue specification (2026-11-01)

The browser's Continue button now sends explicit `continue-continuous` consent rather
than the legacy bounded `continue` action. It no longer pauses just because eight
requests or five active minutes have elapsed. Large definition reviews use the existing
continuous staged runner, reusing saved receipts/evidence loads and preserving every
failed attempt. Staged question preparation, refinement, saved-input review and gap
packages also retain their per-step limits while removing this coordinator's action
cutoff. Requests are counted durably before dispatch; worker/job leases stay finite
and renew only while their owner is live. Twenty coordinator steps yield to another
worker pass without requiring a button click or resetting the grant's cumulative count.

Pause/Stop, model/connection errors, stale edits, exhausted steps, evidence/product
blockers and decisions still stop or wait for attention. Individual requests still
time out. Continuous consent does not renew exhausted-step recovery or authorize
research, coding or approvals. Manual mode still includes only saved input authorized
at the start and disarms at a real waiting/stopping boundary. Reopen/poll never arms a
saved continuous grant. Click Continue again after restarting; old bounded grants
remain bounded until a new explicit action. Earlier dated burst limits below describe
legacy behavior. See [migration ledger](migrations.md#continuous-specification-consent-2026-11-01).

Verification: **1,460** tests (754 pretests + 706 main), all 18 default browser
runners, type checking, UI/desktop builds, Windows Electron continuity/relaunch and
diff checks passed. New deterministic tests cross the former allowance using twelve
requests over twelve simulated minutes, then preserve accounting on Stop, failure and
technical block. No live-model qualification or real-project writes were performed.

## Compact saved-lookup metadata (2026-11-01)

Ordinary Continue/Refresh adopts compact context metadata after replay: canonical
supplemental IDs replace repeated historical AI lookup explanations, while originals
remain in receipts. Citation-map values can share the lossless identifier dictionary.
No human evidence or selected check is shortened, accepted calls are not repeated,
and existing attempts, coordinator grants and context limits remain authoritative.
The latest real checkpoint replays read-only with all 34 stages and 39 records at
83,208 / 96,000 characters; future live interpretation remains unverified. See
[migration details](migrations.md#compact-definition-navigation-metadata-2026-11-01).

Verification: **1,456** full-suite tests, all 18 default browser runners, focused
continuous/recovery browser checks, six focused metadata/recovery regressions, type
checking, UI/desktop builds and Windows Electron checks passed. These checks use
fixtures; the real checkpoint was inspected read-only, without live model calls.

## Bounded draft groups after saved evidence loads (2026-11-01)

Continue specification now resumes the accepted-pages → supplemental-load overflow
path without repeating either the pages or saved lookup. Complete selected AI draft
checks are reviewed in bounded dimension groups; all exact base/supplemental evidence
remains supplied. Omitted checks and global findings are preserved by app-side
validation. A narrower group is not permission to settle an unknown cross-dimension
relationship or to waive an exhausted attempt/recovery grant.

The optional execution policy distinguishes 64 exact-evidence partitions **per phase**
from up to 128 total review steps (including linked/dimension groups), instead of the
legacy combined 64-step ceiling. This is a bounded task schedule, not a larger workflow
grant: Continue still spends its existing eight-request/five-minute burst before
dispatch and pauses at its boundary. Explicit continuation resumes saved groups;
reopen alone starts no calls. Metrics can retain more than 64 requests without losing
or inventing measurements. See
[compatibility and limits](migrations.md#bounded-assessment-dimensions-after-supplemental-evidence-2026-11-01).

Verification: full suite **1,454** tests, 18 default browser runners, final nine focused
scope/recovery regressions, type checking and UI/desktop builds passed. Windows Electron
checks passed after the app was closed. A read-only no-inference simulation of the
remaining real checkpoint schedule reached completion; this does not qualify future
live model interpretation or guarantee that no genuine blocker remains.

## Bounded linked-answer pages (2026-11-01)

Continue specification can now insert full linked question/answer review pages before
an oversized unfinished evidence step, using the same owned grant. Each request is
charged before dispatch; paging does not enlarge the eight-request/five-minute burst,
reset failed attempts or grant exhausted-step recovery. Original evidence and saved
loads still run after all pages; completed pages resume through ordinary Continue or
Refresh without a separate recovery workflow. The common 64-stage ceiling still applies.
Synthetic tests exercise the actual coordinator entry point, charge dispatched pages
to its existing grant and reject repeated continuation of a genuine new blocker.
See [migration ledger](migrations.md#bounded-linked-answer-review-pages-2026-11-01).

Verification: full suite **1,445** tests, all 18 default browser runners, final seven
focused page regressions, type checking and UI/desktop builds passed. Windows Electron
checks passed after the app was closed, including SQLite continuity/relaunch and saved
project retention. This qualifies packaging/continuation, not live model correctness.

## Saved linked-answer continuation (2026-11-01)

The same owned Continue specification permission also enables the additive
`linkedAnswerPolicy` upgrade for typed lookup failures with a canonical unread
question/answer witness. Full questions/options and current human answers, including
explicit reverse-linked reconciliation chains, are supplied before review resumes.
Graph links do not decide which preference governs. Refresh uses the same upgrade;
there is no separate linked-answer recovery workflow. Existing bounded coordinator
grants and exhausted-step consent remain unchanged. Original receipts, evidence
loads, hashes and spent attempts survive. See the
[compatibility ledger](migrations.md#exact-linked-question-and-answer-bundles-2026-11-01).

Desktop follow-up: after the user quit the app, `npm run test:desktop` successfully
rebuilt/staged the update and passed Windows Electron checks, including saved SQLite
continuity/relaunch, renderer isolation and shutdown. This resolves the staging lock
reported below; verification used test data, not the user's project or live inference.

## Saved reference-policy recovery through Continue specification (2026-11-01)

**Continue specification** now activates the compatible stable-reference upgrade
when resuming a structurally proven old evidence-label loop. Previously only ordinary
Refresh/recovery supplied that permission, so Continue could replay the old error
with zero model requests instead of reaching the repaired unfinished step.

The permission is derived internally from the live, owned coordinator grant; it is
not an API option or a new persisted authorization. It is separate from continuous
Refresh: Continue retains its existing eight-request/five-minute burst, worker lease,
before-dispatch accounting, exact evidence bounds and per-step failed-attempt limits.
Completed review calls, supplemental evidence, raw replies and original blocker are
retained. A renewed workflow burst does not grant an exhausted step another request;
that still requires the existing explicit confirmation through Refresh. Genuine
product conflicts and new-protocol lookup blocks are not silently cleared or retried.

Synthetic coordinator tests exercise the actual Continue entry point after repeated
SQLite reopen, including an old label loop, exhausted attempts and an explicit product
decision blocker. No automatic calls occur on reopen/poll; only the compatible case
resumes, its new calls are charged to the workflow grant, and repeating Continue cannot
clear a new block or reset attempts. No live model calls or real project writes were
used. This fixes continuation plumbing, not the correctness of any model's new review.

Verification: full `npm test` passed **1,432** tests (726 pretests + 706 main),
including the three coordinator/reopen regressions; type checking, UI build, all 18
default browser runners and diff check passed. The Windows desktop build/check attempt was
blocked by `EPERM` removing the staged SQLite native module, consistent with the
desktop app still running. No process was terminated. Quit the desktop completely,
then rerun `npm run test:desktop` before launching the updated staged desktop build;
the dependency staging step did not complete. No live model calls or real project
data writes were used for verification.

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
