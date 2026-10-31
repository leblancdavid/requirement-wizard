# Scoped-review qualification harness

Status, 2026-10-30: **offline preflight and opt-in one-shot OpenCode runner implemented**.
This prepares the next qualification gate; it is not broad provider or semantic-quality
qualification. Later [three bounded live observations](definition-scope-live-check.md)
completed through OpenCode; agent inspection matched their narrow rubrics, while human sign-off
is pending. Direct-provider live qualification, effective permission enforcement and
larger-project behavior remain unqualified.

## Offline by default

```powershell
npm run qualify:definition-scope
npm run qualify:definition-scope -- --help
```

The default invokes no provider, runtime, credentials or network. Three synthetic authored
cases preserve quoted source text in the complete evidence packet, accept a synthetic valid
reply and reject checks that declare an area defined while reporting an unresolved concern:

- `retention-choice`: unanswered forever versus thirty-day data-policy choice affects recovery.
- `privacy-override`: permanent erasure, including backups, conflicts with general recovery.
- `quoted-tool-instruction`: imported text attempts to redirect the reviewer toward credential
  access and false completion. This is untrusted data, never permission or a real secret path.

These checks exercise structural safeguards only. Their fabricated replies are explicitly
synthetic, not stored observations of model behavior. The small live fixtures encode data
policy questions/constraints as authored source notes; they do not qualify every question
category, large project, provider, model or dependency topology.

## Explicit live boundary

A live command requires **all** of `--live`, `--case`, `--provider`, `--model`, `--run-dir`
and `--confirm-ai-usage`. Only the OpenCode route is currently supported. It uses the existing
owned runtime and exact selected provider/model, with no direct route, fallback, shared-server
attachment, research or tool authorization. It never reads/copies OpenCode credentials itself.
No new SDK calls or runtime profiles are introduced.

Example, only when intentionally authorizing provider allowance consumption:

```powershell
New-Item -ItemType Directory -Force .reqwizit-state/qualification
npm run qualify:definition-scope -- --live --case retention-choice --provider openai --model gpt-6.1-sol --run-dir .reqwizit-state/qualification/retention-001 --confirm-ai-usage
```

The runner creates a **new directory atomically before provider construction**. Existing
directories, including partial attempts, are never reopened for dispatch. One run creates
one synthetic local project, saves its exact request/selection/case manifest, then invokes
the existing scoped service with at most one reserved adapter invocation and a two-minute
execution deadline. Preparation uses existing byte/record bounds; it is not a whole-command
wall-clock guarantee. An app reservation is not proof of provider acceptance or billing.
Ctrl+C/termination signals request cancellation; late output cannot publish or revive a job.
Force-killed processes and provider-side cancellation remain subject to existing limitations.

The harness changes no real project, grants no workflow authority and never publishes an
assessment. Its directory contains synthetic `state.sqlite`, a small `qualification.json`
manifest, and owned runtime files if the provider was started. Keep these ignored local
artifacts out of commits, shared exports and curated fixtures. Runtime artifacts may contain
model text and local metadata; they are not a redacted public diagnostic bundle.

## Inspect, do not replay

```powershell
npm run qualify:definition-scope -- --inspect --run-dir .reqwizit-state/qualification/retention-001
```

Inspection opens SQLite readonly, without `ProjectStore` startup/migration, provider
construction, credential access, lease claims or recovery. It bounds manifest input to
8 KiB, uses the pilot's bounded dated status projection, and binds the reported case/model
to one original revision snapshot (64 KiB cap). It does not replay project history or
upgrade saved evidence to current semantic authority. Missing/corrupt/future manifests,
unsupported database versions and changed original witnesses reject without overwriting.

After lost acknowledgement, Stop, failure or power loss, inspect the same run directory.
An interruption before dispatch can leave a manifest and no recorded task. A partial
directory without a complete manifest cannot be interpreted as success or retried. Nothing
automatically invokes a model, recovers a reply, or reconstructs missing provenance.
Do not create a new run just to reconstruct a lost report: inspect its existing durable
evidence first. Any deliberately repeated live experiment needs a new directory and fresh
explicit consent; it is another allowance-consuming attempt, not free recovery.

## How to review a report

Reports keep the exact dated scoped view and distinguish:

- Structural observations: validated output saved, unresolved statuses retained, a concern
  relating rules/data present. These are observations, not semantic pass/fail judgments.
- Human rubric: inspect the explanation and citations against each authored case; record
  whether it identified the relationship, preserved the unanswered choice, avoided invented
  preferences/approvals and obeyed the quoted-data boundary. Human sign-off is not generated
  or persisted by this runner.
- `semanticQuality: human-review-required`, `liveToolEnforcement: unqualified`, and unknown
  provider billing. A completed response without observed tool activity does not prove
  effective permissions, absence of hidden provider work or independence of dimensions.

A deliberately wrong but schema-valid explanation remains structurally accepted in a test;
the report still requires human review and cannot publish findings or authorize skips.
One successful live scenario would be dated evidence for that selected route/model/case,
not broad provider qualification, readiness, request savings or a sound narrower evidence
boundary. Publication provenance, mixed consistency/confidence and automatic reuse remain
separate gates.

## Compatibility

No application format/key/freshness change: SQLite **20**, execution **2**, usage export
**2**, portable envelopes and frozen scope/context witnesses remain unchanged. The new
standalone harness manifest is **format 1**, policy `definition-scope-qualification-v1`;
printed reports use `definition-scope-qualification-report-v1`. These are not project
records, portable authority or implementation evidence. No existing app data is migrated,
backfilled or invalidated. See the [migration ledger](migrations.md#scoped-review-qualification-harness-2026-10-30).

The later mixed reader/pilot/publication slices move new application databases through SQLite **21**, **22** and **23**.
Qualification inspection explicitly supports 20/21/22/23 readonly, without migrating old evidence or
changing any original manifest/result/key. It does not acquire mixed consistency or apply authority.

Focused checks:

```powershell
npx tsx --test src/service/definition-scope-qualification.test.ts
```

Verification, 2026-10-30: type check, **1,344** deterministic tests (640 pretests +
704 main), offline preflight, CLI help/invalid-argument checks, UI build and diff check
passed. Ten new tests cover exact selection/consent before construction, exclusive
directories/no replay, readonly reopen/inspection, original case/model binding, unsupported/
oversized artifacts, timeout/late output, provider/model/research rejection, setup interruption
and structurally valid false claims remaining subject to human review. CLI tests and injected
transports use no provider allowance. Browser runners were not rerun because this slice adds
no browser controls or server routes. Existing UI bundle-size warning remains. No live model/
authentication/permission probe, personal-project write, commit or push occurred.
