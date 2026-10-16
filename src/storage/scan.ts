import { randomUUID, createHash } from "node:crypto";
import { lstat, readdir, open, realpath } from "node:fs/promises";
import { join, extname } from "node:path";
import type { Project, Job } from "../core/model.js";
import { directoryKey } from "./workspace.js";
import { potentiallySecret } from "./folder-preview.js";

const excluded = /^(?:node_modules|vendor|dist|build|bin|obj|coverage|venv|__pycache__|_staging|staging|logs|artifacts|screenshots)$/i;
const sensitive = /(?:^\.|(?:^|[._-])(?:credentials?|secrets?|tokens?|passwords?|auth)(?:[._-].*)?\.(?:json|ya?ml|toml|ini)$|keychain|id_rsa|id_ed25519|\.(?:pem|key|p12|pfx|keystore|lock)$|lock\.json$|\.min\.|\.map$)/i;
const extensions = new Set([".md", ".txt", ".rst", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yaml", ".yml", ".toml", ".py", ".go", ".rs", ".java", ".cs", ".rb", ".php", ".vue", ".svelte", ".sql", ".graphql", ".html", ".css", ".godot", ".tscn", ".tres", ".gd", ".csproj", ".sln"]);
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Read-only, bounded capture. No scripts, Git hooks, repository instructions or links are executed. */
export async function captureWorkspace(path: string, previous: Project["scans"][number] | undefined, signal: AbortSignal): Promise<NonNullable<Job["scan"]>> {
  const root = await realpath(path);
  if (directoryKey(root) !== directoryKey(path)) throw new Error("Workspace moved. Reconnect it before scanning.");
  const snapshot: Project["scans"][number] = { id: randomUUID(), capturedAt: new Date().toISOString(), files: [], omitted: [], traversalLimited: false, changes: [], affectedRequirementIDs: [] };
  const sources: Project["sources"] = [];
  const candidates: string[] = [];
  let visited = 0;
  async function walk(relative: string, depth: number) {
    signal.throwIfAborted();
    if (depth > 16 || visited >= 4000) { snapshot.traversalLimited = true; return; }
    const entries = await readdir(join(root, relative), { withFileTypes: true });
    const rank = (name: string) => /^(?:docs|scripts|src|scenes|world|tests)$/i.test(name) ? 0 : 1;
    entries.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      signal.throwIfAborted();
      if (++visited > 4000) { snapshot.traversalLimited = true; break; }
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const omit = (reason: string) => snapshot.omitted.push({ path: name, reason });
      if (entry.isSymbolicLink()) { omit("Symbolic link/junction"); continue; }
      if (excluded.test(entry.name) || sensitive.test(entry.name) || /^(?:AGENTS|CLAUDE|GEMINI)\.md$|^opencode\.jsonc?$|^PIXELLAB_/i.test(entry.name)) { omit("Excluded dependency/generated/tool-guidance/hidden or potentially sensitive path"); continue; }
      if (entry.isDirectory()) await walk(name, depth + 1);
      else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) candidates.push(name);
      else omit("Unsupported/non-text file");
    }
  }
  await walk("", 0);
  const category = (name: string) => /\.(?:md|rst|txt)$/i.test(name) ? "docs" : /\.(?:json|toml|ya?ml|godot|csproj|sln)$/i.test(name) ? "config" : "source";
  const priority = (name: string) => /(?:^|\/)(?:README|GAME_VISION|VERTICAL_SLICE|GAME_PLAN)\.(?:md|rst|txt)$/i.test(name) ? 0
    : /^(?:project\.godot|package\.json)$|\.(?:csproj|sln)$/i.test(name) ? 1
    : /^(?:scripts\/(?:game|player)|src)\//i.test(name) ? 2
    : /^(?:scenes|world)\//i.test(name) ? 3 : /(?:^|\/)art\/|^(?:assets|animations|characters)\//i.test(name) ? 6 : category(name) === "docs" ? 4 : 5;
  candidates.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b, "en"));
  const remaining = { docs: 72000, config: 12000, source: 96000 };
  let readBytes = 0;
  for (const name of candidates) {
    signal.throwIfAborted();
    if (snapshot.files.length >= 160) { snapshot.omitted.push({ path: name, reason: "160-excerpt budget" }); continue; }
    const target = join(root, name);
    // Recheck canonical ancestry immediately before opening to reject changed junctions.
    if (directoryKey(await realpath(target)) !== directoryKey(target)) { snapshot.omitted.push({ path: name, reason: "Path changed or linked" }); continue; }
    if (!(await lstat(target)).isFile()) continue;
    const file = await open(target, "r");
    try {
      const size = (await file.stat()).size;
      const group = category(name);
      if (size > 524288 || readBytes + size > 4000000 || remaining[group] <= 0) { snapshot.omitted.push({ path: name, reason: "512KB readable-file / 4MB inspection / category capture budget" }); continue; }
      const buffer = Buffer.alloc(size + 1);
      const read = await file.read(buffer, 0, buffer.length, 0);
      if (read.bytesRead !== size) throw new Error("Workspace file changed during capture. Retry the scan.");
      const content = buffer.subarray(0, size).toString("utf8");
      readBytes += size;
      if (potentiallySecret(content)) {
        snapshot.omitted.push({ path: name, reason: "Binary or potentially secret-bearing content" }); continue;
      }
      const hash = digest(buffer.subarray(0, size));
      const lines = content.split("\n").length;
      let offset = 0, startLine = 1, fileBytes = 0;
      while (offset < content.length && snapshot.files.length < 160) {
        let end = Math.min(offset + 7000, content.length);
        const newline = content.lastIndexOf("\n", end - 1);
        if (end < content.length && newline >= offset) end = newline + 1;
        const excerpt = content.slice(offset, end);
        const bytes = Buffer.byteLength(excerpt);
        if (fileBytes + bytes > 32000 || bytes > remaining[group]) break;
        const endLine = startLine + (excerpt.match(/\n/g)?.length ?? 0) - (excerpt.endsWith("\n") ? 1 : 0);
        const sourceID = `workspace:${hash}:${digest(`${name}:${offset}:${end}`).slice(0, 16)}`;
        snapshot.files.push({ path: name, hash, sourceID, lines, startLine, endLine });
        sources.push({ id: sourceID, kind: "workspace", epicID: "project", text: `Captured file ${name}, lines ${startLine}–${endLine}, character offsets ${offset}–${end}, SHA-256 ${hash}. Static evidence, not human intent or executed verification. This is an explicit excerpt; omitted portions were not analyzed.\n${excerpt}` });
        remaining[group] -= bytes; fileBytes += bytes;
        startLine += excerpt.match(/\n/g)?.length ?? 0; offset = end;
      }
      if (offset < content.length) snapshot.omitted.push({ path: name, reason: `Partial/uninspected file: characters ${offset}–${content.length} omitted by 32KB per-file, category or 160-excerpt budget` });
    } finally { await file.close(); }
  }
  for (const file of snapshot.files) {
    const old = previous?.files.find((item) => item.path === file.path);
    if ((!old || old.hash !== file.hash) && !snapshot.changes.some((c) => c.path === file.path)) snapshot.changes.push({ path: file.path, kind: old ? "changed" : "added" });
  }
  // Only report deletion when the file is actually absent, never because a budget/exclusion changed.
  for (const old of [...new Map(previous?.files.map((file) => [file.path, file])).values()]) {
    try { await lstat(join(root, old.path)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") snapshot.changes.push({ path: old.path, kind: "removed" }); else throw error; }
  }
  if (!sources.length) throw new Error("No eligible source or documentation files found. Add files to the folder or start idea discovery instead.");
  return { workspaceKey: digest(directoryKey(root)), snapshot, sources };
}

export function workspaceScanKey(path: string) { return digest(directoryKey(path)); }
