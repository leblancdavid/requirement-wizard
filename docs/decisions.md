# Decisions and open questions

## Confirmed product direction

These choices come from the project conversation. They do not imply acceptance of
every technical detail proposed in the planning documents.

| ID | Decision | Source |
| --- | --- | --- |
| DEC-001 | Start from a human idea and iteratively research, ask questions, and define requirements. | Initial project request |
| DEC-002 | Serve technical and nontechnical users. | User selected both audiences |
| DEC-003 | Provide desktop and terminal experiences. | User selected both interfaces |
| DEC-004 | Prioritize GitHub Copilot and ChatGPT connections. | User selected these providers |
| DEC-005 | Include work organization and implementation planning. | Initial project request |
| DEC-006 | OpenCode is an acceptable initial build integration; integrated coding is a future goal. | User's build-workflow preference |

## Proposed implementation defaults

| ID | Proposal | Rationale / validation |
| --- | --- | --- |
| TECH-001 | Local-first TypeScript service with SQLite. | Shared state for both clients; verify restart and concurrent edits. |
| TECH-002 | Electron/React desktop and Ink/React terminal. | Shared language and reusable presentation logic; verify Windows packaging and keyboard flows. |
| TECH-003 | Use OpenCode as the initial model/tool runtime. | Partial live verification on 1.18.32; JSON text works for ChatGPT, Copilot quota and native schema recovery remain unresolved. See runtime-spike.md. |
| TECH-004 | Use subscription sign-in for the two prioritized providers. | Inferred from provider discussion; verify actual account/model availability. |
| TECH-005 | Export build packages before embedding build execution. | Test specification quality with a fresh coding session before adding orchestration. |
| TECH-006 | Windows first for verification. | Current development environment; portable core preserves later platform options. |
| TECH-007 | Keep requirements in structured ordinary-language records. | Traceability without requiring a new programming language or compiler. |

## Open questions

| ID | Question | Resolve by | Initial handling |
| --- | --- | --- | --- |
| OPEN-001 | Which installed OpenCode/SDK versions support the needed behavior? | Milestone 1 | Both pinned to 1.18.32; capability results recorded in runtime-spike.md, with remaining gaps explicit. |
| OPEN-002 | Can supported auth flows be embedded, or must onboarding launch OpenCode? | Milestone 1 | Accept external connection flow initially. |
| OPEN-003 | Which search/fetch integration should research use? | Milestone 1 recommendation; milestone 4 verification | Keep search capability separate from provider auth. |
| OPEN-004 | How reliably can discovery tool profiles exclude coding tools and inherited workspace instructions? | Milestone 1 | Test effective behavior before relying on the runtime profile. |
| OPEN-005 | How should service discovery, lifecycle, and local authentication work? | Milestone 2 | One compatible local service for both clients. |
| OPEN-006 | What budgets should apply to discovery and research? | Milestone 4 | Start with bounded configurable calls/retries; calibrate from observed use. |
| OPEN-007 | What export layout best supports fresh OpenCode sessions? | Milestone 5 | Evaluate a manifest, baseline documents, and per-phase packages. |

## Revision policy

Record new product decisions with their human source or explicit delegated scope.
Keep technical recommendations marked as proposals until adopted or verified by the
relevant implementation work. Supersede decisions with rationale rather than removing
their history. A failed capability check should change the affected plan explicitly.
