# Mixed-consistency provider bridge

Status, 2026-10-31: **explicit provider bridge implemented; mocked transport checks passed**.
`definitionMixedDiscoveryAdapter` connects the [durable mixed pilot](definition-mixed-execution.md)
to the existing `ConnectedDiscovery`/`OpenCodeDiscovery` adapters. The bridge itself adds no browser/CLI
route, coordinator scheduling, saved-review/apply action or automatic reuse. Later
[explicit browser controls](definition-mixed-browser.md) now construct it for confirmed requests. No live mixed
request or provider-permission probe was run; prior small scoped observations do not qualify
the new mixed contract's live semantics, account support or effective tool enforcement.

## Separate source, dispatch and publication boundaries

The durable store remains responsible for exact original ordinary/scoped witness verification,
one-request reservation, deadline/cancellation, validated reply persistence and atomic completion.
Bridge construction starts no runtime, credential access or request. Callers explicitly construct
it for a separately confirmed mixed task; source declarations supplied directly to a pure
helper are not authenticated merely because their hashes/schema are self-consistent.

Provider preflight reconstructs the canonical selection from the existing nine finding origins
and full scoped source packets, reproducing the original request key rather than changing the
frozen context. It rebuilds complete current evidence and checks the exact assembly/packet,
record inventory, character counts and exclusive manifest. Missing/masked evidence or concerns,
mixed task markers, wrong keys, alternate scan/research/help profiles and changed unused packet
fields reject before provider startup/account access. Context capture also caps at 1 MiB;
the existing 96,000-character complete-data bound is unchanged. Nothing is silently truncated.

Private project/model/context snapshots prevent transport mutations or swallowed callbacks
from redefining the expectations after dispatch. New requests require reported actual provider/
model identity to match the selected target. Missing/wrong/malformed identity or reported
research rejects; a later valid callback cannot erase an earlier violation. The bridge then
validates the dedicated strict reply, including all exact-origin verdicts and original-concern
keys. These are adapter-observed facts, not independently authenticated provider/account identity
or proof the model understood every relationship. A structurally supported response cannot
publish an assessment, approve a product choice, authorize another request or skip work.

## Routing, no tools and JSON text

No app-local connection ID means the selected OpenCode route, with OpenCode owning credentials
and its supported sign-in/account flow. A direct selection uses only its exact app-owned account
through `ConnectionManager`. Disconnected/unlisted/rejected account/model requests never fall
back to another account, provider, model, schema mode or weaker restriction profile. Catalog/
metadata/token-refresh operations are not additional generation grants; an app reservation is
not a provider acceptance/billing receipt or proof of provider-internal request counts.

The prompt is **MIXED SOURCE DEFINITION CONSISTENCY ONLY**, not ordinary discovery or a scope
reassessment. It preserves all captured project evidence, original finding identities, full
scoped concerns and uncertainty, with one exact-origin verdict per dimension and the complete
source-concern inventory. Quoted source instructions are data, not tool permission. The response
is JSON text with local validation; no native-schema retry/fallback is introduced.

**OpenCode:** the existing owned loopback runtime, non-research deny-all session permissions,
disabled-tool map and selected model are retained. Observable tool parts/events, wrong models
and invalid JSON reject. Cancellation targets only that owned runtime/session and ignores late
output; it does not discover/attach to/stop the user's shared desktop server. The pinned
`@opencode/client@2.1.4` app-owned projection is unchanged; no new SDK method, V1 credential
fallback or permission-field conversion is introduced. Requested permissions and output checks
are not live proof against arbitrary plugins/global configuration or hidden provider work.

**Direct ChatGPT:** mixed requests opt into the existing transport policy `scoped-no-tools-v1`
(its name/semantics are deliberately unchanged). It sends empty tools, `tool_choice: none`,
`parallel_tool_calls: false`, requires a complete supported reasoning/text output inventory
and exact final-message/streamed-text equality, and rejects tool-bearing/future/missing items
or tool events. Unsupported profile parameters fail rather than being removed or retried.
Ordinary discovery/help/probes keep their existing parser/request behavior. Credentials,
cross-process rotating-token refresh and native session ownership remain unchanged.

## Saved-work compatibility

**No persisted migration.** Source/target SQLite **22**, execution **2**, usage export **2**,
conditional portable envelopes 1/2/3, mixed run/marker/response/result policies, original source
origins and request/assembly/context identities are unchanged. Canonical request reconstruction
matches the previously stored selections; the frozen mixed evidence document/instruction and
manifest builder are not edited to add provider metadata.

Previously completed injected-pilot results and valid saved replies reuse/recover with their
original dates/IDs, without invoking the bridge, reading credentials or issuing calls solely
to acquire new transport/model observations. No provider witnesses are fabricated/backfilled
and their authority is not upgraded to live qualification. Raw tasks/checkpoints/native sessions
remain local-only; credentials are not copied into project records, logs, fixtures or exports.

## Verification and next gates

Verified on 2026-10-31: `npm run check`; full `npm test` (**1,395 passing**:
691 pretests + 704 main); `npm run test:browser` (UI build and all **15 runners**);
and `git diff --check`. After the final test-cleanup/documentation edits, type checking
and the focused mixed/scope adapter, mixed task and native-client suite passed again
(**62 tests**). The UI build retains its non-blocking chunk-size warning.

Tests use real adapter classes with mocked owned-runtime/HTTP transports and synthetic accounts:
complete prompt/context/source identities, exact routing, malformed/hybrid contexts before
auth/startup, sticky telemetry/research violations, isolated validation snapshots, deny-tool
requests, tool parts/events, wrong models/JSON, direct output inventories, unavailable accounts/
models, HTTP rejection, native cancellation/late output/owned cleanup, no fallback/secret leakage
and no-call old-result/saved-reply reuse after reopen. Existing native V2 client tests retain
their separate request-projection coverage; mocks do not establish live subscription behavior.

```powershell
npx tsx --test src/service/definition-mixed-adapter.test.ts src/service/definition-mixed-review.test.ts
```

Reference inspection used the current [V2 client guide](https://opencode.ai/v2/docs/build/client),
[permissions reference](https://opencode.ai/v2/docs/permissions) and installed pinned client types.

The later browser slice now implements explicit source selection/start/status/owned Stop,
ambiguous-response recovery and read-only candidate preview. Separately bounded live mixed
qualification requires authorization. Saved-review/publication eligibility and
atomic separately confirmed apply remain separate work; effective tool enforcement, broader
semantics/performance and automatic finding-level reuse remain unqualified.
