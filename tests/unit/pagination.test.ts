import { describe, it, expect } from "vitest";
import {
  PAGINATION_RULES,
  normalizeRules,
  paginationCss,
  presetRules,
  rulesKey,
  rulesPreset,
} from "../../src/lib/utils/pagination";

describe("pagination presets", () => {
  it("names all-on Smart, all-off Raw and any mix Custom", () => {
    expect(rulesPreset(presetRules("smart"))).toBe("smart");
    expect(rulesPreset(presetRules("raw"))).toBe("raw");
    expect(rulesPreset({ ...presetRules("smart"), tableHeaders: false })).toBe("custom");
  });

  it("restores stored rules and puts junk back to the Smart default", () => {
    expect(normalizeRules(null)).toEqual(presetRules("smart"));
    expect(normalizeRules({ keepHeadings: false, listItems: "no", bogus: true })).toEqual({
      ...presetRules("smart"),
      keepHeadings: false,
    });
  });

  it("changes its key only when a rule changes", () => {
    expect(rulesKey(presetRules("smart"))).toBe("1".repeat(PAGINATION_RULES.length));
    expect(rulesKey({ ...presetRules("raw"), widowsOrphans: true })).not.toBe(rulesKey(presetRules("raw")));
  });
});

describe("pagination CSS", () => {
  it("lets Raw break after a single line, which Chromium's two-line default would stop", () => {
    const css = paginationCss(presetRules("raw"));
    expect(css).toContain("orphans: 1;");
    expect(css).toContain("widows: 1;");
    expect(css).not.toContain("break-");
    expect(paginationCss(presetRules("smart"))).toContain("orphans: 2;");
  });

  it("keeps each heading level with what follows, without :is(), which Paged.js doesn't read", () => {
    const css = paginationCss({ ...presetRules("raw"), keepHeadings: true });
    for (const h of ["h1", "h2", "h3", "h4", "h5", "h6"]) expect(css).toContain(`.doc-page.doc-flow ${h}`);
    expect(css).toContain("break-after: avoid");
    expect(css).not.toContain(":is(");
  });

  it("drops the space at the top of every page but the first", () => {
    const css = paginationCss({ ...presetRules("raw"), trimPageTop: true });
    expect(css).toContain(".pagedjs_page:not(.pagedjs_first_page) .doc-page.doc-flow > :first-child");
  });

  it("keeps table cells whole for the row rule", () => {
    expect(paginationCss({ ...presetRules("raw"), tableRows: true })).toMatch(/td,\s*\.doc-page\.doc-flow th \{\s*break-inside: avoid/);
  });
});
