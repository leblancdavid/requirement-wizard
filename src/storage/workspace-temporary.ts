import { lstatSync, opendirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { lstat, opendir, unlink } from "node:fs/promises";

const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const ownerPattern = new RegExp(`^${uuid}$`);
const temporaryPattern = new RegExp(`^\\.reqwizit-(?:${uuid}-)?${uuid}\\.tmp$`);
export const workspaceTemporaryAge = 24 * 60 * 60 * 1000;
export const workspaceTemporaryInterval = 15 * 60 * 1000;

export function temporaryPrefix(owner?: string) {
  if (owner !== undefined && !ownerPattern.test(owner)) throw new Error("Invalid publication temporary owner.");
  return `.reqwizit-${owner ? `${owner}-` : ""}`;
}

/** Only root staging files, never recursive deletion or manifest/evidence files.
 * An owner bypasses age ONLY for a publisher whose exit has been observed. */
export function cleanWorkspaceTemps(directory: string, options: {
  apply?: boolean; now?: number; maxEntries?: number; exitedOwner?: string;
} = {}) {
  const result = { inspected: 0, eligible: 0, bytes: 0, removed: 0, removedBytes: 0, failed: 0, truncated: false };
  const prefix = options.exitedOwner === undefined ? undefined : temporaryPrefix(options.exitedOwner);
  try {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Temporary cleanup requires a regular managed directory.");
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return result; throw error; }
  const cutoff = (options.now ?? Date.now()) - workspaceTemporaryAge;
  const entries = opendirSync(directory);
  try {
    for (let entry; (entry = entries.readSync()) !== null;) {
      if (result.inspected >= (options.maxEntries ?? Infinity)) { result.truncated = true; break; }
      result.inspected++;
      if (!entry.isFile() || !temporaryPattern.test(entry.name) || (prefix && !entry.name.startsWith(prefix))) continue;
      try {
        const path = join(directory, entry.name), stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink() || (!prefix && stat.mtimeMs > cutoff)) continue;
        result.eligible++; result.bytes += stat.size;
        if (options.apply) { unlinkSync(path); result.removed++; result.removedBytes += stat.size; }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.failed++; }
    }
  } finally { entries.closeSync(); }
  return result;
}

/** Full streaming sweep off the synchronous publication path. Async filesystem
 * calls keep a large legacy backlog from blocking browser requests. */
export async function cleanWorkspaceTempsInBackground(directory: string, signal: AbortSignal, now = Date.now()) {
  if (signal.aborted) return;
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Temporary cleanup requires a regular managed directory.");
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (signal.aborted) break; // for-await closes the directory on cancellation.
    if (!entry.isFile() || !temporaryPattern.test(entry.name)) continue;
    try {
      const path = join(directory, entry.name), stat = await lstat(path);
      if (!signal.aborted && stat.isFile() && !stat.isSymbolicLink() && stat.mtimeMs <= now - workspaceTemporaryAge) await unlink(path);
    } catch { /* Locked/disappeared files are retried on the next sweep. */ }
  }
}

/** App-owned lifecycle: no publication, database writes or inference. Includes
 * saved/unavailable projects, and refreshes bindings before each periodic pass. */
export function startWorkspaceTemporaryCleanup(directories: () => string[], interval = workspaceTemporaryInterval) {
  const controller = new AbortController();
  let pending: Promise<void> | undefined;
  const sweep = (): Promise<void> => {
    if (controller.signal.aborted) return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
      try {
        for (const directory of directories()) {
          if (controller.signal.aborted) break;
          try { await cleanWorkspaceTempsInBackground(directory, controller.signal); }
          catch { /* Missing/offline/conflicting folders must not affect the app. */ }
        }
      } catch { /* A closing store may no longer supply bindings. */ }
    })().finally(() => { pending = undefined; });
    return pending;
  };
  const timer = setInterval(() => { void sweep(); }, interval); timer.unref();
  void sweep();
  return { sweep, close: async () => { clearInterval(timer); controller.abort(); await pending; } };
}
