import assert from "node:assert/strict";
import test from "node:test";
import { definitionStopSummary, issueSummary, statusLabel } from "./user-messages.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiagnosticNotice } from "./diagnostic-notice.js";
import { discoveryPrompt, plainLanguagePolicy, questionHelpPrompt, scanPrompt } from "../runtime/discovery.js";
import { projectSchema } from "../core/model.js";
import { buildContext } from "../core/context.js";

test("known connection and validation issues give practical guidance", () => {
  assert.match(issueSummary("Failed to fetch"), /still running/);
  assert.match(issueSummary("Invalid request fields."), /Check what you entered/);
  assert.match(issueSummary("Invalid local app session. Reload this app's page."), /Reload/);
  assert.match(issueSummary("Project changed. Refresh it before retrying; no newer decisions were overwritten."), /Review the latest information/);
});

test("unknown and historical diagnostics never imply saved work or a safe retry", () => {
  for (const detail of ["lease expired at revision 4", "checkpoint failed", "", "Failed to fetch: saved successfully", "toString", "__proto__"]) {
    assert.equal(issueSummary(detail), "The app couldn’t finish this step.");
  }
  assert.equal(issueSummary("old diagnostic", "This review couldn’t finish."), "This review couldn’t finish.");
});

test("status labels preserve distinct outcomes without exposing internal enum spelling", () => {
  assert.equal(statusLabel("failed"), "Couldn’t finish");
  assert.equal(statusLabel("stale"), "Information changed");
  assert.notEqual(statusLabel("cancelled"), statusLabel("completed"));
  assert.equal(statusLabel("future-state"), "future state");
});

test("recorded interruption causes remain specific without guessing historical reasons", () => {
  assert.match(definitionStopSummary("refresh-time-limit"), /shared time limit across all areas/);
  assert.match(definitionStopSummary("request-time-limit"), /AI took too long/);
  assert.match(definitionStopSummary("user-stop"), /You stopped/);
  assert.match(definitionStopSummary("shutdown"), /Closing the app/);
  assert.match(definitionStopSummary("external-cancel"), /no specific reason/);
});

test("diagnostics link to the consolidated logs without exposing raw detail inline", () => {
  const detail = "Old checkpoint <script> & revision 4\nOriginal diagnostic";
  const html = renderToStaticMarkup(createElement(DiagnosticNotice, { detail, summary: "The review needs attention.", next: "Open the affected item.", alert: true }));
  assert.match(html, /role="alert"/);
  assert.match(html, /The review needs attention\. Open the affected item\./);
  assert.match(html, />View logs<\/button>/);
  assert.ok(!html.includes("Old checkpoint"));
  assert.ok(!html.includes("<details>"));
  assert.equal(renderToStaticMarkup(createElement(DiagnosticNotice, {})), "");
});

test("future discovery, scan and help prose share the plain-language policy without modifying saved input", () => {
  const project = projectSchema.parse({ id: "language", name: "Language", revision: 1, model: { providerID: "openai", modelID: "fixture" },
    summary: "Language", goals: [], actors: [], assumptions: [], requirements: [],
    sources: [{ id: "idea", kind: "initial", text: "Keep exact technical rule: 250 ms." }],
    questions: [{ id: "question", text: "Who can edit?", whyItMatters: "Protect access", status: "pending", options: [{ label: "Owner", consequence: "Only the owner" }, { label: "Everyone", consequence: "Anyone" }] }],
  });
  const before = structuredClone(project);
  const context = buildContext(project);
  assert.ok(discoveryPrompt(project, context, false).includes(plainLanguagePolicy));
  assert.ok(questionHelpPrompt(project, { questionID: "question", action: "rephrase" }, context).includes(plainLanguagePolicy));
  assert.ok(scanPrompt(project, { ...context, data: { capturedFiles: [project.sources[0]!] } }).includes(plainLanguagePolicy));
  assert.deepEqual(project, before);
});
