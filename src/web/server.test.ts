import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "../service/discovery.js";
import { analysisSchema } from "../core/model.js";

test("local API requires session authentication and same origin; stale writes return 409", async () => {
  const store = new ProjectStore(":memory:");
  const adapter: DiscoveryAdapter = { async analyze() { throw new Error("No inference in API contract test"); } };
  const app = await startApp({ store, adapter, port: 0 });
  const headers = { "X-Wizard-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  try {
    assert.equal((await fetch(`${app.origin}/api/projects`)).status, 403);
    // Undici normalizes Host to the URL; use a raw HTTP request to exercise rebinding protection.
    const invalidHostStatus = await new Promise<number>((accept, reject) => {
      const request = httpRequest(`${app.origin}/api/projects`, { headers: { ...headers, Host: "unrelated.example" } }, (response) => {
        response.resume(); accept(response.statusCode ?? 0);
      });
      request.once("error", reject); request.end();
    });
    assert.equal(invalidHostStatus, 403);
    assert.equal((await fetch(`${app.origin}/api/projects`, { headers: { ...headers, Origin: "https://unrelated.example" } })).status, 403);
    const response = await fetch(`${app.origin}/api/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Browser test", idea: "Track jobs", model: { providerID: "openai", modelID: "fixture" } }) });
    assert.equal(response.status, 201); const project = await response.json() as { id: string };
    const note = { revision: 1, text: "Owner only" };
    assert.equal((await fetch(`${app.origin}/api/projects/${project.id}/note`, { method: "POST", headers, body: JSON.stringify(note) })).status, 200);
    assert.equal((await fetch(`${app.origin}/api/projects/${project.id}/note`, { method: "POST", headers, body: JSON.stringify(note) })).status, 409);
    assert.equal(store.get(project.id).revision, 2);
  } finally { await app.close(); store.close(); }
});

test("browser job survives request completion, exposes progress, and applies a fixture round", async () => {
  const store = new ProjectStore(":memory:");
  const project = store.create("Browser", "A job app", { providerID: "openai", modelID: "fixture" });
  let release!: () => void;
  const waiting = new Promise<void>((accept) => { release = accept; });
  const adapter: DiscoveryAdapter = { async analyze(_project, options) {
    options.onProgress("Fixture discovery running"); await waiting;
    return analysisSchema.parse({ summary: "Job tracker", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
  } };
  const app = await startApp({ store, adapter, port: 0 });
  const headers = { "X-Wizard-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  try {
    const request = () => fetch(`${app.origin}/api/projects/${project.id}/analyze`, { method: "POST", headers, body: JSON.stringify({ revision: 1 }) });
    assert.equal((await request()).status, 202); assert.equal((await request()).status, 409);
    const snapshot = await (await fetch(`${app.origin}/api/projects/${project.id}`, { headers })).json() as { active: boolean; progress: string[] };
    assert.equal(snapshot.active, true); assert.ok(snapshot.progress.includes("Fixture discovery running"));
    release();
    for (let i = 0; i < 30 && store.get(project.id).revision === 1; i++) await new Promise((accept) => setTimeout(accept, 10));
    assert.equal(store.get(project.id).revision, 2);
    assert.ok(store.jobs(project.id)[0]!.context);
  } finally { release(); await app.close(); store.close(); }
});
