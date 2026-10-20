import assert from "node:assert/strict";
import test from "node:test";
import { projectSchema, reviewFingerprint, type Project, type Submission } from "../core/model.js";
import { ReviewQueue, reviewItems } from "./review.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function fixture(): Project {
  const project = projectSchema.parse({ id: "project", name: "Game", revision: 1, model: { providerID: "openai", modelID: "fixture" },
    sources: [{ id: "idea", kind: "initial", text: "A game" }], questions: [], summary: "Game", goals: [], actors: [], assumptions: [],
    requirements: ["jump", "aim", "pause"].map((id, index) => ({ id, statement: `Behavior ${id}`, rationale: "Gameplay", sourceIDs: ["idea"], epicID: "inbox", acceptance: ["Observable outcome"], status: index ? "proposed" : "accepted" })),
  });
  project.refinements = project.requirements.slice(0, 2).map((r) => ({ id: `cleanup-${r.id}`, requirementID: r.id, original: structuredClone(r),
    fingerprint: reviewFingerprint(r), status: "pending", statement: `Refined ${r.id}`, rationale: "Observable behavior", acceptance: ["Behavior is preserved"], reason: "Abstracted code", createdAtRevision: 1 }));
  return project;
}

test("Review uses Refine as the single duplicate/conflict workflow without running it on render", () => {
  const p = fixture(), before = structuredClone(p);
  let calls = 0;
  const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [], epicID: "all", sending: [], disabled: false,
    refine: () => { calls++; }, submit: async () => true, reviewRefinement: async () => true }));
  assert.match(html, /Refine requirements/);
  assert.match(html, /possible duplicates\/conflicts/);
  assert.ok(!html.includes("Check approved requirements for duplicates and conflicts"));
  assert.ok(!html.includes("Approved requirement audit"));
  assert.equal(calls, 0);
  assert.deepEqual(p, before);
});

test("unified review includes approved-target refinements without duplicating their pending original and restores the original after dismissal", () => {
  const p = fixture();
  assert.deepEqual(reviewItems(p, [], "pending").map((item) => item.id), ["requirement:pause", "refinement:cleanup-jump", "refinement:cleanup-aim"]);
  assert.equal(p.requirements[0]!.status, "accepted");
  assert.equal(reviewItems(p, [], "refinements").length, 2);
  assert.equal(reviewItems(p, [], "pending", "project").length, 0);
  p.refinements[1]!.status = "dismissed";
  assert.ok(reviewItems(p, [], "pending").some((item) => item.id === "requirement:aim"));
  p.refinements[0]!.status = "accepted";
  assert.equal(reviewItems(p, [], "refinements").length, 0);
  assert.deepEqual(reviewItems(p, [], "reviewed").filter((item) => item.kind === "refinement").map((item) => item.refinement.status), ["accepted", "dismissed"]);
});

test("stale cleanup does not hide changed requirements or pending review submissions", () => {
  const p = fixture();
  p.requirements[1]!.statement = "Changed aim behavior";
  assert.ok(reviewItems(p, [], "pending").some((item) => item.id === "requirement:aim"));
  const waiting: Submission = { id: "submission", projectID: p.id, status: "queued", applied: false, auto: false, research: false, submittedAt: "2026-01-01", input: {
    type: "review", requirementID: "aim", requirementText: p.requirements[1]!.statement, fingerprint: reviewFingerprint(p.requirements[1]!), action: "accepted", note: "",
  } };
  assert.ok(!reviewItems(p, [waiting], "pending").some((item) => item.id === "requirement:aim"));
  assert.ok(reviewItems(p, [waiting], "pending").some((item) => item.id === "refinement:cleanup-aim"));
  assert.equal(reviewItems(p, [waiting], "submitted").length, 0, "submitted records use their separate durable submission list");
});
