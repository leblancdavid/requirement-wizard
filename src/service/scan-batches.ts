import type { Analysis, Job, ScanBatch } from "../core/model.js";

export const scanBatchTimeout = 300_000;
export const scanWindowTimeout = 900_000;
export const scanLeaseDuration = scanWindowTimeout + 60_000;
const maxDepth = 4;
const minExcerpt = 1000;

export function planScanBatches(scan: NonNullable<Job["scan"]>): ScanBatch[] {
  const batches: ScanBatch[] = [];
  for (const source of scan.sources) {
    let batch = batches.at(-1);
    const size = batch?.excerpts.reduce((sum, item) => sum + JSON.stringify(scan.sources.find((s) => s.id === item.sourceID)).length, 0) ?? 0;
    if (!batch || batch.excerpts.length >= 3 || size + JSON.stringify(source).length > 12000) {
      batch = { excerpts: [], depth: 0, attempts: 0 }; batches.push(batch);
    }
    batch.excerpts.push({ sourceID: source.id, start: 0, end: source.text.length });
  }
  for (let index = 0; index < batches.length; index++) {
    if (JSON.stringify(scanBatchSources(scan, batches[index]!)).length <= 12000) continue;
    const smaller = splitScanBatch(batches[index]!);
    if (!smaller) throw new Error("Captured excerpt cannot fit the scan batch budget.");
    batches.splice(index, 1, ...smaller); index--;
  }
  return batches;
}

/** Split only unfinished work. Captured sources and their evidence IDs stay intact. */
export function splitScanBatch(batch: ScanBatch): ScanBatch[] | undefined {
  if (batch.depth >= maxDepth) return;
  let halves: ScanBatch["excerpts"][];
  if (batch.excerpts.length > 1) {
    const middle = Math.ceil(batch.excerpts.length / 2);
    halves = [batch.excerpts.slice(0, middle), batch.excerpts.slice(middle)];
  } else {
    const item = batch.excerpts[0];
    if (!item || item.end - item.start < minExcerpt * 2) return;
    const middle = Math.floor((item.start + item.end) / 2);
    halves = [[{ ...item, end: middle }], [{ ...item, start: middle }]];
  }
  return halves.map((excerpts) => ({ excerpts, depth: batch.depth + 1, attempts: 0 }));
}

export function scanBatchSources(scan: NonNullable<Job["scan"]>, batch: ScanBatch) {
  return batch.excerpts.map((item) => {
    const source = scan.sources.find((s) => s.id === item.sourceID);
    if (!source || item.start < 0 || item.end > source.text.length || item.start >= item.end) throw new Error("Invalid saved scan excerpt. Start a new scan.");
    if (!item.start && item.end === source.text.length) return source;
    const header = source.text.slice(0, source.text.indexOf("\n") + 1);
    return { ...source, text: `${header}Further bounded subexcerpt: captured-source character offsets ${item.start}–${item.end}. Only the following slice is evidence for this task:\n${source.text.slice(item.start, item.end)}` };
  });
}

export function validateScanBatch(output: Analysis, sourceIDs: string[], label: string) {
  const current = new Set(sourceIDs);
  for (const [index, requirement] of output.requirements.entries()) {
    const invalid = requirement.sourceIDs.filter((id) => !current.has(id));
    if (!requirement.sourceIDs.length || invalid.length) {
      const detail = !requirement.sourceIDs.length ? "missing sourceIDs" : `invalid sourceIDs ${JSON.stringify(invalid.slice(0, 3).map((id) => id.slice(0, 120)))}`;
      throw new Error(`Scan batch ${label}, requirement ${index + 1}: ${detail}. Cite only exact captured-file IDs from this batch. No scan proposals applied; resume or start a new scan explicitly.`);
    }
  }
}
