# Decisions and open questions

## Confirmed product direction

These choices come from the project conversation. They do not imply acceptance of
every technical detail proposed in the planning documents.

| ID | Decision | Source |
| --- | --- | --- |
| DEC-001 | Start from a human idea and iteratively research, ask questions, and define requirements. | Initial project request |
| DEC-002 | Serve technical and nontechnical users. | User selected both audiences |
| DEC-003 | Provide desktop and terminal experiences. | User selected both interfaces |
| DEC-004 | Originally prioritize GitHub Copilot and ChatGPT connections; initial-release provider scope superseded by DEC-007. | Original provider selection, retained as history |
| DEC-005 | Include work organization and implementation planning. | Initial project request |
| DEC-006 | OpenCode is an acceptable initial build integration; integrated coding is a future goal. | User's build-workflow preference |
| DEC-007 | Use ChatGPT for now and defer Copilot support. Copilot compatibility is not a current milestone or release gate. | User explicitly deferred Copilot support |
| DEC-008 | Prioritize a local browser application for the first playable visual experience. Desktop remains a later wrapper target. | User approved browser-first delivery |
| DEC-009 | Organize ideas into evolving epics, continually evaluate their gaps, and support splitting/merging/refining them. | User described the discovery workflow |
| DEC-010 | Automatically organize unconfirmed information; show changes and review changes affecting confirmed decisions. | User approved AI-driven organization |
| DEC-011 | Show estimated completeness for epics and the project, with explanations and explicit uncertainty. Manage AI context as part of the engine. | User requested progress feedback and appropriate context management |
| DEC-012 | Explain ambiguous concepts inline and offer question-level rephrasing, context, examples, and decision support without automatically answering the question. | User requested concept tooltips and clarification/help deciding, then approved the proposed behavior |
| DEC-013 | Make the browser question-first with a compact expandable list, visible answer revision, feature/category context, a grouped feature map, and on-demand progress/details. | User selected the compact question list, requested broader map/health/header cleanup, and approved implementation |
| DEC-014 | Add existing-project discovery as a follow-on after core review and portable handoffs: reconstruct evidence-backed requirements from a local source folder, review them with the user, and use them as the starting point for feature work. | User proposed importing existing projects and approved the recommended follow-on scope |
| DEC-015 | Move toward app-owned AI connections, authentication, and model selection without requiring OpenCode for discovery; start with a direct ChatGPT-plan compatibility spike. | User requested independence and approved the staged recommendation; distribution/license and live direct access remain unresolved |

## Proposed implementation defaults

| ID | Proposal | Rationale / validation |
| --- | --- | --- |
| TECH-001 | Local-first TypeScript service with SQLite. | SQLite/in-process service and authenticated loopback browser API implemented. CLI still attaches to storage in process; daemon discovery remains planned. |
| TECH-002 | React browser first; Electron wrapper and Ink terminal remain later options. | Browser delivery follows DEC-008; retain shared engine boundaries. |
| TECH-003 | Use OpenCode as the initial model/tool runtime, migrating toward direct providers under DEC-015. | Legacy selections retain OpenCode with partial live verification on 1.18.32. App-owned ChatGPT auth/catalog Settings UI and direct discovery/help dispatch are implemented and fixture-verified, but not live-qualified. Direct research is unsupported. See runtime-spike.md and direct-providers.md. |
| TECH-004 | Use ChatGPT subscription sign-in for the initial release. | Current provider scope follows DEC-007; verify actual account/model availability. |
| TECH-005 | Export build packages before embedding build execution. | Test specification quality with a fresh coding session before adding orchestration. |
| TECH-006 | Windows first for verification. | Current development environment; portable core preserves later platform options. |
| TECH-007 | Keep requirements in structured ordinary-language records. | Traceability without requiring a new programming language or compiler. |
| TECH-008 | Use better-sqlite3 11.10.0 and a readline terminal prototype for the first vertical slice. | Native module verified on Node 20.11/Windows; keeps persistence usable before introducing the richer Ink interface. |
| TECH-009 | Use Vite 6.4.4 and React for the browser build. | Compatible with Node 20.11; built assets served by the local Node API. |
| TECH-010 | Nine fixed coverage dimensions with evidence-gated statuses and 3/2/1 importance weights. | Implemented deterministic estimate; calibration and model semantic judgment remain limitations. |
| TECH-011 | Fresh revision-bound context with a 48,000-character detail budget. | Implemented deterministic task working sets and automatic queue grouping on overflow, with pinned human guardrails/evidence closure, versioned manifests, and scope-validated partial results. Help reserves room for bounded history. Exact tokenization/model-capacity adaptation remain future work. |
| TECH-012 | Start existing-project discovery with a one-time, read-only source snapshot and bounded analysis of documentation, source, and tests. | Proposed M7 design; capture file identity and inspected/omitted scope. Automatic refresh and repository change detection follow later. |

## Open questions

| ID | Question | Resolve by | Initial handling |
| --- | --- | --- | --- |
| OPEN-001 | Which installed OpenCode/SDK versions support the needed behavior? | Milestone 1 | Both pinned to 1.18.32; capability results recorded in runtime-spike.md, with remaining gaps explicit. |
| OPEN-002 | Can supported auth flows be embedded, or must onboarding launch OpenCode? | Milestone 1 | Accept external connection flow initially. |
| OPEN-003 | Which search/fetch integration should research use? | Milestone 1 recommendation; milestone 4 verification | OpenCode webfetch verified on two official specifications; websearch path implemented but not live-qualified. |
| OPEN-004 | How reliably can discovery tool profiles exclude coding tools and inherited workspace instructions? | Milestone 1 | Test effective behavior before relying on the runtime profile. |
| OPEN-005 | How should service discovery, lifecycle, and local authentication work? | Milestone 2 | Foreground loopback browser server with per-launch token and same-origin checks implemented; daemon discovery/CLI attachment remain open. |
| OPEN-006 | What budgets should apply to discovery and research? | Milestone 4 | Start with bounded configurable calls/retries; calibrate from observed use. |
| OPEN-007 | What export layout best supports fresh OpenCode sessions? | Milestone 5 | Evaluate a manifest, baseline documents, and per-phase packages. |
| OPEN-008 | Which files and snapshot limits give useful existing-project coverage without excessive context or storage? | Milestone 7 | Define selection/exclusion rules, file and total budgets, and evidence retention before implementation; surface omissions explicitly. |
| OPEN-009 | Does intended distribution qualify for OpenAI's direct ChatGPT-plan preview, and does the direct flow work for the account? | Direct-provider migration | Confirm open-source/local versus paid/hosted distribution; run independent live sign-in/catalog/inference/refresh checks. No direct live access claimed. |

## Revision policy

Record new product decisions with their human source or explicit delegated scope.
Keep technical recommendations marked as proposals until adopted or verified by the
relevant implementation work. Supersede decisions with rationale rather than removing
their history. A failed capability check should change the affected plan explicitly.
