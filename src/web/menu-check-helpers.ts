import type { Page } from "@playwright/test";

/** Historical runners explicitly exercise retained advanced APIs. Normal Play
 * tests must not install this helper: details are collapsed for users. */
export async function legacyWorkflowDetails(page: Page) {
  const toggle = page.getByRole("dialog", { name: "Processing & queue", exact: true }).locator("details:not([open]) > summary").filter({ hasText: /^Processing details and advanced actions$/ });
  await page.addLocatorHandler(toggle, async () => { await toggle.click(); });
  return () => page.removeLocatorHandler(toggle);
}

export async function applicationMenu(page: Page) {
  const toggle = page.getByRole("button", { name: "Application menu", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  return page.getByRole("navigation", { name: "Application", exact: true });
}

export async function workspaceMenu(page: Page) {
  const menu = await applicationMenu(page);
  const recent = menu.getByRole("button", { name: "Recent workspaces", exact: true });
  if (await recent.getAttribute("aria-expanded") !== "true") await recent.click();
  return menu;
}

export async function assessmentTools(page: Page) {
  const tools = await technicalProcessing(page);
  await tools.getByRole("button", { name: "Open advanced assessment tools", exact: true }).click();
  return page.getByRole("dialog", { name: "Advanced assessment tools", exact: true });
}

/** Explicit opt-in navigation for tests of retained technical controls. Never
 * install global UI handlers that reopen old screens during ordinary tests. */
export async function technicalProcessing(page: Page) {
  const logs = page.getByRole("dialog", { name: "Logs", exact: true });
  if (!await logs.isVisible()) await (await applicationMenu(page)).getByRole("button", { name: "Logs", exact: true }).click();
  const details = logs.locator("details").filter({ has: page.locator(":scope > summary", { hasText: /^Technical processing controls and retained preferences$/ }) });
  if (!await details.evaluate(element => (element as HTMLDetailsElement).open)) await details.locator(":scope > summary").click();
  return details;
}

export async function processingQueue(page: Page) {
  const queue = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  if (!await queue.isVisible()) await (await technicalProcessing(page)).locator(".queue-trigger").click();
  return queue;
}

export async function closeTechnicalViews(page: Page) {
  const queue = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  if (await queue.isVisible()) await queue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  const logs = page.getByRole("dialog", { name: "Logs", exact: true });
  if (await logs.isVisible()) await logs.getByRole("button", { name: "Close logs", exact: true }).click();
}

export async function automaticInputs(page: Page, value?: boolean) {
  const preferences = await technicalProcessing(page);
  const input = preferences.getByLabel("Automatically process saved inputs", { exact: true });
  const previous = await input.isChecked();
  if (value !== undefined) await input.setChecked(value);
  await closeTechnicalViews(page);
  return previous;
}

export async function implementationTools(page: Page) {
  return (await technicalProcessing(page)).getByRole("region", { name: "Implementation diagnostics", exact: true });
}
