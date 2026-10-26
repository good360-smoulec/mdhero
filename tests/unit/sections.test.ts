import { describe, expect, it } from "vitest";
import { collapseToLevel, enclosingHeadings, hiddenItems, type SectionItem } from "../../src/lib/utils/sections";

// # A / intro / ## B / text / ### C / text / ## D / text / # E / text
const doc: SectionItem[] = [
  { level: 1, id: "a" },
  { level: null },
  { level: 2, id: "b" },
  { level: null },
  { level: 3, id: "c" },
  { level: null },
  { level: 2, id: "d" },
  { level: null },
  { level: 1, id: "e" },
  { level: null },
];

const hiddenIds = (collapsed: string[]) =>
  hiddenItems(doc, new Set(collapsed)).flatMap((h, i) => (h ? [i] : []));

describe("hiddenItems", () => {
  it("hides nothing when nothing is collapsed", () => {
    expect(hiddenIds([])).toEqual([]);
  });

  it("hides a section's text and subsections up to the next heading at its level", () => {
    expect(hiddenIds(["b"])).toEqual([3, 4, 5]);
  });

  it("hides everything under a top-level heading up to the next one", () => {
    expect(hiddenIds(["a"])).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps a collapsed subsection's state while its parent is collapsed too", () => {
    expect(hiddenIds(["a", "c"])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(hiddenIds(["c"])).toEqual([5]);
  });

  it("ends a section at a heading of a higher level, even when levels are skipped", () => {
    const skipped: SectionItem[] = [{ level: 3, id: "x" }, { level: null }, { level: 1, id: "y" }, { level: null }];
    expect(hiddenItems(skipped, new Set(["x"]))).toEqual([false, true, false, false]);
  });
});

describe("collapseToLevel", () => {
  it("collapses every heading at the level or deeper", () => {
    expect(collapseToLevel(doc, 2)).toEqual(["b", "c", "d"]);
    expect(collapseToLevel(doc, 1)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("shows headings down to the level and hides the rest", () => {
    expect(hiddenItems(doc, new Set(collapseToLevel(doc, 2)))).toEqual([
      false, false, false, true, true, true, false, true, false, false,
    ]);
  });
});

describe("enclosingHeadings", () => {
  it("lists the sections a block sits in, innermost first", () => {
    expect(enclosingHeadings(doc, 5)).toEqual(["c", "b", "a"]);
  });

  it("lists a heading's parents but not the heading itself", () => {
    expect(enclosingHeadings(doc, 4)).toEqual(["b", "a"]);
    expect(enclosingHeadings(doc, 0)).toEqual([]);
  });
});
