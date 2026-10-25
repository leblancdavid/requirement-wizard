import assert from "node:assert/strict";
import test from "node:test";
import { logLimit, logPreview, logTiming, projectLogs, redactLog, retainLog, type LogRecord } from "./log-records.js";
import { emptyExecution } from "../core/execution.js";
import type { Job } from "../core/model.js";

test("diagnostic redaction covers headers, JSON tokens and query credentials", () => {
  for (const text of ['Bearer private-secret', '"access_token": "private-secret"', "refresh_token=private-secret&next=ok", "api-key: private-secret", "password=private-secret"]) {
    assert.ok(!redactLog(text).includes("private-secret"));
  }
  assert.equal(redactLog("32 steps completed · revision 4"), "32 steps completed · revision 4");
});

test("browser-session logs deduplicate by identity, bound retention, and never mutate their input", () => {
  const record: LogRecord = { id: "same", source: "App", title: "Request failed", detail: "Bearer private-secret" };
  const before = structuredClone(record);
  let entries = retainLog([], record);
  entries = retainLog(entries, { ...record, detail: "new detail" });
  assert.equal(entries.length, 1); assert.equal(entries[0]!.detail, "new detail");
  for (let i = 0; i < logLimit + 2; i++) entries = retainLog(entries, { ...record, id: String(i) });
  assert.equal(entries.length, logLimit); assert.equal(entries[0]!.id, String(logLimit + 1));
  assert.deepEqual(record, before);
});

test("large log previews explicitly disclose their display bound", () => {
  assert.match(logPreview("x".repeat(70_000)), /Display limited to 64,000 characters/);
  assert.equal(logPreview("exact diagnostic"), "exact diagnostic");
});

test("older saved jobs remain readable without fabricated timestamps or mutations", () => {
  const job: Job = { id: "old-job", projectID: "project", expectedRevision: 2, model: { providerID: "openai", modelID: "fixture" }, leaseUntil: null, status: "interrupted", diagnostic: "Original interruption <script>" };
  const before = structuredClone(job);
  const first = projectLogs([job], []), reopened = projectLogs([job], []);
  assert.equal(first[0]!.id, "old-job"); assert.equal(first[0]!.at, undefined);
  assert.match(first[0]!.detail, /Original interruption <script>/);
  assert.ok(!first[0]!.detail.includes("metrics"));
  assert.deepEqual(first, reopened); assert.deepEqual(job, before);
});

test("job context and report provenance are retained in the log projection", () => {
  const job: Job = { id: "job", projectID: "project", expectedRevision: 2, model: { providerID: "openai", modelID: "fixture" }, leaseUntil: null, status: "failed", diagnostic: "access_token=private-secret", definitionBlock: { format: 1, reason: "Indivisible evidence" }, context: { revision: 2, focusEpicID: "area", characters: 100, budget: 200, includedIDs: ["evidence"], omittedIDs: [] } };
  const record = projectLogs([job], [])[0]!;
  assert.equal(record.title, "Project review"); assert.match(record.detail, /Indivisible evidence/);
  assert.match(record.detail, /evidence/); assert.ok(!record.detail.includes("private-secret"));
  assert.equal(job.diagnostic, "access_token=private-secret");
});

test("log timing uses real lifecycle times or measured durations without treating recorded events as starts", () => {
  const record: LogRecord = { id: "timed", title: "Review", source: "Discovery", detail: "", at: "2026-10-25T12:00:00.000Z", atLabel: "Started", finishedAt: "2026-10-25T12:00:02.500Z" };
  assert.match(logTiming(record), /Started:.*Finished:.*Duration: 2.5s/);
  assert.match(logTiming({ ...record, atLabel: "Recorded" }), /Duration not recorded/);
  assert.match(logTiming({ ...record, at: undefined, finishedAt: undefined, durationMs: 1200 }), /Start time not recorded.*Duration: 1.2s/);
  assert.ok(!logTiming({ ...record, at: "invalid", finishedAt: "invalid" }).includes("Invalid Date"));
});

test("build planning and its earlier attempts use already saved creation times and retain run identity", () => {
  const state = emptyExecution();
  state.planning = { format: 1, id: "current", revision: 5, bindingID: "local", createdAt: "2026-10-25T12:00:00.000Z", finishedAt: "2026-10-25T12:00:03.000Z", status: "failed", configFingerprint: "fixture", model: { providerID: "openai", modelID: "fixture" } };
  state.planningHistory = [{ ...state.planning, id: "previous", createdAt: "2026-10-24T12:00:00.000Z", finishedAt: undefined }];
  const before = structuredClone(state), records = projectLogs([], [], state);
  assert.equal(records.length, 2); assert.equal(records[0]!.at, state.planning.createdAt);
  assert.match(logTiming(records[0]!), /Duration: 3.0s/); assert.match(logTiming(records[1]!), /Duration not recorded/);
  assert.deepEqual(state, before);
});
