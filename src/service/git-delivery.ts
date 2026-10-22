import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { CheckResult, DeliveryUnit, ExecutionConfig, WorkspaceRepository } from "../core/execution.js";
import { safeMessage } from "../runtime/contract.js";
import { directoryKey } from "../storage/workspace.js";
import { suggestVerificationCommands } from "../storage/verification.js";

/** Bounded subprocesses; credentials and raw Git/GitHub errors never enter persisted logs. */
export async function command(directory: string, executable: string, args: string[], signal: AbortSignal, shell = false): Promise<{ code: number; output: string }> {
  signal.throwIfAborted();
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd: directory, shell, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" } });
    let output = "", exceeded = false, stopped = false;
    const kill = () => {
      stopped = true;
      if (process.platform === "win32" && child.pid) { const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); killer.on("error", () => child.kill()); }
      else child.kill("SIGKILL");
    };
    const timeout = setTimeout(kill, shell ? 600_000 : 90_000);
    const data = (chunk: Buffer) => { if (output.length + chunk.length > 1_000_000) { exceeded = true; kill(); } else output += chunk.toString(); };
    child.stdout.on("data", data); child.stderr.on("data", data);
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener("abort", kill); };
    signal.addEventListener("abort", kill, { once: true });
    child.on("error", () => { cleanup(); reject(new Error(`Cannot launch ${shell ? "verification command" : executable}. Check installation and local configuration.`)); });
    child.on("close", (code) => { cleanup();
      if (signal.aborted) reject(new Error("Implementation stopped."));
      else if (stopped || exceeded) reject(new Error("Command exceeded its time/output budget. Review the local process before resuming."));
      else accept({ code: code ?? 1, output: output.trim() });
    });
  });
}
/** Accept supported public GitHub remotes without exposing raw URLs or embedded credentials. */
export function githubRepository(remote: string): string | undefined {
  return /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com(?::\d+)?\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(remote.trim())?.[1];
}

/** Local metadata only: no fetch, authentication, repository writes or model calls. */
export async function inspectWorkspaceRepository(directory?: string): Promise<WorkspaceRepository> {
  const verification = await suggestVerificationCommands(directory);
  const result = (value: WorkspaceRepository): WorkspaceRepository => ({ ...value, verification });
  if (!directory) return result({ status: "no-workspace", message: "Connect a local workspace to detect its GitHub repository." });
  try {
    const signal = AbortSignal.timeout(5_000);
    const root = await command(directory, "git", ["rev-parse", "--show-toplevel"], signal);
    if (root.code) return result({ status: "not-repository", message: "The workspace folder is not an accessible Git working tree." });
    if (directoryKey(resolve(root.output)) !== directoryKey(resolve(directory))) return result({ status: "not-root", message: "Connect the Git repository root as the workspace to use it for implementation." });
    const remote = await command(directory, "git", ["remote", "get-url", "origin"], signal);
    if (remote.code) return result({ status: "no-origin", message: "This Git repository has no origin remote. Add its GitHub origin, then detect again." });
    const repository = githubRepository(remote.output);
    return result(repository ? { status: "detected", repository, message: `Detected from workspace origin: ${repository}` }
      : { status: "not-github", message: "The workspace origin is not a supported GitHub remote. Use a github.com HTTPS or SSH origin." });
  } catch { return result({ status: "unavailable", message: "Could not inspect local Git metadata. Check Git installation and workspace access, then detect again." }); }
}

export class GitDelivery {
  private assessmentHistory?: Promise<Map<string, Set<string>>>;
  private assessmentChanges = new Map<string, Promise<Set<string>>>();
  constructor(readonly directory: string, readonly config: ExecutionConfig, readonly signal: AbortSignal) {}
  async git(args: string[]) {
    const result = await command(this.directory, "git", args, this.signal);
    if (result.code) throw new Error(`Git ${args[0]} failed. Check repository state, authentication, hooks and branch rules locally.`);
    return result.output;
  }
  async gh(args: string[]) {
    const result = await command(this.directory, "gh", [...args, "--repo", this.config.repository], this.signal);
    if (result.code) throw new Error(`GitHub ${args.slice(0, 2).join(" ")} failed. Check gh authentication and repository access locally.`);
    return result.output;
  }
  async localPreflight() {
    const root = await this.git(["rev-parse", "--show-toplevel"]);
    if (directoryKey(resolve(root)) !== directoryKey(resolve(this.directory))) throw new Error("Connect the Git repository root as the project workspace.");
  }
  async preflight() {
    await this.localPreflight();
    const remote = await this.git(["remote", "get-url", "origin"]);
    const repository = githubRepository(remote);
    if (!repository || repository.toLowerCase() !== this.config.repository.toLowerCase()) throw new Error("origin must match the configured GitHub owner/repository.");
    const common = resolve(this.directory, await this.git(["rev-parse", "--git-common-dir"]));
    await this.git(["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
    await this.git(["rev-parse", "--verify", "origin/main"]);
    return common;
  }
  async worktree(id: string, branch?: string, base = "origin/main") {
    const common = resolve(this.directory, await this.git(["rev-parse", "--git-common-dir"]));
    const directory = join(common, "reqwizit-worktrees", id);
    const listed = await this.git(["worktree", "list", "--porcelain"]);
    if (listed.split("\n").some((line) => line.startsWith("worktree ") && resolve(line.slice(9)).toLowerCase() === resolve(directory).toLowerCase())) return directory;
    await mkdir(dirname(directory), { recursive: true });
    const existing = branch && (await command(this.directory, "git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], this.signal)).code === 0;
    await this.git(["worktree", "add", ...(branch ? existing ? [] : ["-b", branch] : ["--detach"]), directory, existing ? branch! : base]);
    return directory;
  }
  at(directory: string) { return new GitDelivery(directory, this.config, this.signal); }
  async head() { return this.git(["rev-parse", "HEAD"]); }
  async clean() { return !(await this.git(["status", "--porcelain"])); }
  /** Advisory navigation only. Never authorizes reuse or excludes current evidence.
   * Cache bounded history and per-baseline changes for this assessment target/run. */
  async assessmentHints(requirementID: string, baseline?: string) {
    const optional = async <T>(read: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await read(); } catch (error) { this.signal.throwIfAborted(); return fallback; }
    };
    this.assessmentHistory ??= optional(async () => {
      const history = await this.git(["log", "-200", "--format=%x1e%B%x1f", "--name-only", "-z", "--no-renames", "HEAD", "--"]);
      const index = new Map<string, Set<string>>();
      for (const record of history.split("\x1e")) {
        const split = record.indexOf("\x1f");
        if (split < 0) continue;
        const message = record.slice(0, split);
        const ids = [...message.matchAll(/^Requirement: ([^\r\n]+)\r?$/gm)].map((match) => match[1]!);
        const titleID = /^\w+\(([^)\r\n]+)\)!?:/.exec(message)?.[1];
        if (titleID) ids.push(titleID);
        const paths = record.slice(split + 1).replace(/^\0?\r?\n/, "").split("\0").filter(Boolean);
        for (const id of ids) {
          const files = index.get(id) ?? new Set<string>();
          for (const path of paths) files.add(path);
          index.set(id, files);
        }
      }
      return index;
    }, new Map<string, Set<string>>());
    // Only accept object IDs, never revision expressions/options from saved data.
    const base = baseline && /^[a-f0-9]{40,64}$/i.test(baseline) ? baseline : "HEAD";
    if (!this.assessmentChanges.has(base)) this.assessmentChanges.set(base, optional(async () => {
      // Includes tracked staged/unstaged edits and changes without feature markers,
      // including shared modules, renames and reverts. Untracked files matter too.
      const changed = await this.git(["diff", "--name-only", "-z", "--no-renames", base, "--"]);
      const untracked = await this.git(["ls-files", "--others", "--exclude-standard", "-z"]);
      return new Set((changed + "\0" + untracked).split("\0").filter(Boolean));
    }, new Set<string>()));
    const [history, changedPaths] = await Promise.all([this.assessmentHistory, this.assessmentChanges.get(base)!]);
    return { linkedPaths: history.get(requirementID) ?? new Set<string>(), changedPaths };
  }
  async verification(onCheck?: (result: CheckResult) => void, onStart?: (command: string) => void): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    for (const check of this.config.checks) {
      onStart?.(check);
      const result = await command(this.directory, check, [], this.signal, true);
      // Only a bounded redacted diagnostic is retained; full output stays in the local command.
      const output = safeMessage(result.output.slice(-12000));
      const checked = { command: check, exitCode: result.code, output, at: new Date().toISOString() };
      results.push(checked); onCheck?.(checked);
      if (result.code) break;
    }
    return results;
  }
  async treeDigest() {
    const paths = (await this.git(["ls-files", "-co", "--exclude-standard", "-z"])).split("\0").filter(Boolean).sort();
    const hash = createHash("sha256");
    for (const path of paths) {
      hash.update(path); try { hash.update(await readFile(join(this.directory, path))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") hash.update("<deleted>"); else throw error; }
    }
    return hash.digest("hex");
  }
  async push(branch: string) { await this.git(["push", "origin", `HEAD:refs/heads/${branch}`]); }
  async pr(unit: DeliveryUnit) {
    const entries = JSON.parse(await this.gh(["pr", "list", "--head", this.config.strategy === "branch" ? this.config.branch : unit.branch, "--base", "main", "--state", "all", "--json", "url,state,mergeCommit,headRefOid"])) as { url: string; state: string; mergeCommit: { oid: string } | null; headRefOid: string }[];
    const commit = unit.items.at(-1)?.commit;
    for (const entry of entries) {
      if (entry.headRefOid === commit) return entry;
      if (this.config.strategy === "branch" && commit && (await command(this.directory, "git", ["merge-base", "--is-ancestor", commit, entry.headRefOid], this.signal)).code === 0) return entry;
    }
    return undefined;
  }
  async openPR(unit: DeliveryUnit, title: string) {
    const output = await this.gh(["pr", "create", "--head", unit.branch, "--base", "main", "--title", title.slice(0, 200), "--body", `Sequentially implemented and verified requirements:\n${unit.items.map((i) => `- ${i.requirementID}: ${i.commit}`).join("\n")}\n\nVerification commands:\n${this.config.checks.map((c) => `- ${c}`).join("\n")}\n\nMerge this PR to deliver these requirements to main.`]);
    const url = output.split(/\r?\n/).find((line) => line.startsWith(`https://github.com/${this.config.repository}/pull/`) && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(line));
    if (!url) throw new Error("GitHub did not return a recognized PR URL. Continue to reconcile the created PR before retrying.");
    return url;
  }
  async contains(commit: string) { return (await command(this.directory, "git", ["merge-base", "--is-ancestor", commit, "origin/main"], this.signal)).code === 0; }
}
