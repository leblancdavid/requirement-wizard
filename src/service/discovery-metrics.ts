import { performance } from "node:perf_hooks";
import type { ContextPack } from "../core/context.js";
import { contextDiagnostics, type DiscoveryMetrics, type PlanningProgress } from "../core/discovery-diagnostics.js";

/** Bounded metadata only. Saved before inference so interruption cannot look like zero calls. */
export class DiscoveryMeasurement {
  readonly value: DiscoveryMetrics = { format: 1, state: "recording", elapsedMs: 0, planningMs: null,
    planningDecisions: null, initialContext: null, requests: [] };
  private readonly started: number;
  private lastRequestEnd?: number;
  private persistenceMs = 0;
  constructor(private readonly save: (value: DiscoveryMetrics) => void, private readonly now = () => performance.now()) {
    this.started = this.now(); this.checkpoint();
  }
  bookkeeping<T>(phase: keyof NonNullable<DiscoveryMetrics["bookkeepingMs"]>, run: () => T): T {
    const start = this.now();
    try { return run(); } finally {
      this.value.bookkeepingMs ??= {};
      this.value.bookkeepingMs[phase] = (this.value.bookkeepingMs[phase] ?? 0) + this.now() - start;
    }
  }
  /** Synchronous definition phases; no extra persistence per local probe. */
  local<T>(phase: keyof NonNullable<DiscoveryMetrics["definitionLocalMs"]>, run: () => T): T {
    const start = performance.now();
    try { return run(); } finally {
      this.value.definitionLocalMs ??= {};
      this.value.definitionLocalMs[phase] = (this.value.definitionLocalMs[phase] ?? 0) + performance.now() - start;
    }
  }
  /** Synchronous saved-input work only; no extra writes or response contents. */
  submissionLocal<T>(phase: keyof NonNullable<DiscoveryMetrics["submissionLocalMs"]>, run: () => T): T {
    const start = performance.now();
    try { return run(); } finally {
      this.value.submissionLocalMs ??= {};
      this.value.submissionLocalMs[phase] = (this.value.submissionLocalMs[phase] ?? 0) + performance.now() - start;
    }
  }
  private checkpoint() {
    this.value.bookkeepingMs ??= {};
    // Completed earlier writes only. The final measurement write cannot include
    // its own cost without recursively writing another measurement.
    this.value.bookkeepingMs.metricsPersistence = this.persistenceMs;
    this.value.elapsedMs = this.now() - this.started;
    const start = this.now();
    try { this.save(this.value); } finally { this.persistenceMs += this.now() - start; }
  }
  preparing(progress: PlanningProgress) { this.value.planningProgress = progress; this.checkpoint(); }
  planned(context?: ContextPack, decisions?: DiscoveryMetrics["planningDecisions"]) {
    if (this.value.planningMs !== null) return; // Later evidence-load failures are not initial planning.
    this.value.planningMs = this.now() - this.started;
    this.value.initialContext = context ? contextDiagnostics(context) : null;
    this.value.planningDecisions = decisions ?? null;
    this.checkpoint();
  }
  async request(run: () => Promise<unknown>, context: ContextPack, signal: AbortSignal): Promise<unknown> {
    const request: DiscoveryMetrics["requests"][number] = { durationMs: null, outcome: "in-flight", response: null,
      context: this.bookkeeping("requestContext", () => contextDiagnostics(context)) };
    this.value.requests.push(request); this.checkpoint();
    const start = this.now();
    request.gapBeforeMs = start - (this.lastRequestEnd ?? this.started);
    try {
      const raw = await run();
      request.outcome = "returned";
      request.response = raw && typeof raw === "object" ? "retrieveEvidence" in raw || "clarificationEvidence" in raw || "submissionEvidence" in raw || "answerGroupEvidence" in raw || "definitionEvidence" in raw ? "load" : "searchEvidence" in raw ? "search"
        : "reviewBlocked" in raw || "definitionBlocked" in raw || "clarificationBlocked" in raw || "submissionBlocked" in raw || "answerGroupBlocked" in raw ? "blocked"
          : "summary" in raw || "jointReview" in raw || "guardrailVerdict" in raw || "definitionVerdict" in raw || "definitionAssessment" in raw || "definitionUpdate" in raw
          || "clarificationRead" in raw || "clarificationVerdict" in raw || "submissionKeep" in raw || "submissionCheck" in raw
          || "answerGroupDraft" in raw || "answerGroupRepair" in raw || "answerGroupKeep" in raw || "answerGroupCheck" in raw ? "analysis" : "other" : "other";
      return raw;
    } catch (error) { request.outcome = signal.aborted ? "cancelled" : "failed"; throw error; }
    finally { this.lastRequestEnd = this.now(); request.durationMs = this.lastRequestEnd - start; this.checkpoint(); }
  }
  finish() {
    if (this.value.state === "finished") return;
    this.value.planningMs ??= this.now() - this.started;
    if (this.lastRequestEnd !== undefined) this.value.afterLastRequestMs = this.now() - this.lastRequestEnd;
    this.value.state = "finished"; this.checkpoint();
  }
}
