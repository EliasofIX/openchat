// ─────────────────────────────────────────────────────────────────────────────
// Color accent — preset palette + CSS variable wiring for user-chosen tints.
// Stored as oklch strings in settings; applied on <html> via inline styles.
// ─────────────────────────────────────────────────────────────────────────────

export type AccentPreset = {
  id: string;
  label: string;
  color: string;
};

/** Arc-style vibrant presets arranged on the color wheel. */
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "red", label: "Red", color: "oklch(0.58 0.22 25)" },
  { id: "orange", label: "Orange", color: "oklch(0.68 0.19 55)" },
  { id: "yellow", label: "Yellow", color: "oklch(0.82 0.17 95)" },
  { id: "lime", label: "Lime", color: "oklch(0.78 0.2 130)" },
  { id: "green", label: "Green", color: "oklch(0.62 0.17 155)" },
  { id: "teal", label: "Teal", color: "oklch(0.62 0.14 195)" },
  { id: "blue", label: "Blue", color: "oklch(0.55 0.2 250)" },
  { id: "indigo", label: "Indigo", color: "oklch(0.5 0.2 275)" },
  { id: "purple", label: "Purple", color: "oklch(0.55 0.22 300)" },
  { id: "pink", label: "Pink", color: "oklch(0.62 0.22 350)" },
  { id: "rose", label: "Rose", color: "oklch(0.58 0.2 15)" },
  { id: "slate", label: "Slate", color: "oklch(0.52 0.04 260)" },
];

const ACCENT_CSS_PROPS = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--sidebar-primary",
  "--user-accent-soft",
  "--user-accent-border",
] as const;

function parseOklchLightness(color: string): number | null {
  const match = /oklch\(\s*([\d.]+)/i.exec(color);
  return match ? Number.parseFloat(match[1]) : null;
}

export function accentForeground(color: string): string {
  const l = parseOklchLightness(color) ?? 0.55;
  return l > 0.65 ? "oklch(0.15 0 0)" : "oklch(0.985 0 0)";
}

/** Apply or clear user accent tokens on the document root. */
export function applyColorAccent(accent: string | null): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (!accent) {
    for (const prop of ACCENT_CSS_PROPS) root.style.removeProperty(prop);
    root.classList.remove("has-color-accent");
    return;
  }

  const fg = accentForeground(accent);
  root.style.setProperty("--primary", accent);
  root.style.setProperty("--primary-foreground", fg);
  root.style.setProperty("--ring", accent);
  root.style.setProperty("--sidebar-primary", accent);
  root.style.setProperty(
    "--user-accent-soft",
    `color-mix(in oklch, ${accent} 16%, transparent)`,
  );
  root.style.setProperty(
    "--user-accent-border",
    `color-mix(in oklch, ${accent} 35%, transparent)`,
  );
  root.classList.add("has-color-accent");
}

/** Inline boot script — keep in sync with applyColorAccent(). */
export const COLOR_ACCENT_BOOT_SCRIPT = `(function(){try{var raw=localStorage.getItem('openchat:settings');if(!raw)return;var s=JSON.parse(raw);var a=s.colorAccent;if(!a)return;var m=/oklch\\(\\s*([\\d.]+)/i.exec(a);var l=m?parseFloat(m[1]):0.55;var fg=l>0.65?'oklch(0.15 0 0)':'oklch(0.985 0 0)';var r=document.documentElement;r.style.setProperty('--primary',a);r.style.setProperty('--primary-foreground',fg);r.style.setProperty('--ring',a);r.style.setProperty('--sidebar-primary',a);r.style.setProperty('--user-accent-soft','color-mix(in oklch, '+a+' 16%, transparent)');r.style.setProperty('--user-accent-border','color-mix(in oklch, '+a+' 35%, transparent)');r.classList.add('has-color-accent');}catch(e){}})();`;
