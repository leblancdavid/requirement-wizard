import { parseArgs } from "node:util";
import { defaultDataDirectory } from "../storage/paths.js";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { modelSelection, type ModelSelection, type Project } from "../core/model.js";
import { ProjectStore } from "../storage/store.js";
import { renderCombinedSpecification } from "../storage/workspace.js";
import { DiscoveryService } from "../service/discovery.js";
import { OpenCodeDiscovery } from "../runtime/discovery.js";
import { safeMessage } from "../runtime/contract.js";
import { coverage } from "../core/coverage.js";
import { implementationNeedsReview } from "../core/implementation.js";
import { ConnectionManager } from "../providers/connections.js";
import { CredentialStore } from "../providers/credentials.js";
import { ConnectedDiscovery } from "../providers/discovery.js";

const help = `Reqwizit — persistent terminal discovery

npm run reqwizit -- new --name "My app" --idea "Describe the idea" --provider openai --model gpt-6.1-sol
npm run reqwizit -- list
npm run reqwizit -- open --path "D:\\Projects\\my-app" --provider openai --model gpt-6.1-sol
npm run reqwizit -- show --project <id> [--revision <n>] [--json]
npm run reqwizit -- export --project <id> [--revision <n>] [--json]
npm run reqwizit -- interview --project <id>
npm run reqwizit -- analyze --project <id> --expected-revision <n>
npm run reqwizit -- scan --project <id> --expected-revision <n> [--resume-job <scan-job-id>]
npm run reqwizit -- answer --project <id> --expected-revision <n> --question <id> --text "Answer"
npm run reqwizit -- review --project <id> --expected-revision <n> --requirement <id> --decision accept --text "Rationale"
npm run reqwizit -- model --project <id> --expected-revision <n> --provider openai --model gpt-6.1-sol
npm run reqwizit -- jobs --project <id>
npm run reqwizit -- recover
npm run reqwizit -- workspace --project <id> --operation connect --path "D:\\Projects\\my-app" --expected-revision <n> [--create-directory]
npm run reqwizit -- workspace --project <id> --operation status|sync|disconnect [--expected-revision <n>]
npm run reqwizit -- implementation --project <id> --expected-revision <n> --requirement <id> --status in-progress --text "Notes" [--evidence "Verification results"]

answer supports --kind answer|delegation|deferral. Delegation text must describe its scope.
review supports accept|reject. Historical revisions are read-only snapshots.
export prints a combined Markdown specification, or portable JSON with --json.
Optional --data-dir <directory> overrides the user-local data location.
Optional --connection <saved-account-id|opencode> selects the route for new/open/model.
open restores .reqwizit project state without inference; processing starts paused.
new supports --path <absolute-directory> [--create-directory] to connect a workspace.
Implementation statuses: not-started, in-progress, blocked, implemented, verified.
Verified requires --evidence. Disconnect retains workspace files and app data.
Model changes retain the existing connection unless explicitly changed.
Only analyze/interview/scan make model calls (using the saved explicit provider/model).
scan initializes or rescans a connected folder, then stops for proposal review.
analyze supports --focus-epic <epic-id> and opt-in --research for bounded web retrieval.
interview saves answers immediately; quit and resume with the same project ID.
This CLI uses JSON-text validation and does not claim release readiness. Research is opt-in.
`;

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing --${name}. See --help.`);
  return value;
}

function revision(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new Error("Supply the displayed positive --expected-revision (or --revision for historical inspection).");
  }
  return Number(value);
}

function printProject(project: Project) {
  console.log(`\n${project.name}\nProject: ${project.id}\nRevision: ${project.revision}\nModel: ${project.model.providerID}/${project.model.modelID}`);
  if (project.summary) console.log(`\nInterpretation (AI proposal${project.analysisRevision === project.revision ? "" : "; changed since analysis — re-analyze"}): ${project.summary}`);
  for (const goal of project.goals) console.log(`  Candidate goal: ${goal}`);
  for (const actor of project.actors) console.log(`  Candidate actor: ${actor}`);
  for (const assumption of project.assumptions) console.log(`  Unconfirmed assumption: ${assumption}`);
  const score = coverage(project);
  console.log(`\nEstimated definition coverage: ${score.percent}% (${score.stale ? "needs review" : "latest assessment"}; not proof of completeness)`);
  for (const epic of project.epics.filter((item) => !item.archived)) {
    const status = score.epics.find((item) => item.epicID === epic.id)!;
    console.log(`  ${epic.title}: ${status.percent}% · ${status.openQuestions} open questions · ${epic.id}`);
  }
  if (project.research.length) {
    console.log("\nSource-backed findings:");
    for (const item of project.research) console.log(`  ${item.title} (${item.kind})\n    ${item.url}\n    ${item.finding}`);
  }
  console.log("\nQuestions:");
  for (const question of project.questions) {
    console.log(`  [${question.status}] ${question.id}\n    ${question.text}\n    Why: ${question.whyItMatters}`);
    for (const [index, option] of question.options.entries()) console.log(`    ${index + 1}. ${option.label} — ${option.consequence}`);
    const source = project.sources.find((item) => item.id === question.sourceID);
    if (source) console.log(`    Human ${source.kind}: ${source.text}`);
    if (question.retirementReason) console.log(`    Retired: ${question.retirementReason}`);
  }
  console.log("\nRequirements:");
  for (const requirement of project.requirements) {
    console.log(`  [${requirement.status}] ${requirement.id}\n    ${requirement.statement}\n    Rationale: ${requirement.rationale}`);
    for (const scenario of requirement.acceptance) console.log(`    Acceptance: ${scenario}`);
    console.log(`    Sources: ${requirement.sourceIDs.join(", ")}`);
    if (requirement.reviewNote) console.log(`    Review: ${requirement.reviewNote}`);
    const implementation = project.implementation.find((item) => item.requirementID === requirement.id);
    console.log(`    Implementation: ${implementation?.status ?? "not-started"}${implementation && implementationNeedsReview(project, implementation) ? " (needs review)" : ""}`);
    if (implementation?.notes) console.log(`    Implementation notes: ${implementation.notes}`);
    if (implementation?.evidence) console.log(`    Verification evidence (human-recorded): ${implementation.evidence}`);
  }
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    help: { type: "boolean" }, json: { type: "boolean" }, "data-dir": { type: "string" },
    name: { type: "string" }, idea: { type: "string" }, provider: { type: "string" }, model: { type: "string" }, connection: { type: "string" },
    project: { type: "string" }, revision: { type: "string" }, "expected-revision": { type: "string" },
    question: { type: "string" }, text: { type: "string" }, kind: { type: "string" },
    requirement: { type: "string" }, decision: { type: "string" },
    research: { type: "boolean" }, "focus-epic": { type: "string" },
    operation: { type: "string" }, path: { type: "string" }, "create-directory": { type: "boolean" },
    status: { type: "string" }, evidence: { type: "string" },
    "resume-job": { type: "string" },
  } });
  if (values.help || !positionals.length) { console.log(help); return; }
  const command = positionals[0];
  if (positionals.length !== 1 || !["new", "open", "list", "show", "export", "model", "answer", "review", "analyze", "scan", "interview", "jobs", "recover", "workspace", "implementation"].includes(command!)) {
    throw new Error("Unknown command. See --help.");
  }
  if (command === "interview" && (!stdin.isTTY || !stdout.isTTY)) throw new Error("interview requires an interactive terminal; use analyze/answer/review for scripting.");
  const directory = resolve(values["data-dir"] ?? defaultDataDirectory());
  const store = new ProjectStore(join(directory, "projects.sqlite"));
  const connections = new ConnectionManager(new CredentialStore(join(directory, "providers")));
  const service = new DiscoveryService(store, new ConnectedDiscovery(connections, new OpenCodeDiscovery(join(directory, "runtime"))));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  try {
    const print = (project: Project) => values.json ? console.log(JSON.stringify(project, null, 2)) : printProject(project);
    const selectModel = (previous?: ModelSelection) => {
      const providerID = required(values.provider, "provider");
      const connectionID = values.connection === "opencode" ? undefined : values.connection ?? (previous?.providerID === providerID ? previous.connectionID : undefined);
      if (connectionID && providerID !== "openai") throw new Error("Direct ChatGPT connections require --provider openai.");
      return modelSelection.parse({ providerID, modelID: required(values.model, "model"), ...(connectionID ? { connectionID } : {}) });
    };
    const runAnalysis = async (id: string, rev: number) => {
      console.error("Analysis sends project context to the saved provider and consumes allowance. Ctrl+C cancels.");
      const job = await service.analyze(id, rev, { signal: controller.signal, research: values.research, focusEpicID: values["focus-epic"], onProgress: (message) => console.error(message) });
      console.error(`Job ${job.id}: ${job.status}${job.diagnostic ? ` — ${job.diagnostic}` : ""}`);
      if (job.status !== "completed") process.exitCode = 1;
      return job;
    };
    if (command === "open") {
      print(store.openWorkspace(resolve(required(values.path, "path")), selectModel()));
      console.error("Opened saved project. Automatic processing is paused; review imported verification commands before running checks. No model calls were made.");
    } else if (command === "new") {
      const created = store.create(required(values.name, "name"), required(values.idea, "idea"), selectModel());
      print(created);
      if (values.path) console.log(JSON.stringify(store.connectWorkspace(created.id, created.revision, resolve(values.path), values["create-directory"]), null, 2));
    } else if (command === "list") {
      console.log(JSON.stringify(store.list(), null, 2));
    } else if (command === "recover") {
      console.log(JSON.stringify({ interruptedJobs: store.recoverExpiredJobs(), note: "Only expired worker leases were recovered; active jobs were preserved." }));
    } else {
      const id = required(values.project, "project");
      if (command === "show") print(store.get(id, values.revision ? revision(values.revision) : undefined));
      else if (command === "export") {
        const exported = renderCombinedSpecification(store.get(id, values.revision ? revision(values.revision) : undefined));
        stdout.write(values.json ? exported.json : exported.markdown);
      }
      else if (command === "scan") {
        console.error("Scanning sends eligible source files to the saved AI connection and consumes allowance. Ctrl+C cancels.");
        store.pauseQueue(id, true);
        const job = await service.scan(id, revision(values["expected-revision"]), { resumeJobID: values["resume-job"], signal: controller.signal, onProgress: (message) => console.error(message) });
        console.error(`Scan ${job.id}: ${job.status}${job.diagnostic ? ` — ${job.diagnostic}` : " — Review proposals before running analyze."}`);
        if (job.status !== "completed") process.exitCode = 1;
        print(store.get(id));
      }
      else if (command === "workspace") {
        store.get(id);
        const operation = required(values.operation, "operation");
        if (operation === "connect") console.log(JSON.stringify(store.connectWorkspace(id, revision(values["expected-revision"]), resolve(required(values.path, "path")), values["create-directory"]), null, 2));
        else if (operation === "disconnect") { store.disconnectWorkspace(id, revision(values["expected-revision"])); console.log("Workspace disconnected; files retained."); }
        else if (operation === "sync" || operation === "status") {
          const workspace = store.syncWorkspace(id);
          console.log(JSON.stringify(workspace, null, 2));
          if (workspace && ["conflict", "unavailable"].includes(workspace.status)) process.exitCode = 1;
        } else throw new Error("operation must be connect, status, sync, or disconnect.");
      }
      else if (command === "implementation") print(store.setImplementation(id, revision(values["expected-revision"]), required(values.requirement, "requirement"), {
        status: required(values.status, "status"), notes: values.text ?? "", evidence: values.evidence ?? "",
      }));
      else if (command === "jobs") console.log(JSON.stringify(store.jobs(id), null, 2));
      else if (command === "model") print(store.setModel(id, revision(values["expected-revision"]), selectModel(store.get(id).model)));
      else if (command === "answer") {
        const kind = values.kind ?? "answer";
        if (kind !== "answer" && kind !== "delegation" && kind !== "deferral") throw new Error("kind must be answer, delegation, or deferral.");
        print(store.answer(id, revision(values["expected-revision"]), required(values.question, "question"), { kind, text: required(values.text, "text") }));
      } else if (command === "review") {
        const decision = required(values.decision, "decision");
        if (decision !== "accept" && decision !== "reject") throw new Error("decision must be accept or reject.");
        print(store.review(id, revision(values["expected-revision"]), required(values.requirement, "requirement"), decision === "accept" ? "accepted" : "rejected", required(values.text, "text")));
      } else if (command === "analyze") {
        await runAnalysis(id, revision(values["expected-revision"]));
        print(store.get(id));
      } else if (command === "interview") {
        const terminal = createInterface({ input: stdin, output: stdout });
        terminal.on("SIGINT", cancel);
        try {
          while (!controller.signal.aborted) {
            const project = store.get(id);
            printProject(project);
            const action = (await terminal.question("\n[a] analyze  [q] answer question  [r] review requirement  [x] exit: ", { signal: controller.signal })).trim();
            if (action === "x") break;
            if (action === "a") { await runAnalysis(id, project.revision); continue; }
            try {
              if (action === "q") {
                const questionID = (await terminal.question("Question ID: ", { signal: controller.signal })).trim();
                const question = project.questions.find((item) => item.id === questionID);
                if (!question) throw new Error("Question not found.");
                console.log(`${question.text}\nWhy: ${question.whyItMatters}`);
                const mode = (await terminal.question("[a] answer / [d] defer / [g] delegate: ", { signal: controller.signal })).trim();
                if (!["a", "d", "g"].includes(mode)) throw new Error("Choose a, d, or g.");
                const answer = await terminal.question("Text, or option number for a normal answer (include scope for delegation): ", { signal: controller.signal });
                const option = /^\d+$/.test(answer.trim()) ? question.options[Number(answer.trim()) - 1] : undefined;
                if (mode === "a" && /^\d+$/.test(answer.trim()) && !option) throw new Error("Option number is out of range.");
                store.answer(id, project.revision, questionID, { kind: mode === "a" ? "answer" : mode === "d" ? "deferral" : "delegation",
                  text: mode === "a" && option ? option.label : answer });
                console.log("Response saved. Analyze when ready to generate the next batch.");
              } else if (action === "r") {
                const requirementID = (await terminal.question("Requirement ID: ", { signal: controller.signal })).trim();
                const decision = (await terminal.question("accept / reject: ", { signal: controller.signal })).trim();
                if (decision !== "accept" && decision !== "reject") throw new Error("Choose accept or reject.");
                const note = await terminal.question("Review rationale: ", { signal: controller.signal });
                store.review(id, project.revision, requirementID, decision === "accept" ? "accepted" : "rejected", note);
              }
            } catch (error) {
              if (controller.signal.aborted) break;
              console.error(safeMessage(error instanceof Error ? error.message : error));
            }
          }
        } finally { terminal.removeListener("SIGINT", cancel); terminal.close(); }
      }
    }
  } finally {
    process.removeListener("SIGINT", cancel);
    await connections.close();
    store.close();
  }
}

main().catch((error: unknown) => {
  console.error(safeMessage(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
