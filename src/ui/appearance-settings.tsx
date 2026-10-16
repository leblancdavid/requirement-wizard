import { useEffect, useState, type CSSProperties } from "react";
import { appearanceKey, applyAppearance, contrast, defaultAppearance, fonts, loadAppearance, paletteFor, parseAppearance, themes, type Appearance, type Palette } from "./appearance.js";

// Apply before the first React render, including when opening directly into a workspace.
applyAppearance(loadAppearance());
window.addEventListener("storage", (event) => {
  if (event.storageArea === localStorage && (event.key === appearanceKey || event.key === null)) applyAppearance(parseAppearance(event.key === null ? null : event.newValue));
});

export function AppearanceSettings() {
  const [value, setValue] = useState(loadAppearance);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === appearanceKey || event.key === null)) setValue(parseAppearance(event.key === null ? null : event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function update(next: Appearance) {
    setValue(next); applyAppearance(next);
    try { localStorage.setItem(appearanceKey, JSON.stringify(next)); setStorageError(false); } catch { setStorageError(true); }
  }
  const palette = paletteFor(value);
  const lowContrast = Math.min(contrast(palette.text, palette.background), contrast(palette.text, palette.surface)) < 4.5;
  return <section className="appearance-settings" aria-labelledby="appearance-heading">
    <div className="appearance-heading"><div><h2 id="appearance-heading">Appearance</h2><p>Make this workspace yours. Changes apply instantly to all projects on this device.</p></div><button type="button" className="secondary" onClick={() => update(structuredClone(defaultAppearance))}>Reset appearance</button></div>
    {(["light", "dark"] as const).map((mode) => <fieldset key={mode} className="theme-fieldset"><legend>{mode === "light" ? "Light themes" : "Dark themes"}</legend><div className="theme-grid">{themes.filter((item) => item.mode === mode).map((item) => <button key={item.id} type="button" className="theme-card" aria-pressed={value.theme === item.id} aria-label={`${item.name} theme`} onClick={() => update({ ...value, theme: item.id })}>
      <span className="theme-preview" aria-hidden="true" style={{ "--preview-bg": item.palette.background, "--preview-surface": item.palette.surface, "--preview-text": item.palette.text, "--preview-accent": item.palette.accent } as CSSProperties}><span className="preview-sidebar" /><span className="preview-content"><span /><span /><i /></span></span><span>{item.name}<span aria-hidden="true">{value.theme === item.id ? " ✓" : ""}</span></span>
    </button>)}</div></fieldset>)}
    <div className="custom-heading"><button type="button" className="secondary" aria-pressed={value.theme === "custom"} onClick={() => update({ ...value, theme: "custom" })}>Custom theme{value.theme === "custom" ? " ✓" : ""}</button><button type="button" className="quiet" disabled={value.theme === "custom"} onClick={() => update({ ...value, theme: "custom", custom: { ...palette } })}>Customize current preset</button></div>
    {value.theme === "custom" && <fieldset className="custom-colors"><legend>Custom colors</legend><p>Choose your colors. Borders, hover states, and secondary text coordinate automatically.</p><div className="color-grid">{([ ["accent", "Accent"], ["background", "Background"], ["surface", "Surface"], ["text", "Text"] ] as const).map(([key, label]) => <label key={key}>{label}<span className="color-control"><input type="color" aria-label={`${label} color`} value={value.custom[key]} onChange={(event) => update({ ...value, custom: { ...value.custom, [key]: event.target.value } as Palette })} /><code>{value.custom[key].toUpperCase()}</code></span></label>)}</div>{lowContrast && <p className="contrast-hint" role="status">Text may be difficult to read. Aim for more contrast between text and both background colors (at least 4.5:1).</p>}</fieldset>}
    <div className="typography-controls"><label>Interface font<select aria-label="Interface font" value={value.font} onChange={(event) => update({ ...value, font: event.target.value as Appearance["font"] })}>{Object.entries(fonts).map(([id, font]) => <option key={id} value={id}>{font.name}</option>)}</select><small>Uses fonts installed on your device, with local fallbacks.</small></label><label>Text size <output htmlFor="appearance-size">{value.size}px</output><input id="appearance-size" aria-label="Text size" type="range" min={12} max={20} step={1} value={value.size} onChange={(event) => update({ ...value, size: Number(event.target.value) })} /><small>12px · Compact <span>Comfortable · 20px</span></small></label></div>
    <div className="appearance-sample"><strong>Your next idea starts here.</strong><p>A comfortable space to explore questions and shape your project.</p><span className="badge accepted">Confirmed</span> <span className="badge needs-review">Needs review</span></div>
    {storageError && <p role="status">Appearance changed for this session, but browser storage is unavailable. It could not be saved for next time.</p>}
  </section>;
}
