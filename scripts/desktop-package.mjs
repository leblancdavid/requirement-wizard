/** A staged self-dependency creates a junction back into its own build tree. */
export function validateDesktopDependencies(manifest, lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages?.[""]) throw new Error("Unsupported desktop dependency lock.");
  if (manifest.dependencies?.reqwizit) throw new Error("Desktop dependencies must not include the app itself.");
  if (JSON.stringify(manifest.dependencies) !== JSON.stringify(lock.packages[""].dependencies)) throw new Error("Desktop dependency manifest and lock differ.");
  for (const [path, entry] of Object.entries(lock.packages)) {
    if ((path && !path.startsWith("node_modules/")) || entry.link) throw new Error("Desktop dependency lock must not contain local links or external paths.");
    for (const value of Object.values(entry.dependencies ?? {}))
      if (/^(file:|link:|workspace:)/.test(value)) throw new Error("Desktop dependencies must not link to local source trees.");
  }
}
