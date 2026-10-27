import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

async function loadSettingsWith(stored: string | null) {
  vi.stubGlobal("localStorage", {
    getItem: () => stored,
    setItem: () => {},
  });
  vi.resetModules();
  const { settings } = await import("../../src/lib/stores/settings");
  return get(settings);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Every on/off setting, with its default.
const BOOLEANS = [
  ["closeOnEscape", true],
  ["showLineNumbers", true],
  ["syntaxHighlighting", true],
  ["autoPresentMarp", true],
  ["restoreTabsOnLaunch", true],
  ["wrapCodeBlocks", false],
  ["autoCheckUpdates", true],
  ["pagedView", false],
  ["highlightChanges", true],
  ["tabsCollapsed", false],
] as const;

describe("the stored accent color", () => {
  it("restores a saved color and drops one that is not #rrggbb", async () => {
    expect((await loadSettingsWith(JSON.stringify({ accentColor: "#7c3aed" }))).accentColor).toBe("#7c3aed");
    expect((await loadSettingsWith(JSON.stringify({ accentColor: "purple" }))).accentColor).toBe("#0891b2");
    expect((await loadSettingsWith(null)).accentColor).toBe("#0891b2");
  });
});

describe.each(BOOLEANS)("the stored %s setting", (key, fallback) => {
  it("defaults when nothing is stored", async () => {
    expect((await loadSettingsWith(null))[key]).toBe(fallback);
  });

  it("restores a saved choice either way", async () => {
    for (const value of [true, false]) {
      const stored = JSON.stringify({ [key]: value });
      expect((await loadSettingsWith(stored))[key]).toBe(value);
    }
  });

  it("falls back to the default for anything that is not a boolean", async () => {
    // A hand-edited "false" is truthy, and null is falsy: read as-is, either
    // one flips the setting the wrong way.
    for (const junk of ["false", "true", null, 0, 1, "", {}]) {
      const stored = JSON.stringify({ [key]: junk });
      expect((await loadSettingsWith(stored))[key]).toBe(fallback);
    }
  });
});
