import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Reuse pre-rename installations in place, including protected credentials. */
export function defaultDataDirectory(base = process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share")): string {
  const current = join(base, "reqwizit");
  const legacy = join(base, "requirement-wizard");
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}
