import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { previewFolder } from "./folder-preview.js";
import { ProjectStore } from "./store.js";
import { startApp } from "../web/server.js";
import type { Project } from "../core/model.js";

test("local preview prefers Godot metadata and vision prose; suggestions are fingerprinted and editable without inference", async () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-preview-"));
  try {
    mkdirSync(join(directory, "docs"));
    writeFileSync(join(directory, "project.godot"), '[application]\nconfig/name="Rust Grind Galaxy"\nconfig/features=PackedStringArray("4.6", "C#")\n');
    writeFileSync(join(directory, "docs/GAME_VISION.md"), "# Game Vision\n\nA 2D sci-fi platformer built in Godot with C#.\n\nCurrent implementation target:\n- one level");
    const preview = await previewFolder(directory);
    assert.equal(preview.name, "Rust Grind Galaxy"); assert.equal(preview.projectType, "Godot / C# game");
    assert.equal(preview.description, "A 2D sci-fi platformer built in Godot with C#.");
    assert.ok(preview.evidence.some((e) => e.path === "docs/GAME_VISION.md"));
    assert.deepEqual(await previewFolder(directory), preview);
    writeFileSync(join(directory, "docs/GAME_VISION.md"), "# Game Vision\n\nUpdated project description from the actual source documents.");
    assert.notEqual((await previewFolder(directory)).fingerprint, preview.fingerprint);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("preview supports package metadata, malformed/absent metadata fallback, and rejects linked documents and secret content", async () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-preview-fallback-"));
  const outside = mkdtempSync(join(tmpdir(), "reqwizit-preview-outside-"));
  try {
    let preview = await previewFolder(directory);
    assert.equal(preview.name, basename(directory)); assert.equal(preview.description, "");
    writeFileSync(join(directory, "package.json"), '{"name":"sample","description":"Package overview"}');
    preview = await previewFolder(directory); assert.equal(preview.name, "sample"); assert.equal(preview.description, "Package overview");
    writeFileSync(join(directory, "package.json"), "not json");
    writeFileSync(join(outside, "GAME_VISION.md"), "Secret external description that must not be followed.");
    symlinkSync(outside, join(directory, "docs"), process.platform === "win32" ? "junction" : "dir");
    writeFileSync(join(directory, "README.md"), '# Heading\n\napi_key="some-sensitive-value-123456789"');
    preview = await previewFolder(directory);
    assert.equal(preview.description, ""); assert.equal(preview.name, basename(directory));
    assert.ok(!JSON.stringify(preview).includes("some-sensitive"));
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test("authenticated preview/create binds folder fingerprint, preserves suggested provenance and starts only initialization", async () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-preview-api-"));
  writeFileSync(join(directory, "package.json"), '{"name":"actual-app","description":"Existing app description from package metadata."}');
  const store = new ProjectStore(":memory:"); let scanCalls = 0;
  const app = await startApp({ store, port: 0, adapter: { async analyze(_project, options) {
    assert.equal(options.scan, true); scanCalls++;
    return { summary: "Actual existing app", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [] };
  } } });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (path: string, body: unknown) => fetch(`${app.origin}/api/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${app.origin}/api/folder-preview`, { method: "POST", body: "{}" })).status, 403);
    assert.equal((await post("folder-preview", { path: "relative" })).status, 400);
    const preview = await (await post("folder-preview", { path: directory })).json() as Awaited<ReturnType<typeof previewFolder>>;
    assert.equal(scanCalls, 0); assert.equal(store.list().length, 0);
    const input = { name: preview.name, idea: preview.description, model: { providerID: "openai", modelID: "fixture" }, entryMode: "existing", workspace: { path: directory }, previewFingerprint: preview.fingerprint };
    assert.equal((await post("projects", { ...input, previewFingerprint: "0".repeat(64) })).status, 400);
    assert.equal(store.list().length, 0);
    const response = await post("projects", input); assert.equal(response.status, 201);
    const project = await response.json() as Project;
    assert.equal(project.origin?.descriptionEdited, false); assert.equal(project.sources[0]!.kind, "workspace");
    for (let i = 0; i < 100 && !store.get(project.id).scans.length; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(scanCalls, 1); assert.equal(store.get(project.id).scans.length, 1); assert.equal(store.get(project.id).questions.length, 0);
    const origin = { mode: "existing" as const, preview, nameEdited: true, descriptionEdited: true };
    const edited = store.create("My name", "My exact human description", input.model as Project["model"], origin);
    assert.equal(edited.sources[0]!.kind, "initial"); assert.equal(edited.sources[0]!.text, "My exact human description");
    assert.deepEqual(edited.origin!.preview, preview);
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
