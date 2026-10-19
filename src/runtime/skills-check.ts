import assert from "node:assert/strict";
import { access, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { startRuntime } from "./server.js";
import { executionSkill, skillDocument } from "../core/execution-skills.js";
import { executionPermissions, executionPermissionsCurrent } from "./skills.js";
import { executionConfigSchema, validateAssessment } from "../core/execution.js";
import { assessmentPrompt } from "../core/execution-context.js";
import { OpenCodeExecution } from "./execution.js";

// Metadata-only by default. Model inference requires explicit opt-in and exact selection.
const { values } = parseArgs({ options: { "live-assessment": { type: "boolean" }, provider: { type: "string" }, model: { type: "string" } } });
if (values["live-assessment"] ? !values.provider || !values.model : values.provider || values.model)
  throw new Error("Live verification requires --live-assessment --provider <id> --model <id>; metadata checks take no model selection.");
const liveConfig = values["live-assessment"] ? executionConfigSchema.parse({ repository: "fixture/skill-check", strategy: "requirement-pr", providerID: values.provider, modelID: values.model, checks: ["node --version"] }) : undefined;
const directory = await mkdtemp(join(tmpdir(), "reqwizit-skill-check-"));
try {
  for (const coding of [false, true]) {
    const runtime = await startRuntime(undefined, directory, AbortSignal.timeout(90000), false, coding, !coding);
    let staged: string | undefined;
    try {
      const skill = executionSkill(coding); staged = runtime.skillPath;
      assert.ok(staged);
      assert.equal(await readFile(staged, "utf8"), skillDocument(skill));
      const catalog = (await runtime.client.app.skills({}, { signal: AbortSignal.timeout(90000) })).data ?? [];
      const registered = catalog.find((s) => s.name === skill.name);
      assert.ok(registered, `Missing ${skill.name}`);
      assert.equal(resolve(registered.location), resolve(staged));
      assert.ok(registered.content.includes(skill.body.trim()), "Registered skill must contain the bundled workflow");
      assert.ok((await runtime.client.tool.ids({}, { signal: AbortSignal.timeout(90000) })).data?.includes("skill"));
      const permission = executionPermissions(coding);
      const session = (await runtime.client.session.create({ title: "Reqwizit skill permission metadata check", permission: [{ permission: "*", pattern: "*", action: "deny" }] }, { signal: AbortSignal.timeout(90000) })).data;
      assert.ok(session);
      try {
        await runtime.client.session.update({ sessionID: session.id, permission }, { signal: AbortSignal.timeout(90000) });
        const saved = (await runtime.client.session.get({ sessionID: session.id }, { signal: AbortSignal.timeout(90000) })).data;
        assert.equal(executionPermissionsCurrent(saved?.permission ?? [], coding), true, "Native session API appends the role's restrictive permissions on resume");
        assert.equal(executionPermissionsCurrent(saved?.permission ?? [], !coding), false, "A different role cannot reuse these grants");
      } finally { await runtime.client.session.delete({ sessionID: session.id }, { signal: AbortSignal.timeout(90000) }); }
      console.log(`${skill.name} v${skill.version}: registered with matching content and native skill tool; resumed permission rules verified (no model inference).`);
    } finally { await runtime.close(); if (staged) await assert.rejects(access(staged)); }
  }
  if (liveConfig) {
    const requirement = { id: "skill-check", epicID: "project", status: "accepted" as const, statement: "The greeting function returns Hello.", rationale: "Small isolated skill-loading fixture", sourceIDs: ["fixture-human-input"], acceptance: ["Calling greeting() returns Hello."] };
    const prompt = assessmentPrompt(JSON.stringify({ requirement, decisions: [], guardrails: [], evidence: [{ id: "file:1", text: 'src/greeting.ts: export function greeting() { return "Hello"; }' }], evidenceIndex: [], omissions: { count: 0 }, contextScope: { detailed: 1, captured: 1 } }));
    const result = await new OpenCodeExecution().perform({ directory, config: liveConfig, coding: false, requirementID: requirement.id, signal: AbortSignal.timeout(90000),
      prompt, onSession: () => {}, onProgress: (message) => console.log(message) });
    const assessment = validateAssessment(JSON.parse(result), requirement, ["file:1"]);
    assert.equal(assessment.status, "complete");
    console.log(`Live ${liveConfig.providerID}/${liveConfig.modelID}: completed matching assessment skill load and validated scenario result (${assessment.status}). No source edits or Git delivery.`);
  }
} finally { await rm(directory, { recursive: true, force: true }); }
