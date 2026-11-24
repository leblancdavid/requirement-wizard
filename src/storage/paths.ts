import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { databaseSchemaVersion } from "./schema-version.js";

function projectStoreState(directory: string): "missing" | "empty" | "populated" | "unreadable" {
  const path = join(directory, "projects.sqlite");
  if (!existsSync(path)) return "missing";
  let database: Database.Database | undefined;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true, timeout: 1000 });
    if (Number(database.pragma("user_version", { simple: true })) > databaseSchemaVersion) return "unreadable";
    // Read identity presence only, not project JSON/history or credential stores.
    return database.prepare("SELECT 1 FROM projects LIMIT 1").get() ? "populated" : "empty";
  } catch { return "unreadable"; }
  finally { database?.close(); }
}

/** Auxiliary helper/profile directories must not mask an existing project store. */
export function defaultDataDirectory(base = process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share")): string {
  const current = join(base, "reqwizit");
  const legacy = join(base, "requirement-wizard");
  const currentStore = projectStoreState(current);
  if (currentStore === "populated" || currentStore === "unreadable") return current;
  const legacyStore = projectStoreState(legacy);
  if (legacyStore === "populated" || legacyStore === "unreadable" || (currentStore === "missing" && legacyStore !== "missing")) return legacy;
  if (!existsSync(join(current, "providers")) && existsSync(join(legacy, "providers"))) return legacy;
  if (currentStore === "empty") return current;
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}

/** Correcting the app root must not force reauthorization of the known helper store. */
export function helperDataDirectory(directory: string, base = process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share")): string {
  const legacy = join(base, "requirement-wizard"), current = join(base, "reqwizit");
  const equal = (a: string, b: string) => process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
  const marker = (root: string) => join(root, "embedded-auth-live-qualification", "helper-state.json");
  if (equal(directory, legacy) && !existsSync(marker(legacy)) && existsSync(marker(current))) return current;
  return directory;
}
