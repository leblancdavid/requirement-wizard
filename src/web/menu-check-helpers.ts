import type { Page } from "@playwright/test";

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
