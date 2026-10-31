# Scoped-review provider bridge

Status, 2026-10-30: **explicit adapter bridge implemented; deterministic transport checks
passed**. The engine pilot can be constructed with `definitionScopeDiscoveryAdapter`
around the existing `ConnectedDiscovery`/`OpenCodeDiscovery` adapters. The later
[browser pilot](browser-workspace.md#scoped-review-browser-pilot-2026-10-30) constructs this
bridge for explicit consented starts; ordinary CLI/coordinator routing, scoped assessment
publication and automatic finding-level reuse remain disabled. A separate qualification
runner has now completed [three bounded live OpenCode scenarios](definition-scope-live-check.md).
These are not proof of effective permission enforcement or human semantic sign-off.

## Routing and request boundary

The existing [scope execution pilot](definition-scope-pilot.md) still owns explicit consent,
one reserved adapter invocation, cancellation/deadline and saved-response recovery. The
bridge starts nothing on construction. It receives authoritative current project state,
verifies the exact packet/model and builds the same v1 context manifest used by storage.
Missing/masked evidence, changed inventories, mixed task markers or stale view bindings
reject before provider startup. Scan, research and question-help profiles cannot consume
a scope marker. Assigned outputs and complete quoted evidence remain unchanged.

The prompt is a dedicated JSON-text scope contract, not ordinary discovery/proposals. It
supplies exact scope/context keys and output schema, retains all evidence including other
categories' wording/options, and requires separate cross-dimensional concerns. The core
reply validator still enforces assignments, citations, concerns and uncertainty before
the engine checkpoints anything. Prompts/instructions are not proofs of semantic quality.

Connection routing remains owned by `ConnectedDiscovery`: no local connection ID means
the selected OpenCode route; a direct selection uses only its exact app-owned account.
Disconnected accounts, unsupported models, account errors or schema failures never switch
provider/account/model/output format or retry with weaker restrictions. Metadata/catalog/
credential refresh requests are not additional generation allowances; the reserved adapter
attempt is still not proof of provider acceptance, billing or the provider's internal calls.

The bridge requires reported actual provider/model identity to match the selected target.
Malformed/missing identity, reported research and callback violations reject; a later valid
callback cannot erase a violation even if an adapter swallows the earlier callback error.
This observes adapter metadata, not independently authenticated provider/account identity.
Native session IDs and provider credentials are not copied into scope records or exports.

## OpenCode route

`OpenCodeDiscovery` uses its existing owned loopback server, non-research session permissions
and tool-disable map. Scope prompts are checked before runtime startup. Observable tool
parts/events, a different returned model, invalid JSON or cancellation reject rather than
producing a scoped result. Cleanup targets the owned runtime only; it never discovers,
restarts or terminates the user's shared OpenCode server.

The app remains pinned to `@opencode/client@2.1.4`; no SDK methods, credential ownership,
V2 permission projection or V1 fallback change. Tests capture the app-owned client requests
and separately retain existing native-V2 adapter fixture coverage. They do **not** prove
effective live enforcement against every tool/plugin/global configuration. Provider-side
cancellation and live subscription/model availability remain unqualified.

Reference checks used the current [V2 client guide](https://opencode.ai/v2/docs/build/client),
[V2 permission rules](https://opencode.ai/v2/docs/permissions) and installed pinned types.
The runtime factory is now injectable for deterministic checks; its default remains the
existing owned-server launcher and normal callers require no changes.

## Direct ChatGPT route

Only new scoped requests opt into transport profile `scoped-no-tools-v1`:

- The Responses request explicitly sends `tools: []`, `tool_choice: "none"` and
  `parallel_tool_calls: false`, preserving the selected account/model and JSON-text path.
- Tool-call events, unsupported incremental output-item types and tool-bearing/future
  completion inventory items reject. No tool dispatcher is introduced.
- A complete supported inventory of reasoning/text-message output is required. Final
  message text must exactly equal the received text stream; missing/mismatched inventories
  do not become success by ignoring extra output or choosing a later fragment.
- Failed/incomplete/truncated/oversized streams and wrong returned models remain failures.
  Existing abort handling and protected rotating-token refresh ownership are unchanged.

Ordinary direct discovery/help/probes retain their existing request and parser behavior;
this profile is opt-in for the specialized scope marker only. Unsupported profile parameters
at an account fail visibly, without silently removing them or falling back to OpenCode.
See the [Responses API request reference](https://developers.openai.com/api/reference/resources/responses/methods/create).
These are requested restrictions and observable-response checks, not a live sandbox or
proof that a remote provider performed no hidden work.

## Saved-work compatibility

SQLite remains **20**, execution schema **2**, usage export **2** and portable formats
unchanged. The shared context-manifest helper reproduces the previous v1 fields/keys;
no run/marker/request/response/result representation or freshness semantics changes.
Old completed scope results and valid saved replies reuse without invoking the new bridge,
reading credentials or issuing inference solely to gain provider metadata. Their existing
`validated-output-only` authority is not upgraded to live-provider/tool qualification.
No missing provider witnesses are fabricated and no existing records are backfilled.

The injected adapter now additionally receives authoritative project state; existing
implementations can ignore the extra input. Public callers of the new bridge must never
substitute model-supplied project state for the store's verified project.

## Checks and next gates

Tests exercise real adapter classes with mocked runtime/HTTP transports and synthetic
credentials, never user accounts: exact prompt/context/model/profile routing, deny-tool
requests, malformed/mixed contexts before auth/startup, sticky violations, unexpected tools,
missing/future inventory, stream/final-text mismatch, disconnected/unlisted/rejected direct
models, cancellation/late output/owned cleanup, no fallback/secret leakage and no-call reuse
of previously saved pilot evidence. The later scoped browser runner covers explicit controls
with a deterministic adapter, not live provider behavior.

```powershell
npx tsx --test src/service/definition-scope-adapter.test.ts src/service/definition-scope-review.test.ts
```

Explicit browser start/status/owned Stop and ambiguous-response handling are implemented.
The [qualification harness](definition-scope-qualification.md) now provides offline preflight
and an opt-in single-request OpenCode runner with readonly inspection and human review rubrics.
Live OpenCode retention-choice, privacy and quoted-instruction requests completed; their dated
results and agent reviews are recorded separately, without upgrading authority. Human sign-off, direct live access and
effective adversarial permission enforcement remain unqualified.
Next: human review of that saved result, then separately consented broader qualification.
The [scoped provenance foundation](definition-scope-provenance.md) now verifies original
finding witnesses readonly; persisted publication/mixed consistency and genuinely narrower
evidence contracts remain separate gates. This bridge does not establish independence,
readiness or actual requests saved.

Verification, 2026-10-30: type check, **1,329** deterministic tests (625 pretests +
704 main), focused scope/provider/pinned-client checks, UI build, all thirteen default
browser runs and diff check passed. New checks use mocked owned runtimes/HTTP streams
and synthetic accounts; no live inference/authentication/tool-permission probe was run.
Existing completed pilot results remain unchanged without requalification calls. No
commits or pushes. Existing bundle-size warning and live/semantic/performance gaps remain.
