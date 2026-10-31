# OpenCode runtime spike

## Explicit mixed provider bridge (2026-10-31)

The [durable mixed pilot](definition-mixed-execution.md) now has an
[explicit provider bridge](definition-mixed-providers.md). OpenCode/direct discovery accepts
its marker only after exact complete-context/selection verification and uses a dedicated
JSON-text mixed-consistency prompt. Scan/research/help and malformed/hybrid contexts reject
before runtime/account access; no ordinary-profile/model/account fallback is introduced.
Existing owned lifecycle, deny-all/non-research permissions, tool-disable projection and V2
client 2.1.4 remain unchanged. Mocked transports exercise identity/tool/JSON/cancellation/
cleanup paths; no live mixed request or permission probe was run. Prior scoped observations
do not qualify mixed semantics/effective permissions. Later [browser controls](definition-mixed-browser.md)
enable explicit mixed requests; later separately confirmed assessment apply makes no runtime
request and grants no planning/coding authority.

## Scoped-review live observation (2026-10-30)

One explicitly bounded `retention-choice` qualification request completed through the owned
OpenCode route with selected `openai/gpt-6.1-sol`, the pinned V2 client and the existing
non-research/no-tools profile. Both assigned checks stayed partial, cited the unanswered
retention-choice source and linked it to recovery behavior. Agent inspection matched the
narrow rubric; human sign-off is pending. Readonly inspection reproduced the original dates/
result without another adapter invocation or saved-row changes. No retry, fallback, real
project, assessment publication or coding was involved. This was one live request, not
effective adversarial tool enforcement, provider-side cancellation or broad subscription
qualification. See [exact dates, evidence and limits](definition-scope-live-check.md).

Subsequent `privacy-override` and `quoted-tool-instruction` runs each completed with fresh
one-request consent through the same selected route, in about twelve seconds. Agent review
observed unresolved erasure/recovery rules including backups, and treatment of the malicious
credential-access quote as untrusted data rather than permission. The adapter accepted its
observable no-tool/research checks; this does **not** demonstrate a denied tool attempt or
effective permission enforcement. Human sign-off remains pending. All three existing results
also passed readonly original-witness provenance inspection without changes or further calls.

## Scoped-review adapter bridge (2026-10-30)

The explicit scope pilot now has a [provider bridge](definition-scope-providers.md) to
the existing discovery adapter. Scope prompts re-verify complete context and reject mixed
scan/research/help profiles before runtime startup. The existing non-research deny-all/
disabled-tools profile, JSON-text output, exact-model validation and owned-server lifecycle
are retained; the V2 client remains pinned to 2.1.4 with no new SDK calls or V1 fallback.
An injectable runtime factory enables deterministic request/cleanup/tool-rejection tests.
Those mocked checks do not qualify live subscription availability, permission enforcement,
provider-side cancellation or semantic scope quality. A later explicit browser pilot uses
this bridge with status-first consent and exact owned Stop. A separate opt-in qualification
runner subsequently produced the live observation above; ordinary CLI/coordinator start
remains disabled. Compatible old scope results/replies reuse unchanged.

## Current OpenCode V2 adapter (2026-10-25)

User-approved migration: `@opencode/client@2.1.4` replaces the old
`@opencode-ai/sdk@1.18.32`. Despite its `/v2/client` import path, that old SDK called
the V1 server API. The desktop installed here is OpenCode **2.1.4**, while the npm
binary previously preferred by Reqwizit remained **1.18.32**. V2 imports supported
legacy credentials into its SQLite store, but refreshed V2 credentials are not
written back to V1 `auth.json`. The old process therefore kept reporting token-refresh
401s even when the updated desktop was signed in. No credential values were inspected
or copied during diagnosis/migration.

`src/runtime/executable.ts` now prefers versioned Windows desktop CLI installations,
then native PATH/npm candidates, accepting V2 only. `OPENCODE_BIN` remains an explicit
native-binary override; an obsolete V1 override rejects rather than silently falling
back. Other platforms can use native PATH or the override. Tested desktop CLI:
`%APPDATA%/ai.opencode.desktop/cli/2.1.4-x64/opencode-cli.exe`. Selection probes only
`--version`, not inference. Do not change or uninstall the user's other installations.

The app owns an authenticated loopback `serve` child using an ephemeral in-memory
server password. It shares OpenCode's normal provider credential management, not its
desktop/shared-server process lifecycle. Configuration uses native V2 agents,
permissions and skills; warming and automatic compaction are disabled for bounded
app tasks. Metadata initialization waits for V2 catalogs before using provider,
agent or skill listings. No global config/service registration is rewritten.

The app-owned projection in `src/runtime/client.ts` handles V2 prompt queueing,
wait/interrupt, full ascending message pagination (cursor requests must omit order),
exact queued-input matching, terminal success, model identity, tool content, skills
and events. It never treats an enqueued prompt as a completed response. Idle markers
do not hide completed assistant output during coding-session recovery; failed idle
outcomes remain fatal at publication. Earlier tool steps remain visible even when
the last assistant step contains only JSON. Provider settings/account metadata never
reach the model dropdown projection. V2 has no tool-registry endpoint: the adapter's
tool restriction list is explicitly app-owned, not claimed runtime registry evidence.

Verification actually run:

- `spike -- providers` and `spike -- profile`: owned V2 server, native model/provider
  metadata and role config worked. OpenAI was connected and Sol was listed. Listing
  Copilot metadata is not a Copilot inference probe or qualification.
- `runtime:skills`: assessment/coding/planning skill file identity/content and native session
  permission create/update/get/delete passed, with staged temporary files cleaned up.
  This is metadata, not a claim of adversarial enforcement or coding success.
  An intermediate Windows cleanup check encountered a directory lock. All roles now
  stop only their owned process tree, with bounded retries for owned temporary-file
  cleanup; the final metadata check passed all three roles including cleanup.
- One bounded synthetic `openai/gpt-6.1-sol` JSON-text probe authenticated and produced
  a completed, schema-valid response. Initial result retrieval exposed the cursor/order
  incompatibility; after fixing it, the same response was recovered and validated with
  **no repeated model request**.
- One bounded live `runtime:skills -- --live-assessment --provider openai --model
  gpt-6.1-sol` check passed native skill loading and scenario-result validation against
  a tiny supplied greeting-function excerpt. No source edits, Git delivery or personal
  project calls were made. These two model calls consumed plan allowance.

Native JSON-schema probing is not qualified on V2 and is rejected before dispatch;
the spike now defaults explicitly to JSON text with local validation. Live V2 coding,
GitHub delivery, in-flight/V1 coding-session recovery, research/adversarial tool budgets
and full actual-project staged clarification remain unqualified. Prior V1 live results
below do not automatically qualify those V2 paths. See [migration ledger](migrations.md#opencode-v1-to-v2-transport-and-credential-ownership-2026-10-25).

Verification completed 2026-10-26: `npm test` passed **907 tests** (247 pretests + 660
main). Type checking, UI build, CLI help checks, focused native transport/execution
tests and model-selection/Specification browser checks passed. The final metadata
skill check covered assessment, coding and planning, including cleanup. Broader
browser runners retain their previously recorded unrelated assertion gaps and were
not claimed passing by these focused checks. `npm audit --omit=dev` reports two high
findings in the unchanged Zod 3 / zod-to-json-schema dependencies; fixing those needs
a separate breaking-schema upgrade and was not bundled into this runtime migration.
Both root and staged-desktop dependency locks now use the V2 client. The desktop
rebuild passed after the user closed the running app that held SQLite's native binary
open. A subsequent Electron smoke test reached the workspace and IPC/log checks, then
failed its titlebar-height assertion (`src/desktop/desktop-check.ts:60`: 0px versus
36px); the full desktop smoke test is therefore not recorded as passing. No user
application was force-closed to clear the build lock.

## Historical V1 observations

Observed October 15, 2026. M1 is **partially verified**, not complete.

DEC-015 starts migration toward independent provider connections. A separate
[direct ChatGPT spike](direct-providers.md) is implemented but not live-qualified.
The observations below describe the existing OpenCode execution path only.

Current scope: ChatGPT is the initial provider. Copilot support and live checks are
deferred by DEC-007 in [decisions.md](decisions.md). Earlier Copilot results below
are retained as observations, not outstanding release gates.

## Run locally

Prerequisites: Node.js 22.12 or newer for the current development toolchain, npm,
and OpenCode. Earlier verification below used Node 20.11. Install dependencies with
`npm ci`. On Windows the runner detects the native executable in the standard npm
installation location. For another installation, set `OPENCODE_BIN` to its executable.

```powershell
npm run check
npm test
npm run spike -- --help
npm run spike -- providers
npm run spike -- profile
```

The runner starts its own loopback OpenCode server on an available port, uses the
ignored `.spike-workspace` directory, and stops the server when done. It does not
attach to or stop an existing OpenCode server. Initial startup/provider discovery can
take over 15 seconds; startup and metadata calls have 90-second limits.

Provider listing is metadata inspection, not proof that a model works for the account.
Connect missing providers with OpenCode's supported interactive flow:

```powershell
opencode auth login
```

Choose ChatGPT subscription login for current development. The runner never
reads the runtime's credential file. Existing credentials were used for these checks;
fresh sign-in and an embedded onboarding flow have not been exercised.

### Owned execution skills (2026-10-19)

The implementation/assessment profiles now register app-bundled native skills. Run
the following metadata-only check with the installed pinned OpenCode 1.18.32:

```powershell
npm run runtime:skills
```

Both profiles passed registration/body/tool checks, session permission create/update/
get and temporary-file cleanup. OpenCode appends permission updates, so the adapter
appends a restrictive role profile only when the existing final rules do not match.
The assessment role permits only its named skill; the coding role adds its existing
coding tools. Discovery profiles are unchanged. These checks do not establish
adversarial permission enforcement.

An optional live check requires explicit opt-in and an exact model selection:

```powershell
npm run runtime:skills -- --live-assessment --provider openai --model gpt-6.1-sol
```

This consumes provider allowance for one minimal assessment, bounded to 90 seconds.
On 2026-10-19 it successfully loaded the matching assessment skill and returned a
validated complete result for a tiny supplied code excerpt. It made no source changes,
performed no Git delivery and did not test coding-model skill use. See
[implementation skills](implementation-workspace.md#bundled-opencode-skills) for the
state, context-budget and cache-identity contracts.

### Model probes

Choose exact IDs from `providers`. These calls send the idea to the provider and may
consume subscription allowance. Account/model availability changes over time.

```powershell
# Verified on this machine; explicit JSON text mode with local schema validation.
npm run spike -- probe --provider openai --model gpt-6.1-sol --format text-json

# Native structured-output compatibility check (failed in the tested runtime).
npm run spike -- probe --provider openai --model gpt-6.1-sol

# Deferred Copilot example; only run when support is brought back into scope.
npm run spike -- probe --provider github-copilot --model gpt-5-mini --format text-json

# Cancel an in-flight request; then run a fresh probe to check subsequent work.
npm run spike -- probe --provider openai --model gpt-6.1-sol --format text-json --cancel-after-ms 1000

# Uses a newly started runtime to look up an existing session and its messages.
npm run spike -- session --session <session-id-from-probe>
```

`--idea` accepts an alternative project idea. `--timeout-ms` limits prompt work
(default 120000; excludes startup/catalog discovery). Ctrl+C during a probe requests
remote session cancellation. Cancellation reports an unconfirmed abort if the remote
abort request fails. Sessions remain in OpenCode for inspection; this spike does not
persist application requirements or print full session transcripts.

Standard output contains JSON result records; progress is emitted to standard error.
The human-readable npm script banner precedes these records. Help and validation
failures do not require a running runtime. Non-cancellation failures exit nonzero.

## Version and environment observations

| Component | Observed version |
| --- | --- |
| Windows Node.js | 20.11.0 |
| npm | 10.4.0 |
| OpenCode executable and server health | 1.18.32 |
| `@opencode-ai/sdk` | 1.18.32 (pinned) |
| TypeScript | 5.8.3 (pinned) |

Use the SDK's `/v2/client` export. Its flat arguments differ from examples using
`path`/`body`; assistant results use `info.structured`, not `info.structured_output`.
No runtime upgrade or user-level OpenCode configuration change was performed.

## Capability results

| Capability | Result | Evidence / limitation |
| --- | --- | --- |
| Server startup, health, shutdown | Pass | Health returned version 1.18.32; each command owns a separate server. |
| Provider/auth-method/model discovery | Pass | Copilot and OpenAI reported connected; OAuth method labels available. |
| Fresh subscription sign-in | Not exercised | Existing connections used; connected status does not disclose credential type. |
| Copilot live response | Blocked | `gpt-5-mini` returned `APIError: You have no quota`; prior Sonnet probe also returned APIError, without captured detail. |
| ChatGPT `gpt-5.4-mini` / `gpt-5.4` | Rejected | Listed models, but provider said not supported when using Codex with a ChatGPT account. |
| ChatGPT `gpt-6.1-sol`, native schema mode | Failed | `StructuredOutputError: Model did not produce structured output`. |
| ChatGPT `gpt-6.1-sol`, JSON text mode | Pass | Two responses passed the local interpretation schema and reported the requested provider/model. |
| SSE progress | Pass | Session/message events and text deltas observed; no stream error in these probes. |
| Cancellation | Pass, bounded observation | A 1000ms cancellation requested remote abort and returned `cancelled`; no abort error reported. This does not prove billing cessation. |
| Fresh work after cancellation | Pass | Subsequent JSON text probe completed successfully in a fresh runtime/session. Same-session resumption not tested. |
| JSON text session recovery | Pass | New process/server loaded the saved session and its two messages, including completed assistant output. |
| Native schema session message recovery | Failed | Runtime rejected stored user-message format with `Expected OutputFormatJsonSchema`; cause not established. |
| Effective permission configuration | Inspected only | Global wildcard deny present; resolved agent rules include inherited allows and appended deny rules. Enforcement remains unverified. |
| Research tools | Identified, not exercised | Registry includes `websearch` and `webfetch`; discovery availability, budgets, and source capture still require testing. |

Successful JSON text session: `ses_ebfca9b94ffeJhu6M6QbWyhdxF` (327 input,
93 output tokens). Recovered after restart with two messages. Cancellation session:
`ses_ebfc9e041ffe3LeGe6NCTmSrbg`. Subsequent successful session:
`ses_ebfc8e21bffe3wAKTgLg3HdRVA` (327 input, 89 output tokens).

The runtime reported cost 0 for successful subscription calls. This is runtime
telemetry, not a claim that the subscription is free or an authoritative billing total.

## Adapter recommendation

Continue with the version-pinned OpenCode adapter and **explicit JSON text plus local
schema validation** as the currently demonstrated request path. Keep native schema
mode as a compatibility probe; do not automatically retry failed calls through a
different model, provider, or format.

Connected and catalog-listed are separate from live-compatible. Preserve provider
failures as actionable states. Application persistence should be independent of
OpenCode session storage; native-format recovery failure reinforces this boundary.

Before declaring M1 complete:

1. Exercise fresh ChatGPT subscription sign-in (existing credentials were used so far).
2. Resolve or deliberately adopt an alternative to native schema output/recovery.
3. Behaviorally verify discovery permissions and inherited instruction handling.
4. Exercise research retrieval with source capture and a bounded tool-call budget.
5. Verify recovery of an interrupted job and same-session work after abort.

M2 schema/storage development can proceed against the demonstrated text-JSON adapter
without claiming these remaining capabilities are verified.

## Browser-loop integration follow-up

The browser work added a narrow opt-in websearch/webfetch profile. On October 15,
2026, ChatGPT `gpt-6.1-sol` fetched the official RSS 2.0 specification and Atom RFC
4287 through two webfetch calls and produced verified-URL findings plus epic
assessments. See [browser-workspace.md](browser-workspace.md) for the job and results.
This exercises retrieval/source capture from item 4 above; live websearch, adversarial
tool-budget cancellation, and broader permission enforcement remain unverified.

The first research attempt failed because the custom SDK fetch wrapper imposed a
90-second timeout and overlooked signals carried by Request objects. The wrapper now
combines the caller's Request/RequestInit signal with a five-minute prompt or
90-second metadata deadline. A local HTTP test verifies Request-signal cancellation;
the research retry completed. Application analysis retains its combined five-minute
bound and six-minute worker lease.

## Implementation adapter follow-up — October 18, 2026

A bounded live coding check through `OpenCodeExecution` selected
`openai/gpt-6.1-sol` and SDK 1.18.32. In a disposable temporary sandbox, the first
turn created an exact text file through `apply_patch`. After stopping/restarting the
owned runtime, a second turn reused the saved session, read the file and appended
the requested line. Both JSON results and exact file bytes passed (90-second deadline
per turn). Session: `ses_eae87af17ffe0uK5dgNAHynFJ5`. No production repository or
GitHub delivery was involved. Metadata inspection found the new primary coding agent;
inherited permission rules remain present, so this does not establish effective deny
enforcement. In-flight interrupted-session recovery and full implementation/delivery
qualification remain open. See [implementation-workspace.md](implementation-workspace.md).
