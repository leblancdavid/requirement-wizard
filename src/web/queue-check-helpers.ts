import type { Page, Locator } from "@playwright/test";
import { processingQueue, closeTechnicalViews } from "./menu-check-helpers.js";

export async function advancedQueue(page: Page) {
  const { expect } = await import("@playwright/test");
  const dialog = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  if (!await dialog.isVisible()) await processingQueue(page);
  const details = dialog.locator("details").filter({ has: page.locator(":scope > summary", { hasText: /^More actions$/ }) });
  await expect(details).toHaveCount(1);
  if (!await details.evaluate((element) => (element as HTMLDetailsElement).open)) await details.locator(":scope > summary").click();
  return dialog;
}

export async function runQueueAction(page: Page, name: string) {
  const dialog = await advancedQueue(page);
  await dialog.getByRole("button", { name, exact: true }).click();
  // Retained-input actions close the drawer themselves; older resume controls
  // keep it open. Do not wait for a close control removed by the action.
  await closeTechnicalViews(page);
}

export async function specificationActions(panel: Locator) {
  const { expect } = await import("@playwright/test");
  const details = panel.locator('details[aria-label="More specification actions"]');
  await expect(details).toHaveCount(1);
  if (!await details.evaluate((element) => (element as HTMLDetailsElement).open)) await details.locator(":scope > summary").click();
  return details;
}

export async function discoveryActions(page: Page) {
  const { expect } = await import("@playwright/test");
  const footer = page.getByRole("contentinfo", { name: "Discovery controls", exact: true });
  await expect(footer).toBeVisible();
  return footer;
}
