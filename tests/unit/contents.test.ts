import { describe, it, expect } from "vitest";
import {
  NUMBERING_PRESETS,
  clampTocDepth,
  formatCounter,
  formatNumber,
  parseNumbering,
  resolveContents,
  type Numbering,
} from "../../src/lib/utils/contents";

function numbered(format: string, ...counters: number[][]): (string | null)[] {
  const parsed = parseNumbering(format) as Numbering;
  return counters.map((c) => formatNumber(parsed, c));
}

describe("numbering formats", () => {
  it("numbers decimal paths", () => {
    expect(numbered("1, 1.1, 1.1.1", [1], [1, 2], [2, 3, 4])).toEqual(["1", "1.2", "2.3.4"]);
  });

  it("shows only a level's own counter when its pattern has one", () => {
    expect(numbered("I, A, 1, a", [2], [2, 3], [2, 3, 4], [2, 3, 4, 5])).toEqual(["II", "C", "4", "e"]);
    expect(numbered("I, i, a", [4], [4, 9], [4, 9, 27])).toEqual(["IV", "ix", "aa"]);
  });

  it("keeps the text around counters", () => {
    expect(numbered("Part I, I.a)", [3], [3, 2])).toEqual(["Part III", "III.b)"]);
    expect(numbered("1., 1.1.", [1], [1, 1])).toEqual(["1.", "1.1."]);
  });

  it("leaves levels past the last pattern unnumbered", () => {
    expect(numbered("1, 1.1", [1, 1, 1])).toEqual([null]);
  });

  it("shows a skipped level as 0, as Pandoc does", () => {
    expect(numbered("1, 1.1, 1.1.1", [1, 0, 1])).toEqual(["1.0.1"]);
  });

  it("refuses a format with no counter in a pattern", () => {
    expect(parseNumbering("")).toBeNull();
    expect(parseNumbering("Chapter")).toBeNull();
    expect(parseNumbering("1, Section")).toBeNull();
  });

  it("parses every preset", () => {
    for (const preset of NUMBERING_PRESETS) expect(parseNumbering(preset)).not.toBeNull();
  });

  it("writes roman numerals and letters", () => {
    expect(formatCounter(1994, "upper-roman")).toBe("MCMXCIV");
    expect(formatCounter(14, "lower-roman")).toBe("xiv");
    expect(formatCounter(26, "upper-alpha")).toBe("Z");
    expect(formatCounter(28, "lower-alpha")).toBe("ab");
    expect(formatCounter(0, "upper-roman")).toBe("0");
  });
});

describe("resolving the options", () => {
  const defaults = { toc: false, depth: 3, numbering: "", title: "Contents" };

  it("uses the defaults when nothing else says", () => {
    expect(resolveContents(undefined, null, defaults)).toEqual({
      toc: null,
      tocDefault: false,
      depth: 3,
      numbering: "",
      title: "Contents",
    });
  });

  it("reads the document's frontmatter", () => {
    const fm = { toc: "true", "toc-depth": "2", numbering: "I, A", "toc-title": "Summary" };
    expect(resolveContents(undefined, fm, defaults)).toMatchObject({ toc: true, depth: 2, numbering: "I, A", title: "Summary" });
  });

  it("takes numbering: true as the default format, or the first preset", () => {
    expect(resolveContents(undefined, { numbering: "true" }, defaults).numbering).toBe(NUMBERING_PRESETS[0]);
    expect(resolveContents(undefined, { numbering: "true" }, { ...defaults, numbering: "I, i" }).numbering).toBe("I, i");
    expect(resolveContents(undefined, { numbering: "none" }, { ...defaults, numbering: "I, i" }).numbering).toBe("");
  });

  it("lets the toolbar's choice win over the document", () => {
    const fm = { toc: "true", numbering: "I, A", "toc-depth": "2" };
    expect(resolveContents({ toc: false, numbering: "", depth: 4 }, fm, defaults)).toMatchObject({ toc: false, numbering: "", depth: 4 });
  });

  it("keeps the depth within 1 to 6 and ignores junk", () => {
    expect(clampTocDepth("9")).toBe(6);
    expect(clampTocDepth(0)).toBe(1);
    expect(clampTocDepth("two")).toBe(3);
    expect(resolveContents(undefined, { "toc-depth": "x" }, { ...defaults, depth: 2 }).depth).toBe(2);
  });
});
