import type { Page } from "@playwright/test";

export async function advancedQueue(page: Page) {
  const { expect } = await import("@playwright/test");
  const dialog = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  if (!await dialog.isVisible()) await page.locator(".topbar .queue-trigger").click();
  const details = dialog.locator("details").filter({ has: page.locator(":scope > summary", { hasText: /^Advanced actions$/ }) });
  await expect(details).toHaveCount(1);
  if (!await details.evaluate((element) => (element as HTMLDetailsElement).open)) await details.locator(":scope > summary").click();
  return dialog;
}

export async function runQueueAction(page: Page, name: string) {
  const dialog = await advancedQueue(page);
  await dialog.getByRole("button", { name, exact: true }).click();
  await dialog.getByRole("button", { name: "Close processing queue", exact: true }).click();
}
