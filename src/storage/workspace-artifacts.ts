import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Filesystem-only artifact inspection. Keep rendering, models and portable-state
 * parsing out of the bounded streaming/integrity path. */
export const legacyArtifacts = Object.freeze(["requirements.md", "requirements.json", "progress.md", "progress.json", "manifest.json"]);
const segment = "(?:[a-z0-9_-]{1,80}|~[a-f0-9]{64})";
const nested = new RegExp(`^(?:features/${segment}/requirements\\.(?:md|json)|evidence/(?:index\\.json|(?:sources|research|scans)/[a-f0-9]{64}\\.json)|continuation/[a-f0-9]{64}\\.json)$`);
const artifactNames = new Set([...legacyArtifacts, "project.json", "state.json", "execution.json", "continuation.json", ".gitattributes"]);

export function validateArtifactName(name: string) {
  if (!artifactNames.has(name) && !nested.test(name)) throw new Error("Workspace conflict: invalid managed artifact path.");
  if (name.split("/").some((part) => /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) throw new Error("Workspace conflict: reserved managed artifact path.");
}
function artifactPath(directory: string, name: string): string | null {
  validateArtifactName(name);
  // Check every ancestor, including junctions, before inspecting nested output.
  let parent = directory;
  for (const segment of name.split("/").slice(0, -1)) {
    parent = join(parent, segment);
    try {
      const stat = lstatSync(parent);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Workspace conflict: ${name} must have regular directories.`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  const path = join(directory, name);
  // lstat also catches dangling links, which existsSync deliberately follows.
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Workspace conflict: ${name} must be a regular file.`);
    return path;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export function readArtifact(directory: string, name: string): string | null {
  const path = artifactPath(directory, name);
  return path === null ? null : readFileSync(path, "utf8");
}
export function artifactDigest(directory: string, name: string): string | null {
  const path = artifactPath(directory, name); if (path === null) return null;
  const fd = openSync(path, "r"), digest = createHash("sha256"), buffer = Buffer.allocUnsafe(65536);
  try { for (;;) { const bytes = readSync(fd, buffer); if (!bytes) break; digest.update(buffer.subarray(0, bytes)); } }
  finally { closeSync(fd); }
  return digest.digest("hex");
}
