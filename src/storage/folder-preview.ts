import { createHash } from "node:crypto";
import { open, realpath, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { canonicalDirectory, directoryKey } from "./workspace.js";
import { folderPreviewSchema, type FolderPreview } from "../core/folder-preview.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export function potentiallySecret(text: string) {
  return text.includes("\0") || /-----BEGIN .*PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)["']?\s*[:=]\s*["']?[A-Za-z0-9_\-/+]{12,}/i.test(text);
}

/** Fixed, bounded metadata/document inspection; no model calls, scripts or writes. */
export async function previewFolder(path: string): Promise<FolderPreview> {
  const root = canonicalDirectory(path);
  const evidence: FolderPreview["evidence"] = [];
  async function read(relative: string) {
    const target = join(root, relative);
    try {
      if (directoryKey(await realpath(target)) !== directoryKey(target)) return null;
      const file = await open(target, "r");
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 128000) return null;
        const buffer = Buffer.alloc(stat.size + 1);
        const result = await file.read(buffer, 0, buffer.length, 0);
        if (result.bytesRead !== stat.size) throw new Error("Folder changed during preview. Inspect it again.");
        const text = buffer.subarray(0, stat.size).toString("utf8");
        return potentiallySecret(text) ? null : { text, hash: hash(text) };
      } finally { await file.close(); }
    } catch (error) { if (["ENOENT", "EACCES", "EPERM", "EISDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return null; throw error; }
  }
  let name = basename(root).slice(0, 150) || "Existing project";
  let description = "";
  let projectType = "Existing software project";
  const add = (path: string, hash: string, field: FolderPreview["evidence"][number]["field"]) => evidence.push({ path, hash, field });
  const godot = await read("project.godot");
  const pkg = await read("package.json");
  if (godot) {
    const title = /^config\/name\s*=\s*"([^"\r\n]+)"/m.exec(godot.text)?.[1];
    if (title) { name = title.slice(0, 150); add("project.godot", godot.hash, "name"); }
    projectType = /config\/features=.*"C#"/.test(godot.text) ? "Godot / C# game" : "Godot game";
    add("project.godot", godot.hash, "projectType");
  } else if (pkg) {
    try {
      const data = JSON.parse(pkg.text) as Record<string, unknown>;
      const title = typeof data.productName === "string" ? data.productName : data.name;
      if (typeof title === "string" && title.trim()) { name = title.trim().slice(0, 150); add("package.json", pkg.hash, "name"); }
      if (typeof data.description === "string" && data.description.trim()) { description = data.description.trim().slice(0, 3000); add("package.json", pkg.hash, "description"); }
      projectType = "JavaScript / TypeScript project"; add("package.json", pkg.hash, "projectType");
    } catch { /* Malformed package metadata does not prevent documentation/folder fallback. */ }
  } else {
    const entries = await readdir(root, { withFileTypes: true });
    const csproj = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".csproj")).sort((a, b) => a.name.localeCompare(b.name))[0];
    if (csproj) { const data = await read(csproj.name); if (data) { name = (/<(?:AssemblyName|RootNamespace)>([^<]+)</.exec(data.text)?.[1] ?? csproj.name.replace(/\.csproj$/, "")).slice(0, 150); projectType = "C# / .NET project"; add(csproj.name, data.hash, "name"); add(csproj.name, data.hash, "projectType"); } }
  }
  for (const relative of ["docs/GAME_VISION.md", "GAME_VISION.md", "README.md", "readme.md", "README.rst", "README.txt"]) {
    const data = await read(relative);
    if (!data) continue;
    const paragraph = data.text.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n\s*\r?\n/).find((part) => {
      const trimmed = part.trim();
      return trimmed.length >= 20 && !/^(?:#|```|\[!|!\[|<|[-*]\s|\|)/.test(trimmed);
    })?.trim().replace(/\r?\n/g, " ").slice(0, 3000);
    if (paragraph) { description = paragraph; add(relative, data.hash, "description"); break; }
  }
  const value = { name, description, projectType, evidence };
  return folderPreviewSchema.parse({ ...value, fingerprint: hash(JSON.stringify(value)) });
}
