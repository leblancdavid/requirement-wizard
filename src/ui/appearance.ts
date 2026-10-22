export type Palette = { accent: string; background: string; surface: string; text: string };
export type Theme = { id: string; name: string; mode: "light" | "dark"; palette: Palette };
const theme = (id: string, name: string, mode: Theme["mode"], background: string, surface: string, text: string, accent: string): Theme => ({ id, name, mode, palette: { background, surface, text, accent } });
export const themes: Theme[] = [
  theme("sage", "Sage", "light", "#f6f7f3", "#ffffff", "#233b35", "#315f45"),
  theme("paper", "Paper", "light", "#f6f3ed", "#fffcf7", "#38332d", "#805636"),
  theme("cloud", "Cloud", "light", "#f2f4f7", "#ffffff", "#273345", "#526078"),
  theme("ocean", "Ocean", "light", "#eff6fa", "#ffffff", "#19394a", "#176b91"),
  theme("lavender", "Lavender", "light", "#f5f2fa", "#fefcff", "#39304d", "#73539b"),
  theme("sand", "Sand", "light", "#faf4e8", "#fffcf4", "#443926", "#856222"),
  theme("forest", "Forest", "dark", "#111e19", "#1b2b24", "#e0ebe3", "#8bc6a0"),
  theme("charcoal", "Charcoal", "dark", "#191a1d", "#24262b", "#e6e7ec", "#b0b9ce"),
  theme("midnight", "Midnight", "dark", "#111827", "#1c293c", "#e1e9f6", "#9ab9fb"),
  theme("deep-ocean", "Deep Ocean", "dark", "#0e202b", "#17323f", "#dceef4", "#79c9df"),
  theme("aubergine", "Aubergine", "dark", "#231b2c", "#32263f", "#eee3f6", "#c8a1e4"),
  theme("espresso", "Espresso", "dark", "#241c18", "#342923", "#f0e6dc", "#dbb48e"),
];
// Local system stacks keep the application offline and avoid remote font requests.
export const fonts = {
  system: { name: "System sans", value: 'system-ui, "Segoe UI", sans-serif' },
  inter: { name: "Inter / modern sans", value: 'Inter, "Segoe UI", Arial, sans-serif' },
  humanist: { name: "Humanist sans", value: '"Trebuchet MS", "Gill Sans", sans-serif' },
  serif: { name: "Book serif", value: 'Georgia, "Times New Roman", serif' },
  mono: { name: "Monospace", value: 'Consolas, "SFMono-Regular", "Liberation Mono", monospace' },
};
export type Appearance = { theme: string; custom: Palette; font: keyof typeof fonts; size: number };
export const appearanceKey = "reqwizit-appearance";
export const defaultAppearance: Appearance = { theme: "sage", custom: { ...themes[0]!.palette }, font: "inter", size: 14 };
const hex = /^#[0-9a-f]{6}$/i;
export function parseAppearance(raw: string | null): Appearance {
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (!data || typeof data !== "object") return structuredClone(defaultAppearance);
    const value = data as Record<string, unknown>;
    const custom = value.custom as Partial<Palette> | undefined;
    return {
      theme: value.theme === "custom" || themes.some((item) => item.id === value.theme) ? value.theme as string : "sage",
      custom: Object.fromEntries(Object.entries(defaultAppearance.custom).map(([key, fallback]) => [key, typeof custom?.[key as keyof Palette] === "string" && hex.test(custom[key as keyof Palette]!) ? custom[key as keyof Palette] : fallback])) as Palette,
      font: typeof value.font === "string" && Object.hasOwn(fonts, value.font) ? value.font as Appearance["font"] : "inter",
      size: typeof value.size === "number" && Number.isFinite(value.size) ? Math.round(Math.min(20, Math.max(12, value.size))) : 14,
    };
  } catch { return structuredClone(defaultAppearance); }
}
export function loadAppearance(): Appearance {
  try { return parseAppearance(localStorage.getItem(appearanceKey)); } catch { return structuredClone(defaultAppearance); }
}
function rgb(color: string) { return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)); }
export function mix(a: string, b: string, amount: number): string {
  const other = rgb(b);
  return `#${rgb(a).map((channel, index) => Math.round(channel * (1 - amount) + other[index]! * amount).toString(16).padStart(2, "0")).join("")}`;
}
function luminance(color: string) {
  const channels = rgb(color).map((channel) => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
}
export function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
export function paletteFor(value: Appearance): Palette { return value.theme === "custom" ? value.custom : themes.find((item) => item.id === value.theme)!.palette; }
export function themeTokens(palette: Palette) {
  const { accent, background, surface, text } = palette;
  const dark = luminance(background) < .2;
  const onAccent = contrast(accent, "#ffffff") >= contrast(accent, "#111111") ? "#ffffff" : "#111111";
  const sidebar = dark ? mix(background, "#000000", .2) : mix(accent, "#111b18", .72);
  return {
    "--background": background, "--surface": surface, "--text": text, "--accent": accent,
    "--muted": mix(text, surface, .25), "--border": mix(surface, text, .20),
    "--soft": mix(surface, accent, .08), "--selected": mix(surface, accent, .16),
    "--accent-hover": mix(accent, onAccent === "#ffffff" ? "#000000" : "#ffffff", .12), "--on-accent": onAccent,
    "--sidebar": sidebar, "--sidebar-text": "#eff3f0", "--sidebar-muted": mix(sidebar, "#ffffff", .7),
    "--sidebar-hover": mix(sidebar, "#ffffff", .1), "--sidebar-border": mix(sidebar, "#ffffff", .3),
    "--success": dark ? "#a7d9b1" : "#34613e", "--success-bg": mix(surface, "#64a879", .12),
    "--warning": dark ? "#f0cf90" : "#785319", "--warning-bg": mix(surface, "#d7a64c", .14),
    "--danger": dark ? "#f4b4a9" : "#933e30", "--danger-bg": mix(surface, "#d87a62", .12),
    "--shadow": dark ? "#00000066" : "#182c2220", "color-scheme": dark ? "dark" : "light",
  };
}
export function applyAppearance(value: Appearance) {
  const root = document.documentElement;
  const tokens = themeTokens(paletteFor(value));
  for (const [key, token] of Object.entries(tokens)) root.style.setProperty(key, token);
  root.style.setProperty("--font-family", fonts[value.font].value);
  root.style.setProperty("--font-size", `${value.size}px`);
  root.dataset.theme = value.theme;
  if (window.reqwizitDesktop?.titleBarOverlay) {
    void window.reqwizitDesktop.setTitleBarColors(tokens["--accent"], tokens["--on-accent"]).catch(() => { /* Native controls retain their previous safe colors. */ });
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", paletteFor(value).background);
}
