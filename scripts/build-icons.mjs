import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium } = await import("@playwright/test");

// Deterministic exports from the single SVG master; no image service or model calls.
const svg = await readFile(new URL("../src/ui/public/reqwizit.svg", import.meta.url), "utf8");
const output = new URL("../assets/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const images = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    images.push({ size, png: await page.screenshot({ omitBackground: true }) });
  }
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await writeFile(new URL("reqwizit.ico", output), Buffer.concat([header, ...images.map(({ png }) => png)]));
  await page.setViewportSize({ width: 512, height: 512 });
  await page.screenshot({ path: fileURLToPath(new URL("reqwizit.png", output)), omitBackground: true });
} finally {
  await browser.close();
}
