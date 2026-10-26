import { describe, expect, it, vi } from "vitest";

// The unit env has no DOM for DOMPurify; only the markup is under test here.
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

const { render } = await import("../../src/lib/renderer/pipeline");
import { lineChanges } from "../../src/lib/utils/line-diff";
import { blocksToMark } from "../../src/lib/utils/change-marks";
import { countWords, documentStats, estimateTokens, splitSentences, syllables, type DocText } from "../../src/lib/utils/doc-stats";

const lines = (s: string) => s.split("\n");

describe("lineChanges", () => {
  it("reports nothing for identical text", () => {
    expect(lineChanges(lines("a\nb"), lines("a\nb"))).toEqual({ changed: [], removedBefore: [] });
  });

  it("marks an edited line by its line in the new text", () => {
    expect(lineChanges(lines("a\nb\nc"), lines("a\nB\nc"))).toEqual({ changed: [1], removedBefore: [] });
  });

  it("marks added lines and skips blank ones", () => {
    expect(lineChanges(lines("a\nc"), lines("a\n\nb\nc"))).toEqual({ changed: [2], removedBefore: [] });
  });

  it("places a removal before the line that follows it", () => {
    expect(lineChanges(lines("a\nb\nc"), lines("a\nc"))).toEqual({ changed: [], removedBefore: [1] });
  });

  it("places a removal at the end past the last line", () => {
    expect(lineChanges(lines("a\nb\nc"), lines("a\nb"))).toEqual({ changed: [], removedBefore: [2] });
  });

  it("finds separate edits in one reload", () => {
    const before = lines("one\ntwo\nthree\nfour\nfive\nsix");
    const after = lines("one\nTWO\nthree\nfour\nfive\nSIX\nseven");
    expect(lineChanges(before, after)).toEqual({ changed: [1, 5, 6], removedBefore: [] });
  });

  it("shows a replaced line as changed, not also as a removal", () => {
    const before = lines("a\nx\nb\ny\nc");
    const after = lines("a\nX\nb\nc");
    expect(lineChanges(before, after)).toEqual({ changed: [1], removedBefore: [3] });
  });
});

describe("source lines on single-token blocks", () => {
  it("tags code blocks and rules, so a change in them marks them and not the block above", () => {
    const html = render("Intro.\n\n```js\nx\n```\n\n---\n\n    indented");
    expect(html).toMatch(/<code[^>]*data-source-line="2"/);
    expect(html).toMatch(/<hr[^>]*data-source-line="6"/);
    expect(html).toMatch(/<pre[^>]*data-source-line="8"/);
  });
});

describe("blocksToMark", () => {
  // Blocks starting at lines 0 (heading), 2 (paragraph), 4 (list), 8 (paragraph).
  const blocks = [0, 2, 4, 8];

  it("marks the block a changed line belongs to, including a list's later items", () => {
    const marks = blocksToMark(blocks, { changed: [6], removedBefore: [] });
    expect([...marks.changed]).toEqual([4]);
  });

  it("marks the block below a removal, or the last block for a removal at the end", () => {
    expect([...blocksToMark(blocks, { changed: [], removedBefore: [3] }).removedBefore]).toEqual([4]);
    expect(blocksToMark(blocks, { changed: [], removedBefore: [12] }).removedAfter).toBe(8);
  });

  it("counts a block once when a page break split it in two", () => {
    expect([...blocksToMark([0, 2, 2, 4], { changed: [2, 3], removedBefore: [] }).changed]).toEqual([2]);
  });
});

describe("document statistics", () => {
  const doc = (prose: string[], extra: Partial<DocText> = {}): DocText => ({
    allText: prose.join(" "),
    prose,
    paragraphs: prose.length,
    headings: 0,
    codeBlocks: 0,
    tables: 0,
    images: 0,
    links: 0,
    ...extra,
  });

  it("counts words without markdown symbols, and CJK characters one by one", () => {
    expect(countWords("- item | cell # heading")).toBe(3);
    expect(countWords("It's a well-known fact.")).toBe(4);
    expect(countWords("日本語のテキスト")).toBe(8);
  });

  it("splits sentences on end punctuation, including closing quotes and CJK marks", () => {
    expect(splitSentences('He said "Go." Then left! Why? 好。走')).toEqual(['He said "Go."', "Then left!", "Why?", "好。", "走"]);
  });

  it("counts English syllables closely enough for readability", () => {
    expect(syllables("the")).toBe(1);
    expect(syllables("reading")).toBe(2);
    expect(syllables("readability")).toBe(5);
    expect(syllables("make")).toBe(1);
  });

  it("estimates tokens from the source: about four characters each, one per CJK character", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(400))).toBe(100);
    expect(estimateTokens("日本語")).toBe(3);
  });

  it("finds long sentences, the longest, and readability for English prose", () => {
    const easy = "The cat sat on the mat. ".repeat(6);
    const long = Array(35).fill("word").join(" ") + ".";
    const stats = documentStats(doc([easy, long]), "source");
    expect(stats.sentences).toBe(7);
    expect(stats.longSentences).toBe(1);
    expect(stats.longestSentence?.words).toBe(35);
    expect(stats.readability?.level).toBeDefined();
  });

  it("rates simple text easier than dense text", () => {
    const simple = documentStats(doc(["We go to the shop. We buy some bread. It is good. ".repeat(4)]), "");
    const dense = documentStats(
      doc(["Comprehensive institutional accountability necessitates multidimensional organizational transformation initiatives. ".repeat(4)]),
      "",
    );
    expect(simple.readability!.ease).toBeGreaterThan(dense.readability!.ease);
    expect(dense.readability!.grade).toBeGreaterThan(simple.readability!.grade);
  });

  it("leaves readability out for text that isn't mostly English", () => {
    const stats = documentStats(doc(["Это текст на русском языке. ".repeat(10)]), "");
    expect(stats.readability).toBeNull();
  });

  it("lists words used at least three times, without common words", () => {
    const stats = documentStats(doc(["The grant funds food. The grant funds shelter. The grant funds training. That would help."]), "");
    expect(stats.repeatedWords).toEqual([
      { word: "funds", count: 3 },
      { word: "grant", count: 3 },
    ]);
  });
});
