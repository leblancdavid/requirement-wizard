import { join } from "node:path";

/** Establish isolated SDK roots before module import. No provider/config inheritance. */
export function helperEnvironment(root: string, inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const allowed = new Set(["path", "systemroot", "windir", "comspec", "pathext", "systemdrive"]);
  for (const [key, value] of Object.entries(inherited)) if (allowed.has(key.toLowerCase()) && value !== undefined) env[key] = value;
  return { ...env, HOME: join(root, "home"), USERPROFILE: join(root, "home"),
    APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_DATA_HOME: join(root, "data"), XDG_CACHE_HOME: join(root, "cache"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_TEST_HOME: join(root, "home"), OPENCODE_CONFIG_DIR: join(root, "config", "opencode"),
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    TEMP: join(root, "tmp"), TMP: join(root, "tmp"), TMPDIR: join(root, "tmp"),
    REQWIZIT_EMBEDDED_ROOT: root };
}
