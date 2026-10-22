import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, renameSync, existsSync, symlinkSync, statSync, utimesSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import Database from "better-sqlite3";
import { ProjectStore } from "./store.js";
import { hash, renderWorkspace, renderCombinedSpecification, publishWorkspace, checkWorkspace, workspaceFolder } from "./workspace.js";
import { implementationNeedsReview } from "../core/implementation.js";
import { StaleRevisionError, type Project } from "../core/model.js";

const parent = join(process.cwd(), ".reqwizit-state", "tests");
mkdirSync(parent, { recursive: true });
const selection = { providerID: "openai", modelID: "fixture", connectionID: "private-account" } as const;
function fixture() {
  const directory = mkdtempSync(join(parent, "workspace-"));
  const database = join(directory, "projects.sqlite");
  const path = join(directory, "repo"); mkdirSync(path);
  const store = new ProjectStore(database);
  const project = store.create("Local app", "Track local jobs", selection);
  return { directory, database, path, store, project, cleanup: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
function generate(store: ProjectStore, project: Project) {
  const { job } = store.beginJob(project.id, project.revision);
  store.claimJob(job.id, Date.now() + 60_000);
  store.finishJob(job.id, { summary: "Track jobs", goals: ["Save work"], actors: ["Owner"], assumptions: [], questions: [], retireQuestions: [],
    requirements: [{ statement: "Save jobs locally", rationale: "Retain work", sourceIDs: [project.sources[0]!.id], acceptance: ["Saved jobs survive restart"] }] });
  return store.get(project.id);
}

test("workspace saves committed model and human revisions automatically and keeps account selection out of files", async () => {
  const f = fixture();
  try {
    assert.equal(f.store.connectWorkspace(f.project.id, 1, f.path).status, "saved");
    const project = generate(f.store, f.project);
    await setImmediate();
    const manifest = JSON.parse(readFileSync(join(f.path, workspaceFolder, "manifest.json"), "utf8"));
    assert.equal(manifest.revision, project.revision);
    assert.match(readFileSync(join(f.path, workspaceFolder, `features/${project.requirements[0]!.epicID}/requirements.md`), "utf8"), /Save jobs locally/);
    const data = Object.values(renderWorkspace(project)).join("\n");
    assert.ok(!data.includes("private-account"));
    const updated = f.store.note(project.id, project.revision, "  Original human text\n");
    await setImmediate();
    assert.equal(f.store.workspace(project.id)?.savedRevision, updated.revision);
    assert.equal(JSON.parse(readFileSync(join(f.path, workspaceFolder, `evidence/sources/${hash(updated.sources.at(-1)!.id)}.json`), "utf8")).text, "  Original human text\n");
    assert.throws(() => f.store.note(project.id, project.revision, "stale"), StaleRevisionError);
    assert.equal(f.store.workspace(project.id)?.savedRevision, updated.revision);
  } finally { f.cleanup(); }
});

test("external edits, deleted files, and output collisions are preserved; disconnect leaves files", () => {
  const f = fixture();
  try {
    f.store.connectWorkspace(f.project.id, 1, f.path);
    const file = join(f.path, workspaceFolder, "requirements.md"); const original = readFileSync(file, "utf8");
    writeFileSync(file, "Human edit");
    const updated = f.store.note(f.project.id, 1, "A new decision");
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "conflict");
    assert.equal(readFileSync(file, "utf8"), "Human edit");
    writeFileSync(file, original);
    assert.equal(f.store.syncWorkspace(f.project.id)?.savedRevision, updated.revision);
    rmSync(file);
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "conflict");
    writeFileSync(file, renderWorkspace(updated)["requirements.md"]!);
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "saved");
    const other = f.store.create("Other", "Other idea", selection);
    assert.throws(() => f.store.connectWorkspace(other.id, 1, f.path));
    assert.throws(() => f.store.disconnectWorkspace(f.project.id, 1), StaleRevisionError);
    f.store.disconnectWorkspace(f.project.id, updated.revision);
    assert.equal(f.store.workspace(f.project.id), null);
    assert.ok(existsSync(file));
    f.store.connectWorkspace(f.project.id, updated.revision, f.path);
    assert.equal(f.store.workspace(f.project.id)?.status, "saved");
    const collision = join(f.directory, "collision"); mkdirSync(join(collision, workspaceFolder), { recursive: true });
    writeFileSync(join(collision, workspaceFolder, "requirements.json"), "unrelated");
    assert.throws(() => f.store.connectWorkspace(f.project.id, updated.revision, collision), /conflict/);
    assert.equal(f.store.workspace(f.project.id)?.path, f.path);
  } finally { f.cleanup(); }
});

test("missing folders retain app revisions and can be reconnected after moving", () => {
  const f = fixture();
  try {
    f.store.connectWorkspace(f.project.id, 1, f.path);
    const moved = join(f.directory, "moved"); renameSync(f.path, moved);
    const updated = f.store.note(f.project.id, 1, "Keep this even when the folder is gone");
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "unavailable");
    assert.equal(f.store.get(f.project.id).revision, updated.revision);
    assert.equal(f.store.connectWorkspace(f.project.id, updated.revision, moved).status, "saved");
    assert.equal(JSON.parse(readFileSync(join(moved, workspaceFolder, "manifest.json"), "utf8")).revision, updated.revision);
  } finally { f.cleanup(); }
});

test("durable intended hashes recover partial publication on restart and a live writer lease is preserved", () => {
  const f = fixture();
  let reopened: ProjectStore | undefined;
  try {
    f.store.connectWorkspace(f.project.id, 1, f.path);
    const updated = f.store.note(f.project.id, 1, "Newest decision");
    const binding = f.store.workspace(f.project.id)!;
    const files = renderWorkspace(updated);
    // Simulate interruption after the journal commit and one rename, before manifest publication.
    binding.pendingHashes = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, [hash(content)]]));
    binding.status = "pending";
    const db = new Database(f.database);
    db.prepare("UPDATE workspaces SET payload = ?, dirty = 1, owner = 'other-worker', lease_until = ? WHERE project_id = ?").run(JSON.stringify(binding), Date.now() + 60_000, f.project.id);
    writeFileSync(join(f.path, workspaceFolder, "project.json"), files["project.json"]!);
    reopened = new ProjectStore(f.database);
    assert.equal(reopened.workspace(f.project.id)?.status, "pending");
    assert.throws(() => reopened!.disconnectWorkspace(f.project.id, updated.revision), /saving/);
    db.prepare("UPDATE workspaces SET lease_until = 0 WHERE project_id = ?").run(f.project.id); db.close();
    reopened.close(); reopened = new ProjectStore(f.database);
    assert.equal(reopened.workspace(f.project.id)?.status, "saved");
    assert.equal(reopened.workspace(f.project.id)?.savedRevision, updated.revision);
    for (const [name, content] of Object.entries(files)) assert.equal(readFileSync(join(f.path, workspaceFolder, name), "utf8"), content);
  } finally { reopened?.close(); f.cleanup(); }
});

test("implementation tracking validates statuses, evidence, stale revisions, and invalidates changed requirement reviews", () => {
  const f = fixture();
  try {
    const project = generate(f.store, f.project); const requirement = project.requirements[0]!;
    f.store.connectWorkspace(project.id, project.revision, f.path);
    assert.throws(() => f.store.setImplementation(project.id, project.revision, requirement.id, { status: "verified", notes: "", evidence: " " }), /evidence/);
    assert.throws(() => f.store.setImplementation(project.id, project.revision, "missing", { status: "blocked", notes: "", evidence: "" }), /not found/);
    assert.throws(() => f.store.setImplementation(project.id, project.revision, requirement.id, { status: "done", notes: "", evidence: "" }));
    const tracked = f.store.setImplementation(project.id, project.revision, requirement.id, { status: "verified", notes: "Built", evidence: "Restart persistence test passed" });
    assert.equal(implementationNeedsReview(tracked, tracked.implementation[0]!), false);
    assert.throws(() => f.store.setImplementation(project.id, project.revision, requirement.id, { status: "blocked", notes: "", evidence: "" }), StaleRevisionError);
    const changed = f.store.review(project.id, tracked.revision, requirement.id, "accepted", "Reviewed behavior");
    assert.equal(implementationNeedsReview(changed, changed.implementation[0]!), true);
    assert.equal(changed.implementation[0]!.evidence, "Restart persistence test passed");
    f.store.syncWorkspace(project.id);
    const progress = JSON.parse(readFileSync(join(f.path, workspaceFolder, "progress.json"), "utf8"));
    assert.equal(progress.implementation[0].needsReview, true);
    const revised = structuredClone(changed); revised.requirements[0]!.acceptance.push("Another scenario");
    assert.equal(implementationNeedsReview(revised, tracked.implementation[0]!), true);
    assert.equal(f.store.get(project.id, project.revision).implementation.length, 0);
  } finally { f.cleanup(); }
});

test("managed directory junctions/symlinks cannot redirect generated output", () => {
  const f = fixture();
  try {
    const outside = join(f.directory, "outside"); mkdirSync(outside);
    symlinkSync(outside, join(f.path, workspaceFolder), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => f.store.connectWorkspace(f.project.id, 1, f.path), /regular directory/);
    assert.equal(existsSync(join(outside, "requirements.md")), false);
  } finally { f.cleanup(); }
});

test("terminal workspace and implementation commands share browser-compatible storage without inference", () => {
  const f = fixture();
  const cli = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "src/terminal/cli.ts", ...args, "--data-dir", f.directory], { encoding: "utf8", timeout: 15000 });
  try {
    const project = generate(f.store, f.project);
    const connect = cli("workspace", "--project", project.id, "--operation", "connect", "--expected-revision", String(project.revision), "--path", f.path);
    assert.equal(connect.status, 0, connect.stderr);
    assert.equal(JSON.parse(connect.stdout).status, "saved");
    const exported = cli("export", "--project", project.id, "--json");
    assert.equal(exported.status, 0, exported.stderr);
    assert.equal(JSON.parse(exported.stdout).requirements[0].id, project.requirements[0]!.id);
    assert.ok(!exported.stdout.includes("private-account"));
    const historical = cli("export", "--project", project.id, "--revision", "1");
    assert.equal(historical.status, 0, historical.stderr);
    assert.match(historical.stdout, /Revision: 1/);
    assert.ok(!historical.stdout.includes("Save jobs locally"));
    const tracked = cli("implementation", "--project", project.id, "--expected-revision", String(project.revision), "--requirement", project.requirements[0]!.id, "--status", "verified", "--text", "CLI progress", "--evidence", "CLI acceptance checked", "--json");
    assert.equal(tracked.status, 0, tracked.stderr);
    assert.equal(JSON.parse(tracked.stdout).implementation[0].status, "verified");
    assert.equal(f.store.get(project.id).implementation[0]!.evidence, "CLI acceptance checked");
    assert.equal(JSON.parse(readFileSync(join(f.path, workspaceFolder, "progress.json"), "utf8")).implementation[0].status, "verified");
    const status = cli("workspace", "--project", project.id, "--operation", "status");
    assert.equal(status.status, 0, status.stderr); assert.equal(JSON.parse(status.stdout).savedRevision, project.revision + 1);
    writeFileSync(join(f.path, workspaceFolder, "progress.md"), "External progress notes");
    const conflict = cli("workspace", "--project", project.id, "--operation", "sync");
    assert.equal(conflict.status, 1); assert.equal(JSON.parse(conflict.stdout).status, "conflict");
    const disconnect = cli("workspace", "--project", project.id, "--operation", "disconnect", "--expected-revision", String(project.revision + 1));
    assert.equal(disconnect.status, 0, disconnect.stderr);
    assert.equal(f.store.workspace(project.id), null);
    assert.equal(readFileSync(join(f.path, workspaceFolder, "progress.md"), "utf8"), "External progress notes");
  } finally { f.cleanup(); }
});

test("feature exports retain shared evidence once, exact original inputs, and stable rename paths", () => {
  const f = fixture();
  try {
    const project = generate(f.store, f.project);
    project.epics.push({ id: "jobs", title: "Jobs", purpose: "Track jobs", dependencies: ["project"], archived: false });
    project.requirements.push({ ...project.requirements[0]!, id: "second", epicID: "jobs" });
    project.sources[0]!.text = "  Exact original\n" + "Captured code excerpt.\n".repeat(2000);
    const files = renderWorkspace(project);
    const index = JSON.parse(files["evidence/index.json"]!);
    const shared = index.sources[0];
    assert.equal(JSON.parse(files[shared.path]!).text, project.sources[0]!.text);
    assert.equal(Object.values(files).filter((content) => content.includes("Captured code excerpt.")).length, 1);
    assert.ok(!files["requirements.md"]!.includes("Save jobs locally"));
    assert.match(files["requirements.md"]!, /features\/jobs\/requirements.md/);
    assert.match(files["features/jobs/requirements.md"]!, /features\/project\/requirements.md/);
    assert.ok(files["features/jobs/requirements.md"]!.includes(`../../${shared.path}`));
    assert.equal(JSON.parse(files["features/jobs/requirements.json"]!).requirements[0].sourceIDs[0], shared.id);
    assert.equal(files["requirements.json"], undefined);
    assert.ok(!files["progress.json"]!.includes("Save jobs locally"));
    project.epics.at(-1)!.title = "Job management";
    const renamed = renderWorkspace(project);
    assert.deepEqual(Object.keys(renamed).sort(), Object.keys(files).sort());
    assert.equal(renamed[shared.path], files[shared.path]);
    assert.equal(JSON.parse(renderCombinedSpecification(project).json).sources[0].text, project.sources[0]!.text);
  } finally { f.cleanup(); }
});

test("implementation-only saves leave specification and evidence bytes and timestamps unchanged", () => {
  const f = fixture();
  try {
    const project = generate(f.store, f.project);
    f.store.connectWorkspace(project.id, project.revision, f.path);
    const before = renderWorkspace(project);
    const fixedTime = new Date("2020-01-01T00:00:00Z");
    for (const name of Object.keys(before)) utimesSync(join(f.path, workspaceFolder, name), fixedTime, fixedTime);
    const updated = f.store.setImplementation(project.id, project.revision, project.requirements[0]!.id, { status: "in-progress", notes: "Building", evidence: "" });
    assert.equal(f.store.syncWorkspace(project.id)?.status, "saved");
    const after = renderWorkspace(updated);
    for (const [name, content] of Object.entries(before)) {
      if (["progress.md", "progress.json", "manifest.json", "state.json", "continuation.json"].includes(name)) continue;
      assert.equal(after[name], content, name);
      assert.equal(statSync(join(f.path, workspaceFolder, name)).mtimeMs, fixedTime.getTime(), name);
    }
    assert.equal(JSON.parse(after["manifest.json"]!).revision, updated.revision);
  } finally { f.cleanup(); }
});

test("feature merges preserve requirement IDs and evidence while exporting the archived area", () => {
  const f = fixture();
  try {
    let project = generate(f.store, f.project);
    const requirement = project.requirements[0]!;
    project = f.store.organize(project.id, project.revision, [
      { type: "upsert", epicID: "jobs", title: "Jobs", purpose: "Track jobs", dependencies: [] },
      { type: "upsert", epicID: "reports", title: "Reports", purpose: "View jobs", dependencies: [] },
      { type: "move", recordID: requirement.id, epicID: "reports" },
    ]);
    f.store.connectWorkspace(project.id, project.revision, f.path);
    project = f.store.organize(project.id, project.revision, [{ type: "merge", epicIDs: ["jobs", "reports"], targetEpicID: "jobs", reason: "One workflow" }]);
    assert.equal(f.store.syncWorkspace(project.id)?.status, "saved");
    const directory = join(f.path, workspaceFolder);
    const jobs = JSON.parse(readFileSync(join(directory, "features/jobs/requirements.json"), "utf8"));
    const reports = JSON.parse(readFileSync(join(directory, "features/reports/requirements.json"), "utf8"));
    assert.equal(jobs.requirements[0].id, requirement.id);
    assert.deepEqual(jobs.requirements[0].sourceIDs, requirement.sourceIDs);
    assert.equal(reports.feature.archived, true);
    assert.deepEqual(reports.requirements, []);
  } finally { f.cleanup(); }
});

function legacyWorkspace(project: Project) {
  const combined = renderCombinedSpecification(project);
  const files: Record<string, string> = { "requirements.md": combined.markdown, "requirements.json": combined.json, "progress.md": "Old progress\n", "progress.json": "{}\n" };
  files["manifest.json"] = JSON.stringify({ formatVersion: 1, projectID: project.id, revision: project.revision,
    hashes: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])) });
  return files;
}

test("version 1 folders migrate at the same revision and preserve edits before removing legacy output", () => {
  const f = fixture();
  try {
    const legacy = legacyWorkspace(f.project);
    const directory = join(f.path, workspaceFolder);
    publishWorkspace(directory, legacy);
    writeFileSync(join(directory, "requirements.json"), "External edit");
    assert.throws(() => f.store.connectWorkspace(f.project.id, 1, f.path), /changed outside/);
    assert.equal(readFileSync(join(directory, "requirements.json"), "utf8"), "External edit");
    writeFileSync(join(directory, "requirements.json"), legacy["requirements.json"]!);
    writeFileSync(join(directory, "personal-notes.md"), "Keep me");
    assert.equal(f.store.connectWorkspace(f.project.id, 1, f.path).status, "saved");
    assert.equal(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")).formatVersion, 3);
    assert.equal(f.store.get(f.project.id).revision, 1);
    assert.equal(existsSync(join(directory, "requirements.json")), false);
    assert.equal(readFileSync(join(directory, "personal-notes.md"), "utf8"), "Keep me");
    f.store.disconnectWorkspace(f.project.id, 1);
    assert.equal(f.store.connectWorkspace(f.project.id, 1, f.path).status, "saved");
  } finally { f.cleanup(); }
});

test("interrupted legacy removal recovers from the durable journal on restart", () => {
  const f = fixture();
  let reopened: ProjectStore | undefined;
  try {
    const directory = join(f.path, workspaceFolder);
    f.store.connectWorkspace(f.project.id, 1, f.path);
    const legacy = legacyWorkspace(f.project);
    const files = renderWorkspace(f.project);
    // Recreate a legacy binding interrupted after the old JSON was removed, before manifest publication.
    publishWorkspace(directory, legacy);
    const binding = f.store.workspace(f.project.id)!;
    binding.hashes = Object.fromEntries(Object.entries(legacy).map(([name, content]) => [name, hash(content)]));
    binding.pendingHashes = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, [hash(content)]]));
    binding.pendingRemovals = ["requirements.json"]; binding.formatVersion = 1; binding.status = "pending";
    rmSync(join(directory, "requirements.json"));
    const db = new Database(f.database);
    db.prepare("UPDATE workspaces SET payload = ?, dirty = 1 WHERE project_id = ?").run(JSON.stringify(binding), f.project.id);
    db.close();
    reopened = new ProjectStore(f.database);
    assert.equal(reopened.workspace(f.project.id)?.status, "saved");
    for (const [name, content] of Object.entries(files)) assert.equal(readFileSync(join(directory, name), "utf8"), content);
    assert.equal(existsSync(join(directory, "requirements.json")), false);
  } finally { reopened?.close(); f.cleanup(); }
});

test("feature moves and removal retire only owned files and detect edits to retired outputs", () => {
  const f = fixture();
  try {
    const project = generate(f.store, f.project);
    project.epics.push({ id: "jobs", title: "Jobs", purpose: "Track jobs", dependencies: [], archived: false });
    project.requirements[0]!.epicID = "jobs";
    const before = renderWorkspace(project);
    publishWorkspace(join(f.path, workspaceFolder), before);
    const binding = { path: f.path, status: "saved" as const, savedRevision: project.revision, diagnostic: null,
      hashes: Object.fromEntries(Object.entries(before).map(([name, content]) => [name, hash(content)])), pendingHashes: {} };
    const retired = join(f.path, workspaceFolder, "features/jobs/requirements.md");
    const original = readFileSync(retired, "utf8");
    writeFileSync(retired, "User edits");
    writeFileSync(join(f.path, workspaceFolder, "features/jobs/notes.md"), "Keep notes");
    project.requirements[0]!.epicID = "project";
    project.epics = project.epics.filter((epic) => epic.id !== "jobs");
    const after = renderWorkspace(project);
    assert.throws(() => checkWorkspace(binding, Object.keys(after)), /changed outside/);
    assert.equal(readFileSync(retired, "utf8"), "User edits");
    writeFileSync(retired, original);
    const directory = checkWorkspace(binding, Object.keys(after));
    publishWorkspace(directory, after, Object.keys(before).filter((name) => !(name in after)));
    assert.equal(existsSync(retired), false);
    assert.equal(readFileSync(join(f.path, workspaceFolder, "features/jobs/notes.md"), "utf8"), "Keep notes");
    const moved = JSON.parse(readFileSync(join(f.path, workspaceFolder, "features/project/requirements.json"), "utf8"));
    assert.equal(moved.requirements[0].id, project.requirements[0]!.id);
  } finally { f.cleanup(); }
});

test("nested collisions, directory links, and unsafe manifest paths cannot overwrite unrelated files", () => {
  const f = fixture();
  try {
    const directory = join(f.path, workspaceFolder);
    mkdirSync(join(directory, "features/project"), { recursive: true });
    const collision = join(directory, "features/project/requirements.md");
    writeFileSync(collision, "Unrelated file");
    assert.equal(f.store.connectWorkspace(f.project.id, 1, f.path).status, "conflict");
    assert.equal(readFileSync(collision, "utf8"), "Unrelated file");
    rmSync(join(directory, "features"), { recursive: true });
    const outside = join(f.directory, "outside"); mkdirSync(outside);
    symlinkSync(outside, join(directory, "features"), process.platform === "win32" ? "junction" : "dir");
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "conflict");
    assert.equal(existsSync(join(outside, "project")), false);
    const binding = f.store.workspace(f.project.id)!;
    binding.hashes["../outside.txt"] = hash("Keep");
    assert.throws(() => checkWorkspace(binding), /invalid managed artifact path/);
    const project = structuredClone(f.project);
    project.epics[0]!.id = "../../escape";
    project.epics.push({ id: "INBOX", title: "Distinct case", purpose: "Distinct identity", archived: false, dependencies: [] });
    const files = renderWorkspace(project);
    assert.ok(Object.keys(files).some((name) => /^features\/~[a-f0-9]{64}\//.test(name)));
    for (const name of Object.keys(files)) assert.ok(!name.includes(".."));
    assert.equal(new Set(Object.keys(files).map((name) => name.toLowerCase())).size, Object.keys(files).length);
  } finally { f.cleanup(); }
});
