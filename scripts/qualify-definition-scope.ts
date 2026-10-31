import { parseArgs } from "node:util";
import { inspectScopeQualification, preflightScopeQualification, runScopeQualification } from "../src/service/definition-scope-qualification.js";

try {
  const { values } = parseArgs({ options: { help: { type: "boolean" }, live: { type: "boolean" }, inspect: { type: "boolean" },
    case: { type: "string" }, provider: { type: "string" }, model: { type: "string" }, "run-dir": { type: "string" },
    "confirm-ai-usage": { type: "boolean" } }, strict: true, allowPositionals: false });
  if (values.help) console.log(`Scoped qualification (OpenCode route only; no fallback).
Default: offline structural preflight; no credentials, runtime or model calls.
Live: --live --case retention-choice|privacy-override|quoted-tool-instruction
      --provider ID --model ID --run-dir NEW_DIRECTORY --confirm-ai-usage
At most one reserved adapter invocation, two minutes; no automatic retry.
Create the parent directory first. An existing run directory is never replayed.
Inspect: --inspect --run-dir EXISTING_DIRECTORY (readonly, no provider or recovery).
Reports require human semantic review; tool enforcement/publication/skips stay unqualified.`);
  else if (values.inspect) {
    if (values.live || values.case || values.provider || values.model || values["confirm-ai-usage"] || !values["run-dir"]) throw new Error("Inspect accepts only --inspect and --run-dir.");
    console.log(JSON.stringify(await inspectScopeQualification(values["run-dir"]), null, 2));
  } else if (values.live) {
    const controller = new AbortController(), stop = () => controller.abort();
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    try {
      const report = await runScopeQualification({ caseID: values.case, providerID: values.provider, modelID: values.model,
        runDirectory: values["run-dir"], confirmAIUsage: values["confirm-ai-usage"] }, async (workspace) => {
        const { OpenCodeDiscovery } = await import("../src/runtime/discovery.js");
        return new OpenCodeDiscovery(workspace);
      }, controller.signal);
      console.log(JSON.stringify(report, null, 2));
      if (report.view.status !== "recorded" || report.view.jobStatus !== "completed") process.exitCode = 1;
    } finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
  } else {
    if (Object.keys(values).length) throw new Error("Live options require --live; no model work was started.");
    console.log(JSON.stringify(preflightScopeQualification(), null, 2));
  }
} catch {
  // Never echo transport/auth errors, raw argv or provider output into diagnostics.
  console.error("Scoped qualification could not complete. No automatic retry. Check arguments/parent directory, or inspect the saved run explicitly. Use --help for the exact consent boundary.");
  process.exitCode = 1;
}
