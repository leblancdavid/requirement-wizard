import assert from "node:assert/strict";
import test from "node:test";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema, projectSchema, type Project } from "./model.js";
import { coverage } from "./coverage.js";
import { dimensions } from "./epics.js";
import { buildContext } from "./context.js";

function fixture(store: ProjectStore) { return store.create("Jobs", "A single owner needs to track jobs on one computer.", { providerID: "openai", modelID: "fixture" }); }
function round(store: ProjectStore, project: Project, extra: Record<string, unknown> = {}) {
  const result = analysisSchema.parse({ summary: "Job management", goals: ["Track jobs"], actors: ["Owner"], assumptions: [],
    questions: [], requirements: [], retireQuestions: [], ...extra });
  const { job } = store.beginJob(project.id, project.revision); store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, result); return store.get(project.id);
}
const epic = (id: string, title = "Jobs") => ({ type: "upsert", epicID: id, title, purpose: `Define ${title}`, dependencies: [] });
const question = (epicID: string, localID = "new:q") => ({ localID, epicID, text: "Who uses this?", whyItMatters: "Permissions", options: [{ label: "Owner", consequence: "Single account" }, { label: "Team", consequence: "Shared access" }] });

test("legacy project records gain project/inbox epics without losing IDs or sources", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = fixture(store);
    const legacy = { ...project, epics: undefined, assessments: undefined, organizationReviews: undefined, research: undefined };
    const parsed = projectSchema.parse(legacy);
    assert.deepEqual(parsed.epics.map((item) => item.id), ["project", "inbox"]);
    assert.deepEqual(parsed.sources, project.sources); assert.equal(parsed.id, project.id);
  } finally { store.close(); }
});

test("AI creates epic aliases and assigns questions and requirements atomically", () => {
  const store = new ProjectStore(":memory:");
  try {
    const initial = fixture(store);
    const project = round(store, initial, { organization: [epic("new:jobs")], questions: [question("new:jobs")],
      requirements: [{ localID: "new:r", epicID: "new:jobs", statement: "Save jobs", rationale: "Track work", sourceIDs: [initial.sources[0]!.id], acceptance: ["A saved job survives restart"] }] });
    const jobs = project.epics.find((item) => item.title === "Jobs")!;
    assert.equal(project.questions[0]!.epicID, jobs.id); assert.equal(project.requirements[0]!.epicID, jobs.id);
    assert.equal(project.requirements[0]!.status, "proposed"); assert.ok(!jobs.id.startsWith("new:"));
    assert.ok(project.roundChanges.some((item) => item.includes("Created")));
  } finally { store.close(); }
});

test("reorganizing confirmed material needs review and stale organization cannot be approved", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = round(store, fixture(store), { questions: [question("inbox")] });
    project = store.answer(project.id, project.revision, project.questions[0]!.id, { kind: "answer", text: "Owner" });
    project = round(store, project, { organization: [epic("new:jobs"), { type: "move", recordID: project.questions[0]!.id, epicID: "new:jobs" }] });
    assert.equal(project.questions[0]!.epicID, "inbox");
    const review = project.organizationReviews[0]!; assert.equal(review.status, "pending");
    project = store.reviewOrganization(project.id, project.revision, review.id, true);
    assert.notEqual(project.questions[0]!.epicID, "inbox");
    project = round(store, project, { organization: [{ type: "move", recordID: project.questions[0]!.id, epicID: "project" }] });
    const nextReview = project.organizationReviews.at(-1)!;
    project = store.note(project.id, project.revision, "A new constraint");
    assert.throws(() => store.reviewOrganization(project.id, project.revision, nextReview.id, true), /outdated/);
  } finally { store.close(); }
});

test("split and merge preserve record identities and invalidate inherited assessments", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = round(store, fixture(store), { organization: [epic("new:jobs")], questions: [question("new:jobs")] });
    const source = project.questions[0]!.epicID; const recordID = project.questions[0]!.id;
    const before = project.revision;
    assert.throws(() => store.organize(project.id, project.revision, [
      { type: "upsert", epicID: "a", title: "A", purpose: "A", dependencies: [] },
      { type: "upsert", epicID: "b", title: "B", purpose: "B", dependencies: [] },
      { type: "split", epicID: source, destinations: [{ epicID: "a", recordIDs: [] }, { epicID: "b", recordIDs: [] }], reason: "Incomplete allocation" },
    ]), /leave source records/);
    assert.deepEqual(store.get(project.id), project);
    project = store.organize(project.id, project.revision, [
      { type: "upsert", epicID: "a", title: "Jobs", purpose: "Job lifecycle", dependencies: [] },
      { type: "upsert", epicID: "b", title: "Access", purpose: "Access control", dependencies: [] },
      { type: "split", epicID: source, destinations: [{ epicID: "a", recordIDs: [] }, { epicID: "b", recordIDs: [recordID] }], reason: "Separate access concerns" },
    ]);
    assert.equal(project.questions[0]!.id, recordID); assert.equal(project.questions[0]!.epicID, "b");
    assert.equal(project.epics.find((item) => item.id === source)!.archived, true);
    assert.equal(coverage(project).epics.find((item) => item.epicID === "b")!.percent, 0);
    project = store.organize(project.id, project.revision, [{ type: "merge", epicIDs: ["a", "b"], targetEpicID: "a", reason: "Keep together" }]);
    assert.equal(project.questions[0]!.epicID, "a"); assert.equal(project.questions[0]!.id, recordID);
    project = store.answer(project.id, project.revision, recordID, { kind: "answer", text: "Owner only" });
    project = store.restoreOrganization(project.id, project.revision, before);
    assert.equal(project.questions[0]!.epicID, source); assert.equal(project.questions[0]!.id, recordID);
    assert.equal(project.questions[0]!.status, "answered"); assert.equal(project.sources.at(-1)!.text, "Owner only");
  } finally { store.close(); }
});

test("invalid split or dependency cycle leaves the entire revision unchanged", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = fixture(store);
    assert.throws(() => store.organize(project.id, 1, [{ type: "upsert", epicID: "a", title: "A", purpose: "A", dependencies: ["b"] }, { type: "upsert", epicID: "b", title: "B", purpose: "B", dependencies: ["a"] }]), /cycle/);
    assert.deepEqual(store.get(project.id), project);
  } finally { store.close(); }
});

test("coverage is deterministic, evidence-gated, and missing dimensions never disappear from the denominator", () => {
  const store = new ProjectStore(":memory:");
  try {
    const initial = fixture(store);
    const project = round(store, initial, {
      requirements: [{ localID: "new:r", statement: "Save jobs", rationale: "Track work", sourceIDs: [initial.sources[0]!.id], acceptance: ["Reload a saved job"] }],
      assessments: [{ epicID: "inbox", confidence: "medium", explanation: "Only persistence is understood", checks: [{ dimension: "data", importance: "important", status: "defined", explanation: "Persistence proposed", evidenceIDs: ["new:r"] }] }],
    });
    let score = coverage(project).epics.find((item) => item.epicID === "inbox")!;
    assert.equal(score.checks.length, 9); assert.equal(score.checks.find((item) => item.dimension === "data")!.status, "partial");
    assert.equal(score.percent, 6);
    const accepted = store.review(project.id, project.revision, project.requirements[0]!.id, "accepted", "Required");
    score = coverage(accepted).epics.find((item) => item.epicID === "inbox")!;
    assert.equal(score.percent, 11); assert.equal(score.stale, true);
  } finally { store.close(); }
});

test("newly discovered scope can lower project coverage and unconfirmed N/A cannot hide gaps", () => {
  const store = new ProjectStore(":memory:");
  try {
    const initial = fixture(store);
    let project = round(store, initial, { assessments: [{ epicID: "project", confidence: "medium", explanation: "Initial scope", checks: dimensions.map((dimension) => ({ dimension, status: "defined", importance: "important", evidenceIDs: [initial.sources[0]!.id], explanation: "Explicit original constraints" })) }] });
    assert.equal(coverage(project).percent, 100);
    project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "newarea", title: "Unknown area", purpose: "Needs discovery", dependencies: [] }]);
    assert.equal(coverage(project).percent, 50);
    project = round(store, project, { assessments: [{ epicID: "newarea", confidence: "low", explanation: "Not enough evidence", checks: [{ dimension: "permissions", status: "not-applicable", importance: "critical", evidenceIDs: [], explanation: "AI guess" }] }] });
    const area = coverage(project).epics.find((item) => item.epicID === "newarea")!;
    assert.equal(area.checks.find((item) => item.dimension === "permissions")!.status, "unknown"); assert.equal(area.percent, 0); assert.equal(area.criticalGaps, 1);
  } finally { store.close(); }
});

test("context contains exact human evidence and dependencies, records omissions, and refuses oversize calls", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = round(store, fixture(store), { organization: [epic("new:jobs"), epic("new:other", "Other")], questions: [question("new:jobs")] });
    const jobs = project.epics.find((item) => item.title === "Jobs")!; const other = project.epics.find((item) => item.title === "Other")!;
    project = store.note(project.id, project.revision, "  Exact other-epic detail\n", other.id);
    const noteID = project.sources.at(-1)!.id;
    assert.ok(buildContext(project, jobs.id).manifest.omittedIDs.includes(noteID));
    project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: jobs.id, title: jobs.title, purpose: jobs.purpose, dependencies: [other.id] }]);
    const pack = buildContext(project, jobs.id);
    assert.ok(JSON.stringify(pack.data).includes(other.id)); assert.ok(pack.manifest.includedIDs.includes(project.sources[0]!.id));
    assert.ok(pack.manifest.includedIDs.includes(noteID)); assert.ok(JSON.stringify(pack.data).includes("  Exact other-epic detail\\n"));
    assert.equal(pack.manifest.revision, project.revision);
    assert.throws(() => buildContext(project, jobs.id, 100), /budget/);
    assert.throws(() => buildContext(project, "missing"), /does not exist/);
  } finally { store.close(); }
});

test("fabricated research citations and nonexistent assessment evidence are rejected atomically", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = fixture(store);
    assert.throws(() => round(store, project, { researchFindings: [{ url: "https://example.com/", title: "Unretrieved", finding: "Invented", epicID: "project" }] }), /not observed/);
    assert.throws(() => round(store, project, { assessments: [{ epicID: "project", confidence: "high", explanation: "Claim", checks: [{ dimension: "purpose", importance: "critical", status: "defined", evidenceIDs: ["invented"], explanation: "Claim" }] }] }), /missing evidence/);
    assert.deepEqual(store.get(project.id), project);
  } finally { store.close(); }
});

test("verified research is saved with retrieval provenance but cannot authorize a product preference", () => {
  const store = new ProjectStore(":memory:");
  try {
    const initial = fixture(store);
    const { job } = store.beginJob(initial.id, initial.revision); store.claimJob(job.id, Date.now() + 60000);
    store.attachResearch(job.id, [{ url: "https://example.com/spec", excerpt: "A documented format rule", kind: "fetched-page", retrievedAt: "2026-10-15T00:00:00Z" }]);
    store.finishJob(job.id, analysisSchema.parse({ summary: "Job app", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
      researchFindings: [{ localID: "new:source", epicID: "project", url: "https://example.com/spec", title: "Specification", finding: "A format rule, not a preference" }],
      assessments: [{ epicID: "project", confidence: "low", explanation: "Research only", checks: [{ dimension: "rules", importance: "important", status: "defined", explanation: "Needs a product choice", evidenceIDs: ["new:source"] }] }],
    }));
    const project = store.get(initial.id);
    assert.equal(project.research[0]!.kind, "fetched-page");
    assert.equal(coverage(project).epics.find((item) => item.epicID === "project")!.checks.find((item) => item.dimension === "rules")!.status, "partial");
  } finally { store.close(); }
});

test("an assessment referring to a question detects later answer changes", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = round(store, fixture(store), { questions: [question("project")] });
    const id = project.questions[0]!.id;
    project = store.answer(project.id, project.revision, id, { kind: "answer", text: "Owner" });
    project = round(store, project, { assessments: [{ epicID: "project", confidence: "high", explanation: "Account scope chosen", checks: [
      { dimension: "permissions", importance: "critical", status: "defined", explanation: "Owner only", evidenceIDs: [id] },
    ] }] });
    assert.equal(coverage(project).epics[0]!.checks.find((item) => item.dimension === "permissions")!.status, "defined");
    project = store.answer(project.id, project.revision, id, { kind: "answer", text: "Whole team" });
    assert.equal(coverage(project).epics[0]!.checks.find((item) => item.dimension === "permissions")!.status, "needs-review");
  } finally { store.close(); }
});

test("indexed-only records cannot support a focused assessment", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = round(store, fixture(store), { organization: [epic("new:jobs"), epic("new:other", "Other")], questions: [question("new:other")] });
    const focused = project.epics.find((item) => item.title === "Jobs")!.id;
    const pack = buildContext(project, focused);
    assert.ok(pack.manifest.omittedIDs.includes(project.questions[0]!.id));
    const { job } = store.beginJob(project.id, project.revision); store.claimJob(job.id, Date.now() + 60000); store.attachContext(job.id, pack.manifest);
    assert.throws(() => store.finishJob(job.id, analysisSchema.parse({ summary: "Focused", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
      assessments: [{ epicID: focused, confidence: "high", explanation: "Unsupported", checks: [{ dimension: "purpose", importance: "critical", status: "defined", explanation: "Did not read this evidence", evidenceIDs: [project.questions[0]!.id] }] }],
    })), /outside the detailed/);
    assert.deepEqual(store.get(project.id), project);
  } finally { store.close(); }
});
