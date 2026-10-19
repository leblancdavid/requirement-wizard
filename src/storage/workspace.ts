import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { homedir } from "node:os";
import type { Project } from "../core/model.js";
import { coverage } from "../core/coverage.js";
import { implementationNeedsReview } from "../core/implementation.js";
import { deliveredRequirement, type ExecutionState } from "../core/execution.js";
export { requirementFingerprint } from "../core/implementation.js";

export const workspaceFolder = ".requirement-wizard";
const legacyArtifacts = ["requirements.md", "requirements.json", "progress.md", "progress.json", "manifest.json"];
export type Workspace = {
  bindingID?: string;
  path: string; status: "saved" | "pending" | "conflict" | "unavailable";
  savedRevision: number | null; diagnostic: string | null;
  hashes: Record<string, string>; pendingHashes: Record<string, string[]>;
  formatVersion?: number;
  pendingRemovals?: string[];
};
export function hash(content: string) { return createHash("sha256").update(content).digest("hex"); }
export function canonicalDirectory(path: string, create = false) {
  if (!path.trim() || !isAbsolute(path) || path.length > 4096) throw new Error("Enter an absolute local directory path.");
  if (create) mkdirSync(resolve(path), { recursive: true });
  const canonical = realpathSync(path);
  if (!lstatSync(canonical).isDirectory()) throw new Error("Workspace must be a directory.");
  return canonical;
}
export function directoryKey(path: string) { return process.platform === "win32" ? path.toLowerCase() : path; }
export function browseDirectories(path?: string) {
  const current = canonicalDirectory(path ?? homedir());
  const directories = readdirSync(current, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
  return { path: current, parent: dirname(current) === current ? null : dirname(current), root: parse(current).root, directories };
}
export function managedDirectory(path: string) {
  if (canonicalDirectory(path) !== path) throw new Error("Workspace directory moved or changed. Reconnect it.");
  const managed = join(path, workspaceFolder);
  try {
    const stat = lstatSync(managed);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Workspace conflict: managed workspace location must be a regular directory.");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return managed;
}
export function readArtifact(directory: string, name: string): string | null {
  validateArtifactName(name);
  // Check every ancestor, including junctions, before reading or creating nested output.
  let parent = directory;
  for (const segment of name.split("/").slice(0, -1)) {
    parent = join(parent, segment);
    try {
      const stat = lstatSync(parent);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Workspace conflict: ${name} must have regular directories.`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  const path = join(directory, name);
  // lstat also catches dangling links, which existsSync deliberately follows.
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Workspace conflict: ${name} must be a regular file.`);
    return readFileSync(path, "utf8");
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export function validateArtifactName(name: string) {
  const segment = "(?:[a-z0-9_-]{1,80}|~[a-f0-9]{64})";
  const nested = new RegExp(`^(?:features/${segment}/requirements\\.(?:md|json)|evidence/(?:index\\.json|(?:sources|research|scans)/[a-f0-9]{64}\\.json))$`);
  if (![...legacyArtifacts, "project.json"].includes(name) && !nested.test(name)) throw new Error("Workspace conflict: invalid managed artifact path.");
  if (name.split("/").some((part) => /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) throw new Error("Workspace conflict: reserved managed artifact path.");
}
function featurePath(id: string) {
  // Mixed-case IDs are hashed too, so distinct engine IDs cannot alias on Windows.
  const safe = /^[a-z0-9_-]{1,80}$/.test(id) && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(id);
  return `features/${safe ? id : `~${hash(id)}`}/requirements`;
}
function json(value: unknown) { return JSON.stringify(value, null, 2) + "\n"; }
function interpretation(project: Project) {
  return ["## Interpretation (AI proposal)", project.summary || "Not yet assessed.",
    "## Candidate goals", ...project.goals.map((item) => `- ${item}`), "## Candidate actors", ...project.actors.map((item) => `- ${item}`),
    "## Unconfirmed assumptions", ...project.assumptions.map((item) => `- ${item}`)];
}
function requirementMarkdown(items: Project["requirements"], evidenceLink: (id: string) => string) {
  return items.flatMap((item) => [`### ${item.id} — ${item.status}`, item.statement, `Rationale: ${item.rationale}`,
    "Acceptance criteria:", ...item.acceptance.map((criterion) => `- ${criterion}`),
    `Sources: ${item.sourceIDs.map(evidenceLink).join(", ")}`, ...(item.reviewNote ? [`Review: ${item.reviewNote}`] : [])]);
}
function questionMarkdown(items: Project["questions"]) {
  return ["## Open questions", ...items.filter((q) => ["pending", "deferred", "delegated"].includes(q.status)).map((q) => `- [${q.status}] ${q.id}: ${q.text}`)];
}
// Explicit single-document exports include exact evidence, but are not maintained on every save.
export function renderCombinedSpecification(project: Project) {
  const markdown = [`# ${project.name}`, `Project: ${project.id}\nRevision: ${project.revision}`, ...interpretation(project)];
  for (const epic of project.epics) markdown.push(`## ${epic.title}${epic.archived ? " (archived)" : ""}`,
    ...requirementMarkdown(project.requirements.filter((item) => item.epicID === epic.id), (id) => id));
  markdown.push(...questionMarkdown(project.questions));
  return { markdown: markdown.join("\n\n") + "\n", json: json({ formatVersion: 1, projectID: project.id, name: project.name, revision: project.revision,
    summary: project.summary, goals: project.goals, actors: project.actors, assumptions: project.assumptions,
    epics: project.epics, requirements: project.requirements, questions: project.questions, sources: project.sources, research: project.research, scans: project.scans, origin: project.origin }) };
}
export function renderWorkspace(project: Project, execution?: ExecutionState): Record<string, string> {
  const score = coverage(project);
  const progress = project.requirements.map((requirement) => {
    const item = project.implementation.find((entry) => entry.requirementID === requirement.id);
    return { requirementID: requirement.id, reviewStatus: requirement.status,
      status: item?.status ?? "not-started", notes: item?.notes ?? "", evidence: item?.evidence ?? "",
      needsReview: item ? implementationNeedsReview(project, item) : false, updatedAt: item?.updatedAt ?? null };
  });
  const title = `# ${project.name}\n\nGenerated by Reqwizit. Edit in the app; external edits cause a sync conflict.\n\nSee manifest.json for the published project revision and file hashes.\n`;
  const files: Record<string, string> = {};
  const evidence = {
    sources: project.sources.map((item) => ({ id: item.id, kind: item.kind, path: `evidence/sources/${hash(item.id)}.json` })),
    research: project.research.map((item) => ({ id: item.id, path: `evidence/research/${hash(item.id)}.json` })),
    scans: project.scans.map((item) => ({ id: item.id, path: `evidence/scans/${hash(item.id)}.json` })),
  };
  for (const [index, item] of project.sources.entries()) files[evidence.sources[index]!.path] = json(item);
  for (const [index, item] of project.research.entries()) files[evidence.research[index]!.path] = json(item);
  for (const [index, item] of project.scans.entries()) files[evidence.scans[index]!.path] = json(item);
  files["evidence/index.json"] = json(evidence);
  const evidencePaths = new Map([...evidence.sources, ...evidence.research].map((item) => [item.id, item.path]));
  const features = project.epics.map((epic) => ({ id: epic.id, title: epic.title, archived: epic.archived,
    markdown: `${featurePath(epic.id)}.md`, data: `${featurePath(epic.id)}.json` }));
  const requirements = [title, ...interpretation(project), "## Features",
    "Load the relevant feature and Project-wide requirements first; follow evidence links only as needed.",
    "Implementation status: [progress.md](progress.md). Evidence directory: [index](evidence/index.json)."];
  for (const epic of project.epics) {
    const items = project.requirements.filter((item) => item.epicID === epic.id);
    const questions = project.questions.filter((item) => item.epicID === epic.id);
    const path = featurePath(epic.id);
    requirements.push(`- [${epic.title.replace(/[\[\]\\]/g, "\\$&")}](${path}.md)${epic.archived ? " (archived)" : ""} — ${items.length} requirements`);
    const dependencies = epic.dependencies.map((id) => `[${id}](../../${featurePath(id)}.md)`);
    files[`${path}.md`] = [`# ${epic.title}${epic.archived ? " (archived)" : ""}`, `Feature: ${epic.id}`, epic.purpose,
      "Generated by Reqwizit. Edit in the app. [Project overview](../../requirements.md); revision and hashes: ../../manifest.json.",
      `Dependencies: ${dependencies.join(", ") || "None recorded."}`,
      ...requirementMarkdown(items, (id) => evidencePaths.has(id) ? `[${id}](../../${evidencePaths.get(id)})` : id), ...questionMarkdown(questions)].join("\n\n") + "\n";
    files[`${path}.json`] = json({ formatVersion: 2, projectID: project.id, feature: epic, requirements: items, questions,
      evidenceIndex: "../../evidence/index.json" });
  }
  files["requirements.md"] = requirements.join("\n\n") + "\n";
  files["project.json"] = json({ formatVersion: 2, projectID: project.id, name: project.name,
    summary: project.summary, goals: project.goals, actors: project.actors, assumptions: project.assumptions,
    features, origin: project.origin, evidenceIndex: "evidence/index.json" });
  const delivery = execution?.version ? project.requirements.map((r) => {
    const unit = [...(execution.run?.units ?? []), ...execution.history.flatMap((h) => h.units)].find((u) => u.items.some((i) => i.requirementID === r.id));
    const item = unit?.items.find((i) => i.requirementID === r.id);
    const assessment = execution.assessments[r.id];
    const { model: _model, captureFingerprint: _cache, ...portableAssessment } = assessment ?? {};
    return { requirementID: r.id, implemented: deliveredRequirement(project, execution, r.id), assessment: assessment ? portableAssessment : null,
      execution: item?.status ?? "not-started", git: unit?.delivery ?? "none", commit: item?.commit ?? null, pr: unit?.pr ?? null, delivery: execution.delivered[r.id] ?? null };
  }) : undefined;
  files["progress.json"] = json({ formatVersion: 2, projectID: project.id, discovery: score, implementation: progress, ...(delivery ? { implementationDelivery: delivery } : {}) });
  files["progress.md"] = [title, `## Discovery\n\nEstimated definition coverage: ${score.percent}%${score.stale ? " (needs review)" : ""}. This is not proof of completeness.`,
      `Requirements: ${project.requirements.filter((r) => r.status === "accepted").length} accepted / ${project.requirements.length} total.`,
       ...(delivery ? ["## Implementation delivery\n\nImplemented means verified work delivered to main. Assessments are snapshot-based; refresh main to check newer changes.", ...delivery.map((item) => `- ${item.requirementID}: ${item.implemented ? "Implemented on main" : "Not delivered"} · execution ${item.execution} · Git ${item.git}${item.pr ? ` · ${item.pr}` : ""}`)] : []),
       "## Manual implementation assessments\n\nHistorical/user-supplied status; these assessments do not establish delivery to main.",
       ...progress.map((item) => {
         const requirement = project.requirements.find((entry) => entry.id === item.requirementID)!;
         return `### [${item.requirementID}](${featurePath(requirement.epicID)}.md) — ${item.status}${item.needsReview ? " · NEEDS REVIEW" : ""}\n\nRequirements review: ${item.reviewStatus}\n\nNotes: ${item.notes || "—"}\n\nVerification evidence: ${item.evidence || "—"}`;
       })].join("\n\n") + "\n";
  files["manifest.json"] = JSON.stringify({ formatVersion: 2, projectID: project.id, revision: project.revision,
    hashes: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])) }, null, 2) + "\n";
  return files;
}
export function checkWorkspace(workspace: Workspace, intendedNames: string[] = []) {
  const directory = managedDirectory(workspace.path);
  for (const name of new Set([...legacyArtifacts, ...Object.keys(workspace.hashes), ...Object.keys(workspace.pendingHashes), ...intendedNames])) {
    const content = readArtifact(directory, name);
    const digest = content === null ? null : hash(content);
    const previous = workspace.hashes[name]; const pending = workspace.pendingHashes[name];
    if (digest === null ? !!previous && !workspace.pendingRemovals?.includes(name) : digest !== previous && !pending?.includes(digest)) throw new Error(`Workspace conflict: ${name} was changed outside the app. Preserve your edits and restore the generated file, or connect a different folder.`);
  }
  return directory;
}
export function publishWorkspace(directory: string, files: Record<string, string>, removals: string[] = []) {
  mkdirSync(directory, { recursive: true });
  const write = (name: string) => {
    if (readArtifact(directory, name) === files[name]) return;
    const parent = dirname(join(directory, name));
    mkdirSync(parent, { recursive: true });
    const temporary = join(parent, `.reqwizit-${randomUUID()}.tmp`);
    try { writeFileSync(temporary, files[name]!, { flag: "wx" }); renameSync(temporary, join(directory, name)); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  };
  for (const name of Object.keys(files).filter((name) => name !== "manifest.json")) write(name);
  for (const name of removals) { if (readArtifact(directory, name) !== null) unlinkSync(join(directory, name)); }
  write("manifest.json");
}
