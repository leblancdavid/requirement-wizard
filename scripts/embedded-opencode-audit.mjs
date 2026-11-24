import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

// Audit only an explicit isolated npm installation; never inspect app/provider data.
export async function auditInstallation(directory, nodeVersion, loadSemver) {
  let text, lock;
  try {
    text = await readFile(join(directory, "package-lock.json"), "utf8");
    lock = JSON.parse(text);
    if (![2, 3].includes(lock.lockfileVersion) || !lock.packages || typeof lock.packages !== "object" || Array.isArray(lock.packages)) throw new Error();
  } catch {
    return { status: "unknown", category: "missing-or-unsupported-lockfile" };
  }
  const digest = createHash("sha256").update(text).digest("hex");
  if (typeof lock.packages["node_modules/@opencode/sdk"]?.version !== "string")
    return { status: "unknown", category: "missing-sdk-lock-entry", lockSha256: digest };
  let semver;
  try {
    // Diagnostic dependency supplied by the isolated installation, not an undeclared
    // production dependency. Missing tooling is unknown, never treated as compatible.
    const require = createRequire(join(directory, "package.json"));
    semver = loadSemver ? loadSemver() : require(join(directory, "node_modules", "semver"));
    if (!semver.valid(nodeVersion)) throw new Error();
  } catch {
    return { status: "unknown", category: "semver-tool-unavailable", lockSha256: digest };
  }
  const failures = [], unknown = [], licenses = Object.create(null);
  let installedPackages = 0, checkedEngines = 0, omittedOptionalPackages = 0;
  for (const [path, saved] of Object.entries(lock.packages)) {
    if (path === "") continue;
    if (!path.startsWith("node_modules/") || path.split("/").some(part => !part || part === "." || part === ".." || /[:\\]/.test(part)) || saved?.link) {
      return { status: "unknown", category: "unsupported-lockfile-entry", lockSha256: digest };
    }
    let metadata;
    try { metadata = JSON.parse(await readFile(join(directory, path, "package.json"), "utf8")); }
    catch (error) {
      if (error.code === "ENOENT" && saved?.optional) { omittedOptionalPackages++; continue; }
      unknown.push({ package: path, reason: "missing-or-invalid-package-manifest" }); continue;
    }
    installedPackages++;
    if (!metadata.version || metadata.version !== saved?.version) {
      unknown.push({ package: path, reason: "installed-version-does-not-match-lock" }); continue;
    }
    const license = typeof metadata.license === "string" ? metadata.license : "UNDECLARED";
    licenses[license] = (licenses[license] ?? 0) + 1;
    const range = metadata.engines?.node;
    if (range === undefined) continue;
    if (typeof range !== "string" || semver.validRange(range) === null) {
      unknown.push({ package: path, reason: "unsupported-node-engine-range" }); continue;
    }
    checkedEngines++;
    if (!semver.satisfies(nodeVersion, range)) failures.push({ package: metadata.name ?? path, version: metadata.version, node: range });
  }
  return { status: unknown.length ? "unknown" : failures.length ? "blocked" : "passed",
    lockSha256: digest, installedPackages, checkedEngines, omittedOptionalPackages,
    failures, unknown, licenses };
}
