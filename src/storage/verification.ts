import { lstat, open, opendir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { VerificationSuggestions } from "../core/execution.js";
import { canonicalDirectory, directoryKey } from "./workspace.js";
import { potentiallySecret } from "./folder-preview.js";

/** Bounded local metadata inspection. Never executes scripts or returns their contents. */
export async function suggestVerificationCommands(directory?: string): Promise<VerificationSuggestions> {
  const commands: string[] = [], evidence: string[] = [], notes: string[] = [];
  const result = (): VerificationSuggestions => ({ commands, evidence, message: commands.length
    ? `Suggested from ${evidence.join(", ")}. Commands have not been run.${notes.length ? ` ${notes.join(" ")}` : ""}`
    : `${notes.join(" ") || "No reliable verification command was found in root project metadata."} Enter a project-specific check.` });
  if (!directory) { notes.push("Connect a workspace to suggest verification commands."); return result(); }
  try {
    const root = canonicalDirectory(directory);
    let budget = 512000;
    async function read(name: string) {
      const target = join(root, name);
      try {
        const stat = await lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128000 || stat.size > budget || directoryKey(await realpath(target)) !== directoryKey(target)) return null;
        const file = await open(target, "r");
        try {
          const buffer = Buffer.alloc(stat.size + 1), captured = await file.read(buffer, 0, buffer.length, 0);
          if (captured.bytesRead !== stat.size) return null;
          budget -= stat.size;
          const text = buffer.subarray(0, stat.size).toString("utf8");
          return potentiallySecret(text) ? null : text;
        } finally { await file.close(); }
      } catch { return null; }
    }
    const entries = new Set<string>();
    let visited = 0, listingLimited = false;
    const listing = await opendir(root);
    for await (const entry of listing) {
      if (++visited > 256) { listingLimited = true; break; }
      if (entry.isFile() && !entry.isSymbolicLink()) entries.add(entry.name);
    }
    const add = (source: string, ...checks: string[]) => { evidence.push(source); for (const check of checks) if (!commands.includes(check)) commands.push(check); };
    const pkg = await read("package.json");
    if (pkg) try {
      const data = JSON.parse(pkg) as Record<string, unknown>;
      if (data && typeof data === "object" && data.scripts && typeof data.scripts === "object" && !Array.isArray(data.scripts)) {
        const scripts = data.scripts as Record<string, unknown>;
        const declared = typeof data.packageManager === "string" ? /^(npm|pnpm|yarn|bun)@/.exec(data.packageManager)?.[1] : undefined;
        const locks = [...new Set([entries.has("package-lock.json") || entries.has("npm-shrinkwrap.json") ? "npm" : "", entries.has("pnpm-lock.yaml") ? "pnpm" : "", entries.has("yarn.lock") ? "yarn" : "", entries.has("bun.lock") || entries.has("bun.lockb") ? "bun" : ""].filter(Boolean))];
        const manager = declared ?? (typeof data.packageManager === "string" || locks.length > 1 || listingLimited ? undefined : locks[0] ?? "npm");
        if (!manager) notes.push("Package manager metadata is unsupported, ambiguous or incomplete; choose JavaScript checks manually.");
        else {
          const usable = (name: string) => typeof scripts[name] === "string" && !!(scripts[name] as string).trim()
            && !/no test specified|--watch(?:All)?(?:\s|=true|$)|--fix\b|--write\b/i.test(scripts[name] as string);
          const typecheck = ["check", "typecheck", "type-check"].find(usable);
          const names = [typecheck, usable("lint") ? "lint" : undefined, usable("test") ? "test" : undefined].filter((s): s is string => !!s);
          if (!names.length && usable("build")) names.push("build");
          const checks = names.map((name) => {
            const script = scripts[name] as string;
            const flag = name === "test" && /\bvitest\b/.test(script) && !/\bvitest\s+run\b|--run\b/.test(script) ? "--run"
              : name === "test" && /\b(?:jest|react-scripts\s+test)\b/.test(script) && !/--watch(?:All)?\s*=\s*false\b/.test(script) ? "--watchAll=false" : "";
            return `${manager} run ${name}${flag ? `${manager === "npm" ? " --" : ""} ${flag}` : ""}`;
          });
          if (checks.length) add("package.json", ...checks);
        }
      }
    } catch { notes.push("package.json could not be interpreted; no scripts were assumed."); }
    const cargo = await read("Cargo.toml");
    if (cargo && /^\s*\[(?:package|workspace)\]/m.test(cargo)) add("Cargo.toml", "cargo check", "cargo test");
    const go = await read("go.mod");
    if (go && /^module\s+\S+/m.test(go)) add("go.mod", "go test ./...");
    const projects = [...entries].filter((name) => /\.(?:cs|fs|vb)proj$/i.test(name));
    const solutions = [...entries].filter((name) => /\.slnx?$/i.test(name));
    const dotnet = listingLimited ? undefined : solutions.length === 1 ? solutions[0] : !solutions.length && projects.length === 1 ? projects[0] : undefined;
    if (dotnet) {
      const content = await read(dotnet);
      if (content && /<Project\b|<Solution\b|Microsoft Visual Studio Solution File/.test(content)) {
        add(dotnet, "dotnet build");
        if (/<IsTestProject>\s*true\s*<\/IsTestProject>|Microsoft\.NET\.Test\.Sdk/.test(content)) commands.push("dotnet test");
      }
    }
    const pytest = await read("pytest.ini"), pyproject = await read("pyproject.toml");
    if (pytest && /^\s*\[pytest\]/m.test(pytest)) add("pytest.ini", "python -m pytest");
    else if (pyproject && /^\s*\[tool\.pytest\.ini_options\]/m.test(pyproject)) add("pyproject.toml", "python -m pytest");
    const godot = await read("project.godot");
    if (godot && /^\s*(?:\[application\]|config_version\s*=)/m.test(godot)) {
      add("project.godot", "godot --headless --path . --editor --import");
      notes.push("Godot import is a smoke check, not a gameplay acceptance test; adjust the executable name if needed.");
    }
    return result();
  } catch { notes.push("Workspace metadata could not be inspected."); return result(); }
}
