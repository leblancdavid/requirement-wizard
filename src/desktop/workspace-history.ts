import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { workspaceHistorySchema, type WorkspaceHistorySnapshot } from "../core/workspace-history.js";

/** One desktop main process owns this small ID-only file under its data-root lock. */
export class DesktopWorkspaceHistory {
  constructor(private readonly path: string) {}
  read(): WorkspaceHistorySnapshot {
    try {
      if (statSync(this.path).size > 32768) return { status: "unavailable" };
      return { status: "ready", history: workspaceHistorySchema.parse(JSON.parse(readFileSync(this.path, "utf8"))) };
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? { status: "ready", history: null } : { status: "unavailable" };
    }
  }
  save(value: unknown) {
    const history = workspaceHistorySchema.parse(value);
    const content = JSON.stringify(history) + "\n";
    if (Buffer.byteLength(content) > 32768) throw new Error("Desktop workspace history exceeds its byte bound.");
    if (this.read().status !== "ready") throw new Error("Desktop workspace history is unavailable; existing evidence was retained.");
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
      renameSync(temporary, this.path);
    } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  }
}
