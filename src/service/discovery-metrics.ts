import { performance } from "node:perf_hooks";
import type { ContextPack } from "../core/context.js";
import { contextDiagnostics, type DiscoveryMetrics, type PlanningProgress } from "../core/discovery-diagnostics.js";

/** Bounded metadata only. Saved before inference so interruption cannot look like zero calls. */
export class DiscoveryMeasurement {
  readonly value: DiscoveryMetrics = { format: 1, state: "recording", elapsedMs: 0, planningMs: null,
    planningDecisions: null, initialContext: null, requests: [] };
  private readonly started = performance.now();
  constructor(private readonly save: (value: DiscoveryMetrics) => void) { this.checkpoint(); }
  /** Synchronous definition phases; no extra persistence per local probe. */
  local<T>(phase: keyof NonNullable<DiscoveryMetrics["definitionLocalMs"]>, run: () => T): T {
    const start = performance.now();
    try { return run(); } finally {
      this.value.definitionLocalMs ??= {};
      this.value.definitionLocalMs[phase] = (this.value.definitionLocalMs[phase] ?? 0) + performance.now() - start;
    }
  }
  private checkpoint() { this.value.elapsedMs = performance.now() - this.started; this.save(this.value); }
  preparing(progress: PlanningProgress) { this.value.planningProgress = progress; this.checkpoint(); }
  planned(context?: ContextPack, decisions?: DiscoveryMetrics["planningDecisions"]) {
    if (this.value.planningMs !== null) return; // Later evidence-load failures are not initial planning.
    this.value.planningMs = performance.now() - this.started;
    this.value.initialContext = context ? contextDiagnostics(context) : null;
    this.value.planningDecisions = decisions ?? null;
    this.checkpoint();
  }
  async request(run: () => Promise<unknown>, context: ContextPack, signal: AbortSignal): Promise<unknown> {
    const request: DiscoveryMetrics["requests"][number] = { durationMs: null, outcome: "in-flight", response: null, context: contextDiagnostics(context) };
    this.value.requests.push(request); this.checkpoint();
    const start = performance.now();
    try {
      const raw = await run();
      request.outcome = "returned";
      request.response = raw && typeof raw === "object" ? "retrieveEvidence" in raw || "clarificationEvidence" in raw || "submissionEvidence" in raw ? "load" : "searchEvidence" in raw ? "search"
        : "reviewBlocked" in raw || "definitionBlocked" in raw || "clarificationBlocked" in raw || "submissionBlocked" in raw ? "blocked"
          : "summary" in raw || "jointReview" in raw || "guardrailVerdict" in raw || "definitionVerdict" in raw || "definitionAssessment" in raw || "definitionUpdate" in raw || "definitionEvidence" in raw
            || "clarificationRead" in raw || "clarificationVerdict" in raw || "submissionKeep" in raw || "submissionCheck" in raw ? "analysis" : "other" : "other";
      return raw;
    } catch (error) { request.outcome = signal.aborted ? "cancelled" : "failed"; throw error; }
    finally { request.durationMs = performance.now() - start; this.checkpoint(); }
  }
  finish() {
    if (this.value.state === "finished") return;
    this.value.planningMs ??= performance.now() - this.started;
    this.value.state = "finished"; this.checkpoint();
  }
}
