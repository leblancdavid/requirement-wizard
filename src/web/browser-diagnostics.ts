import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page } from "@playwright/test";
import { safeMessage } from "../runtime/contract.js";

/** Fixture-only diagnostics: never capture headers, cookies, query strings or bodies. */
export function browserDiagnostics(page: Page) {
  const events: Array<{ kind: string; path?: string; message?: string; status?: number }> = [];
  const path = (url: string) => { try { return new URL(url).pathname; } catch { return "unknown"; } };
  const message = (text: string) => safeMessage(text).replace(/https?:\/\/[^\s)]+/g, path).slice(0, 500);
  const record = (event: typeof events[number]) => { events.push(event); if (events.length > 100) events.shift(); };
  page.on("pageerror", (error) => record({ kind: "pageerror", message: message(error.message) }));
  page.on("requestfailed", (request) => record({ kind: "requestfailed", path: path(request.url()), message: message(request.failure()?.errorText ?? "Request failed") }));
  page.on("response", (response) => {
    if (response.status() >= 400) record({ kind: "http-error", path: path(response.url()), status: response.status() });
  });
  return async (stem: string) => {
    await mkdir(dirname(stem), { recursive: true });
    await writeFile(`${stem}.json`, JSON.stringify({ pathname: path(page.url()), events,
      selectedProject: await page.evaluate(() => localStorage.getItem("reqwizit-project")),
      tabs: await page.getByRole("tab").allTextContents(),
    }, null, 2), "utf8");
    await page.screenshot({ path: `${stem}.png`, fullPage: true });
    console.error(`Browser failure diagnostics: ${stem}.json and .png`);
  };
}
