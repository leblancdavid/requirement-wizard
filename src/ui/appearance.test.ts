import assert from "node:assert/strict";
import { test } from "node:test";
import { contrast, defaultAppearance, parseAppearance, themes, themeTokens } from "./appearance.js";

test("appearance preferences recover from corrupt, outdated, or hostile storage", () => {
  for (const raw of [null, "{broken", "null", "5", "[]"]) assert.deepEqual(parseAppearance(raw), defaultAppearance);
  assert.deepEqual(parseAppearance(JSON.stringify({ theme: "removed", font: "toString", size: 500, custom: { accent: "url(bad)", surface: null, text: "#123456" } })), {
    ...defaultAppearance, size: 20, custom: { ...defaultAppearance.custom, text: "#123456" },
  });
  assert.equal(parseAppearance('{"size":1}').size, 12);
  assert.equal(parseAppearance('{"size":15.6}').size, 16);
  const original = { theme: "custom", font: "serif", size: 18, custom: { accent: "#abcdef", background: "#101010", surface: "#202020", text: "#eeeeee" } };
  assert.deepEqual(parseAppearance(JSON.stringify(original)), original);
});

test("twelve distinct presets have readable body, secondary, accent, and status colors", () => {
  assert.equal(new Set(themes.map((item) => item.id)).size, 12);
  assert.equal(themes.filter((item) => item.mode === "light").length, 6);
  assert.equal(themes.filter((item) => item.mode === "dark").length, 6);
  for (const preset of themes) {
    const tokens = themeTokens(preset.palette);
    assert.equal(tokens["color-scheme"], preset.mode);
    for (const bg of [preset.palette.background, preset.palette.surface]) {
      assert.ok(contrast(preset.palette.text, bg) >= 4.5, `${preset.name} body`);
      assert.ok(contrast(tokens["--muted"], bg) >= 4.5, `${preset.name} muted`);
      assert.ok(contrast(preset.palette.accent, bg) >= 4.5, `${preset.name} accent`);
    }
    assert.ok(contrast(preset.palette.accent, tokens["--on-accent"]) >= 4.5, `${preset.name} button`);
    for (const status of ["success", "warning", "danger"] as const) assert.ok(contrast(tokens[`--${status}`], tokens[`--${status}-bg`]) >= 4.5, `${preset.name} ${status}`);
  }
});
