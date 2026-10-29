import assert from "node:assert/strict";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
let calls = 0;
const errors: string[] = [];
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Editing drafts and polling must not start inference"); } },
});
const browser = await chromium.launch();
try {
  for (const mode of ["note", "change-request", "open-form"] as const) {
    let p = store.create(`Review draft ${mode}`, "Keep the current review in place", { providerID: "openai", modelID: "fixture" });
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { summary: "Draft fixture", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
      requirements: ["Save reports", "Keep audit history"].map((statement) => ({ statement, rationale: "Explicit intent", acceptance: [statement], sourceIDs: [p.sources[0]!.id], epicID: "inbox" })) });
    p = store.get(p.id);
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.addInitScript((id) => { localStorage.setItem("reqwizit-project", id); localStorage.setItem("reqwizit-auto", "false"); }, p.id);
      await page.goto(app.origin); await page.getByRole("tab", { name: /^Specification/ }).click();
      const panel = page.getByRole("region", { name: "Requirement review", exact: true });
      await panel.locator(".feature-group > summary").click();
      const edited = panel.locator(".review-card").filter({ has: page.locator(".review-card-heading strong", { hasText: "Save reports" }) });
      const other = panel.locator(".review-card").filter({ has: page.locator(".review-card-heading strong", { hasText: "Keep audit history" }) });
      await expect(edited.locator(".review-card-heading")).toHaveAttribute("aria-expanded", "true");
      const draft = edited.getByRole("textbox", { name: mode === "note" ? "Anything to add? (optional)" : "Requested changes", exact: true });
      if (mode !== "note") await edited.getByRole("button", { name: "Request changes", exact: true }).click();
      if (mode !== "open-form") await draft.fill(`Retain my ${mode} while supporting context changes`);
      const originalRequirements = structuredClone(p.requirements);
      p = store.note(p.id, p.revision, "Retain encrypted report data", "inbox");
      // Polling must actually arrive before checking that the implicit first-ready
      // selection stayed on the edited card rather than moving to the next item.
      if (mode === "open-form") {
        await page.getByText("Your original idea & recent notes", { exact: true }).click();
        await expect(page.getByText("Retain encrypted report data", { exact: true })).toBeVisible();
      } else {
        await expect(edited.getByRole("alert")).toContainText("Updated since you started reviewing");
        await expect(draft).toHaveValue(`Retain my ${mode} while supporting context changes`);
      }
      await expect(other.locator(".review-card-heading")).toHaveAttribute("aria-expanded", "false");
      await expect(edited.locator(".review-card-heading")).toHaveAttribute("aria-expanded", "true");
      await expect(draft).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (mode !== "open-form") {
        await draft.pressSequentially(" and continue editing");
        await expect(draft).toHaveValue(`Retain my ${mode} while supporting context changes and continue editing`);
      }
      assert.deepEqual(store.get(p.id).requirements, originalRequirements);
      assert.equal(store.submissions(p.id).length, 0, "Drafts are not queued decisions");
      assert.equal(store.jobs(p.id).length, 1, "Polling and editing add no model jobs");
    } finally { await page.close(); }
  }
  assert.equal(calls, 0);
  assert.deepEqual(errors, []);
  console.log("Review draft browser passed: implicitly selected notes, change-request drafts and newly opened forms stay visible through context polling; mobile editing, unchanged decisions and zero inference.");
} finally { await browser.close(); await app.close(); store.close(); }
