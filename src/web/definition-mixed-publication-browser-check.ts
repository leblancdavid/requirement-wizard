import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mixedPublicationFixture } from "../storage/definition-mixed-publication-fixture.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test"), browser = await chromium.launch();
try {
  for (const mode of ["normal", "recovery", "race"] as const) {
    const f = await mixedPublicationFixture(), jobs = f.store.jobs(f.p.id), workflow = f.store.workflow(f.p.id), maintenance = f.store.maintenance(f.p.id);
    let calls = 0;
    const app = await startApp({ store: f.store, port: 0,
      catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
      adapter: { async analyze() { calls++; assert.fail("No model requests authorized by review/apply"); } } });
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), diagnose = browserDiagnostics(page);
    try {
      let saves = 0, applies = 0;
      page.on("request", (r) => { if (r.url().endsWith("/definition-mixed-save")) saves++; if (r.url().endsWith("/definition-mixed-apply")) applies++; });
      await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: f.p.name, exact: true }).click();
      await page.getByRole("button", { name: /Overall progress/ }).click();
      const dialog = page.getByRole("dialog", { name: "Project progress", exact: true });
      const disclosure = dialog.getByText("Check mixed original findings (pilot)", { exact: true }); await disclosure.focus(); await page.keyboard.press("Enter");
      const controls = dialog.getByRole("region", { name: "Mixed review controls", exact: true });
      await controls.getByLabel("Mixed review area", { exact: true }).selectOption("orders");
      const history = controls.getByRole("region", { name: "Mixed reviewed findings history", exact: true });
      const previewButton = history.getByRole("button", { name: "Preview mixed findings for review", exact: true }); await expect(previewButton).toBeDisabled();
      assert.equal(calls, 0); assert.equal(saves, 0); assert.equal(applies, 0);
      await controls.getByRole("button", { name: "Load latest mixed review", exact: true }).click();
      await previewButton.click();
      const preview = history.getByRole("region", { name: "Mixed reviewed-content preview", exact: true });
      await expect(preview).toContainText("different finding (unknown → partial)"); await expect(preview).toContainText("Retention affects recovery <script>literal</script>");
      assert.equal(await preview.locator("script").count(), 0);
      const ack = preview.getByRole("checkbox", { name: "I reviewed these exact original findings and complete scoped concerns; this is not permission to apply", exact: true });
      const save = preview.getByRole("button", { name: "Save reviewed mixed findings", exact: true }); await expect(save).toBeDisabled(); await ack.check();
      if (mode === "normal") await page.route("**/definition-mixed-save", async (route) => { const response = await route.fetch(); assert.equal(response.status(), 200);
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected lost save acknowledgement" }) }); }, { times: 1 });
      await save.click();
      const saved = history.getByRole("region", { name: "Saved mixed content review", exact: true });
      if (mode === "normal") {
        await expect(history.getByRole("alert")).toContainText("no automatic replay"); await expect(save).toBeDisabled();
        await history.getByRole("button", { name: "Load saved mixed reviews", exact: true }).click();
        await history.getByRole("button", { name: /Open mixed review/ }).click(); assert.equal(saves, 1);
      }
      await expect(saved).toContainText("This acknowledgement did not publish findings");
      const applyRegion = saved.getByRole("region", { name: "Apply reviewed mixed findings", exact: true });
      const eligibility = applyRegion.getByRole("button", { name: "Check mixed apply eligibility", exact: true });
      await expect(applyRegion.getByRole("checkbox")).toHaveCount(0);
      assert.deepEqual(f.store.get(f.p.id), f.p); assert.equal(applies, 0); assert.equal(calls, 0);
      await eligibility.click(); await expect(applyRegion).toContainText("Proposed confidence: low");
      const consent = applyRegion.getByRole("checkbox", { name: "Apply these exact mixed findings as the current assessment; no product approvals or AI calls", exact: true });
      const apply = applyRegion.getByRole("button", { name: "Apply reviewed mixed findings", exact: true });
      await expect(consent).not.toBeChecked(); await expect(apply).toBeDisabled(); await consent.check();
      if (mode === "recovery") {
        await page.route("**/definition-mixed-apply", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected pre-commit failure" }) }), { times: 1 });
        await apply.click(); await expect(applyRegion.getByRole("alert")).toContainText("No automatic retry"); assert.deepEqual(f.store.get(f.p.id), f.p);
        const count = applies; await eligibility.click(); assert.equal(applies, count); await expect(consent).not.toBeChecked(); await expect(apply).toBeDisabled(); await consent.check();
        await page.route("**/definition-mixed-apply", async (route) => {
          const response = await route.fetch(); assert.equal(response.status(), 200);
          assert.equal((await response.json()).status, "applied");
          await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected lost committed response" }) });
        }, { times: 1 });
      }
      if (mode === "race") await page.route("**/definition-mixed-apply", async (route) => {
        f.store.note(f.p.id, f.p.revision, "Concurrent human product edit", "inbox"); await route.continue();
      }, { times: 1 });
      await apply.click();
      if (mode === "race") {
        await expect(applyRegion.getByRole("alert")).toContainText("No automatic retry");
        assert.equal(f.store.get(f.p.id).revision, f.p.revision + 1); assert.deepEqual(f.store.get(f.p.id).assessments, f.p.assessments);
        const count = applies; await eligibility.click(); assert.equal(applies, count); await expect(applyRegion.getByRole("checkbox")).toHaveCount(0);
      } else {
        if (mode === "recovery") {
          await expect(applyRegion.getByRole("alert")).toContainText("No automatic retry");
          const count = applies; await eligibility.click(); assert.equal(applies, count);
        }
        await expect(applyRegion).toContainText(`Mixed findings applied at project version ${f.p.revision + 1}`);
        const p = f.store.get(f.p.id), a = p.assessments.find((a) => a.epicID === "orders")!;
        assert.equal(p.revision, f.p.revision + 1); assert.equal(a.confidence, "low");
        const original = f.store.inspectDefinitionMixedReview(f.p.id, { jobID: f.completed.job.id }); if (original.status !== "recorded") assert.fail();
        assert.deepEqual(a.checks, original.assembly.findings.map((f) => f.originalFinding));
        assert.deepEqual(p.requirements, f.p.requirements); assert.deepEqual(p.sources, f.p.sources);
      }
      assert.deepEqual(f.store.jobs(f.p.id), jobs); assert.deepEqual(f.store.workflow(f.p.id), workflow); assert.deepEqual(f.store.maintenance(f.p.id), maintenance); assert.equal(calls, 0);
      const beforeReload = applies; await page.reload(); await page.getByRole("button", { name: /Overall progress/ }).click(); await disclosure.click();
      await controls.getByLabel("Mixed review area", { exact: true }).selectOption("orders");
      await history.getByRole("button", { name: "Load saved mixed reviews", exact: true }).click(); await history.getByRole("button", { name: /Open mixed review/ }).click();
      await eligibility.click(); assert.equal(applies, beforeReload); assert.equal(calls, 0);
      if (mode !== "race") await expect(applyRegion).toContainText("Mixed findings applied at project version"); else await expect(applyRegion.getByRole("checkbox")).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 }); await saved.scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.ok((await eligibility.boundingBox())!.height >= 44);
      await page.screenshot({ path: `.reqwizit-state/browser-mixed-publication-${mode}-mobile.png`, fullPage: true });
      console.log(`Mixed publication browser passed (${mode}): exact review preview/save/history, separate unchecked apply consent, durable receipt inspection without replay, original provenance, low confidence, reload/mobile and no model calls.`);
    } catch (e) { await diagnose(`.reqwizit-state/browser-mixed-publication-${mode}-failure`); throw e; }
    finally { await page.close(); await app.close(); f.cleanup(); }
  }
} finally { await browser.close(); }
