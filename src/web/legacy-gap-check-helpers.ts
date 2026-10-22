import type { Page } from "@playwright/test";

/** Exercise retained individual-check API/recovery explicitly, not the new workflow button. */
export async function exploreLegacyGaps(page: Page, project: { id: string; revision: number }, experimental = false, targeted = false) {
  const focusEpicID = await page.getByLabel("Filter by feature").inputValue();
  const questionTarget = Number(await page.getByRole("spinbutton", { name: "Questions ready", exact: true }).inputValue());
  await page.evaluate(async ({ project, focusEpicID, questionTarget, experimental, targeted }) => {
    const token = document.querySelector<HTMLMetaElement>('meta[name="reqwizit-token"]')!.content;
    const response = await fetch(`/api/projects/${project.id}/analyze`, { method: "POST",
      headers: { "X-Reqwizit-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ revision: project.revision, ...(targeted ? { questionTarget } : {}), research: false,
        savedEvidencePolicy: experimental ? "prefix-aux-v1" : "prefix", ...(focusEpicID !== "all" ? { focusEpicID } : {}) }) });
    if (!response.ok) throw new Error(`Legacy discovery failed: ${await response.text()}`);
  }, { project, focusEpicID, questionTarget, experimental, targeted });
  // Unlike an app-owned action, this explicit API call does not invoke App.load().
  // Refresh before operating on continuation controls so they cannot target an older job.
  await page.reload();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption(focusEpicID);
}
