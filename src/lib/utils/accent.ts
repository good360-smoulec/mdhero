/**
 * The interface accent color. Components use it through CSS variables set on
 * the root element (see `accentVariables`), in a few shades: the color itself,
 * a darker one for hover, a brighter one that reads on dark backgrounds, and
 * pale tints.
 */

export interface AccentShades {
  accent: string;
  /** Hover and pressed states of filled buttons. */
  strong: string;
  /** The accent on dark backgrounds. */
  bright: string;
  /** Text on a dark tinted background. */
  pale: string;
  /** A light tinted background. */
  soft: string;
  softBorder: string;
  /** A dark tinted background. */
  deep: string;
  /** Text on a bright fill. */
  ink: string;
}

export interface AccentPreset {
  id: string;
  shades: AccentShades;
}

const preset = (id: string, accent: string, strong: string, bright: string, pale: string, soft: string, softBorder: string, deep: string, ink: string): AccentPreset => ({
  id,
  shades: { accent, strong, bright, pale, soft, softBorder, deep, ink },
});

export const ACCENT_PRESETS: AccentPreset[] = [
  preset("teal", "#0891b2", "#0e7490", "#22d3ee", "#67e8f9", "#ecfeff", "#a5f3fc", "#0a1e2e", "#0c4a6e"),
  preset("blue", "#2563eb", "#1d4ed8", "#60a5fa", "#93c5fd", "#eff6ff", "#bfdbfe", "#0f1a2e", "#1e3a8a"),
  preset("indigo", "#4f46e5", "#4338ca", "#818cf8", "#a5b4fc", "#eef2ff", "#c7d2fe", "#15152e", "#312e81"),
  preset("violet", "#7c3aed", "#6d28d9", "#a78bfa", "#c4b5fd", "#f5f3ff", "#ddd6fe", "#1c142e", "#4c1d95"),
  preset("pink", "#db2777", "#be185d", "#f472b6", "#f9a8d4", "#fdf2f8", "#fbcfe8", "#2e1020", "#831843"),
  preset("red", "#dc2626", "#b91c1c", "#f87171", "#fca5a5", "#fef2f2", "#fecaca", "#2e1212", "#7f1d1d"),
  preset("orange", "#ea580c", "#c2410c", "#fb923c", "#fdba74", "#fff7ed", "#fed7aa", "#2e1a0e", "#7c2d12"),
  preset("green", "#16a34a", "#15803d", "#4ade80", "#86efac", "#f0fdf4", "#bbf7d0", "#0f2416", "#14532d"),
  preset("graphite", "#52525b", "#3f3f46", "#a1a1aa", "#d4d4d8", "#f4f4f5", "#e4e4e7", "#232326", "#18181b"),
];

export const DEFAULT_ACCENT = ACCENT_PRESETS[0].shades.accent;

const HEX = /^#[0-9a-f]{6}$/i;

/** A stored accent if it is a #rrggbb color, else the default. */
export function normalizeAccent(value: unknown): string {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : DEFAULT_ACCENT;
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslHex(h: number, s: number, l: number): string {
  const lc = Math.min(1, Math.max(0, l));
  const a = s * Math.min(lc, 1 - lc);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = lc - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** The shades of an accent: a preset's own, or worked out from any other color. */
export function accentShades(color: string): AccentShades {
  const accent = normalizeAccent(color);
  const known = ACCENT_PRESETS.find((p) => p.shades.accent === accent);
  if (known) return known.shades;
  const [h, s, l] = toHsl(toRgb(accent));
  return {
    accent,
    strong: hslHex(h, s, l - 0.08),
    bright: hslHex(h, s, Math.max(l + 0.15, 0.6)),
    pale: hslHex(h, s, Math.max(l + 0.25, 0.75)),
    soft: hslHex(h, s, 0.97),
    softBorder: hslHex(h, s, 0.86),
    deep: hslHex(h, Math.min(s, 0.5), 0.12),
    ink: hslHex(h, s, Math.min(l, 0.25)),
  };
}

/** CSS custom properties for an accent, as set on the root element. */
export function accentVariables(color: string): Record<string, string> {
  const s = accentShades(color);
  return {
    "--accent": s.accent,
    "--accent-strong": s.strong,
    "--accent-bright": s.bright,
    "--accent-pale": s.pale,
    "--accent-soft": s.soft,
    "--accent-soft-border": s.softBorder,
    "--accent-deep": s.deep,
    "--accent-ink": s.ink,
    "--accent-rgb": toRgb(s.accent).join(" "),
    "--accent-bright-rgb": toRgb(s.bright).join(" "),
  };
}
