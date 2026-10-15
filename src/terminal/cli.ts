import { parseArgs } from "node:util";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { modelSelection, type Project } from "../core/model.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { OpenCodeDiscovery } from "../runtime/discovery.js";
import { safeMessage } from "../runtime/contract.js";
import { coverage } from "../core/coverage.js";

const help = `Requirement Wizard — persistent terminal discovery

npm run wizard -- new --name "My app" --idea "Describe the idea" --provider openai --model gpt-6.1-sol
npm run wizard -- list
npm run wizard -- show --project <id> [--revision <n>] [--json]
npm run wizard -- interview --project <id>
npm run wizard -- analyze --project <id> --expected-revision <n>
npm run wizard -- answer --project <id> --expected-revision <n> --question <id> --text "Answer"
npm run wizard -- review --project <id> --expected-revision <n> --requirement <id> --decision accept --text "Rationale"
npm run wizard -- model --project <id> --expected-revision <n> --provider openai --model gpt-6.1-sol
npm run wizard -- jobs --project <id>
npm run wizard -- recover

answer supports --kind answer|delegation|deferral. Delegation text must describe its scope.
review supports accept|reject. Historical revisions are read-only snapshots.
Optional --data-dir <directory> overrides the user-local data location.
Only analyze/interview make model calls (using the saved explicit provider/model).
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
  }
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    help: { type: "boolean" }, json: { type: "boolean" }, "data-dir": { type: "string" },
    name: { type: "string" }, idea: { type: "string" }, provider: { type: "string" }, model: { type: "string" },
    project: { type: "string" }, revision: { type: "string" }, "expected-revision": { type: "string" },
    question: { type: "string" }, text: { type: "string" }, kind: { type: "string" },
    requirement: { type: "string" }, decision: { type: "string" },
    research: { type: "boolean" }, "focus-epic": { type: "string" },
  } });
  if (values.help || !positionals.length) { console.log(help); return; }
  const command = positionals[0];
  if (positionals.length !== 1 || !["new", "list", "show", "model", "answer", "review", "analyze", "interview", "jobs", "recover"].includes(command!)) {
    throw new Error("Unknown command. See --help.");
  }
  if (command === "interview" && (!stdin.isTTY || !stdout.isTTY)) throw new Error("interview requires an interactive terminal; use analyze/answer/review for scripting.");
  const directory = resolve(values["data-dir"] ?? join(process.env.LOCALAPPDATA ?? join(homedir(), ".local/share"), "requirement-wizard"));
  const store = new ProjectStore(join(directory, "projects.sqlite"));
  const service = new DiscoveryService(store, new OpenCodeDiscovery(join(directory, "runtime")));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  try {
    const print = (project: Project) => values.json ? console.log(JSON.stringify(project, null, 2)) : printProject(project);
    const runAnalysis = async (id: string, rev: number) => {
      console.error("Analysis sends project context to the saved provider and consumes allowance. Ctrl+C cancels.");
      const job = await service.analyze(id, rev, { signal: controller.signal, research: values.research, focusEpicID: values["focus-epic"], onProgress: (message) => console.error(message) });
      console.error(`Job ${job.id}: ${job.status}${job.diagnostic ? ` — ${job.diagnostic}` : ""}`);
      if (job.status !== "completed") process.exitCode = 1;
      return job;
    };
    if (command === "new") {
      print(store.create(required(values.name, "name"), required(values.idea, "idea"), modelSelection.parse({
        providerID: required(values.provider, "provider"), modelID: required(values.model, "model"),
      })));
    } else if (command === "list") {
      console.log(JSON.stringify(store.list(), null, 2));
    } else if (command === "recover") {
      console.log(JSON.stringify({ interruptedJobs: store.recoverExpiredJobs(), note: "Only expired worker leases were recovered; active jobs were preserved." }));
    } else {
      const id = required(values.project, "project");
      if (command === "show") print(store.get(id, values.revision ? revision(values.revision) : undefined));
      else if (command === "jobs") console.log(JSON.stringify(store.jobs(id), null, 2));
      else if (command === "model") print(store.setModel(id, revision(values["expected-revision"]), modelSelection.parse({
        providerID: required(values.provider, "provider"), modelID: required(values.model, "model"),
      })));
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
    store.close();
  }
}

main().catch((error: unknown) => {
  console.error(safeMessage(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
