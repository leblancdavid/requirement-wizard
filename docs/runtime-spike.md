# OpenCode runtime spike

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
