import { parseArgs } from "node:util";
import { compactDatabaseCopy } from "../src/storage/compact-copy.js";

const { values } = parseArgs({ options: { source: { type: "string" }, output: { type: "string" }, resume: { type: "boolean" }, help: { type: "boolean" } } });
if (values.help || !values.source || !values.output) {
  console.log('Usage: npm run db:compact -- --source "path/to/projects.sqlite" --output "path/to/compacted.sqlite" [--resume]\nClose the app first. Creates and verifies a new file; never replaces the original. No AI calls.');
  if (!values.help) process.exitCode = 1;
} else {
  const controller = new AbortController(); process.once("SIGINT", () => controller.abort(new Error("Compaction interrupted; committed staging batches are retained for --resume.")));
  let last = "";
  try {
    const result = await compactDatabaseCopy(values.source, values.output, { resume: values.resume, signal: controller.signal, progress(p) {
      const text = `${p.phase}${p.total ? ` ${Math.floor(100 * (p.completed ?? 0) / p.total)}%` : ""}`;
      if (text !== last) { console.log(text); last = text; }
    } });
    console.log(JSON.stringify(result)); console.log("Verified compacted copy ready. Original retained; no automatic replacement was performed.");
  } catch (error) { console.error(error instanceof Error ? error.message : "Compaction failed; retain the original database."); process.exitCode = 1; }
}
