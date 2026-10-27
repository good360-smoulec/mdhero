import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACCENT_PRESETS, DEFAULT_ACCENT, accentShades, accentVariables, normalizeAccent } from "../../src/lib/utils/accent";

const HEX = /^#[0-9a-f]{6}$/;

describe("the accent color", () => {
  it("defaults to the teal the app has always used", () => {
    expect(DEFAULT_ACCENT).toBe("#0891b2");
    expect(accentShades(DEFAULT_ACCENT).strong).toBe("#0e7490");
    expect(accentShades(DEFAULT_ACCENT).bright).toBe("#22d3ee");
  });

  it("matches the defaults in app.css, which apply before the setting is read", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");
    for (const [name, value] of Object.entries(accentVariables(DEFAULT_ACCENT))) {
      expect(css).toContain(`${name}: ${value};`);
    }
  });

  it("falls back to the default for anything stored that is not #rrggbb", () => {
    for (const junk of [null, 0, "", "red", "#fff", "#12345g", "url(x)", "#0891b2; color: red"]) {
      expect(normalizeAccent(junk)).toBe(DEFAULT_ACCENT);
    }
    expect(normalizeAccent("#ABCDEF")).toBe("#abcdef");
  });

  it("gives every preset and any custom color a full set of shades", () => {
    for (const color of [...ACCENT_PRESETS.map((p) => p.shades.accent), "#000000", "#ffffff", "#808080", "#ff00aa"]) {
      for (const shade of Object.values(accentShades(color))) expect(shade).toMatch(HEX);
    }
  });

  it("works out a custom color's shades: darker on hover, brighter for dark mode, pale tints", () => {
    const lightness = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return (Math.max(...c) + Math.min(...c)) / 2;
    };
    const s = accentShades("#b4235a");
    expect(s.accent).toBe("#b4235a");
    expect(lightness(s.strong)).toBeLessThan(lightness(s.accent));
    expect(lightness(s.bright)).toBeGreaterThan(lightness(s.accent));
    expect(lightness(s.soft)).toBeGreaterThan(240);
    expect(lightness(s.deep)).toBeLessThan(40);
  });

  it("writes the rgb channels for the translucent tints", () => {
    expect(accentVariables("#2563eb")["--accent-rgb"]).toBe("37 99 235");
  });
});
