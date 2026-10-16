import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, renameSync, existsSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import Database from "better-sqlite3";
import { ProjectStore } from "./store.js";
import { hash, renderWorkspace, workspaceFolder } from "./workspace.js";
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
    assert.match(readFileSync(join(f.path, workspaceFolder, "requirements.md"), "utf8"), /Save jobs locally/);
    const data = readFileSync(join(f.path, workspaceFolder, "requirements.json"), "utf8");
    assert.ok(!data.includes("private-account"));
    const updated = f.store.note(project.id, project.revision, "  Original human text\n");
    await setImmediate();
    assert.equal(f.store.workspace(project.id)?.savedRevision, updated.revision);
    assert.equal(JSON.parse(readFileSync(join(f.path, workspaceFolder, "requirements.json"), "utf8")).sources.at(-1).text, "  Original human text\n");
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
    writeFileSync(join(f.path, workspaceFolder, "requirements.json"), files["requirements.json"]!);
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
