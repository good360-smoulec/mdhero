/**
 * Page-break rules for page view and PDFs. Paged.js breaks a page wherever it
 * is full; each rule here moves a break that would read badly. Some are plain
 * CSS, the rest are applied by the handler in templates/paged-rules.ts.
 */

export const PAGINATION_RULES = [
  "keepHeadings",
  "widowsOrphans",
  "trimPageTop",
  "tableRows",
  "tableHeaders",
  "shortBlocks",
  "listItems",
] as const;

export type PaginationRule = (typeof PAGINATION_RULES)[number];
export type PaginationRules = Record<PaginationRule, boolean>;

/** "Smart" turns every rule on, "Raw" turns them all off; anything else is "Custom". */
export type PaginationPreset = "smart" | "raw" | "custom";

export function presetRules(preset: "smart" | "raw"): PaginationRules {
  const on = preset === "smart";
  return Object.fromEntries(PAGINATION_RULES.map((rule) => [rule, on])) as PaginationRules;
}

export function rulesPreset(rules: PaginationRules): PaginationPreset {
  const values = PAGINATION_RULES.map((rule) => rules[rule]);
  if (values.every(Boolean)) return "smart";
  if (values.every((v) => !v)) return "raw";
  return "custom";
}

/** Stored rules, with any rule that's missing or not a boolean back at its "smart" default. */
export function normalizeRules(value: unknown): PaginationRules {
  const stored = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const rules = presetRules("smart");
  for (const rule of PAGINATION_RULES) {
    if (typeof stored[rule] === "boolean") rules[rule] = stored[rule] as boolean;
  }
  return rules;
}

/** A block that splits over a page break is kept whole when it's shorter than this share of the page. */
export const SHORT_BLOCK_SHARE = 1 / 3;
/** Lines of a paragraph, or items of a list, kept on each side of a break. */
export const MIN_LINES = 2;
export const MIN_ITEMS = 2;

const FLOW = ".doc-page.doc-flow";
const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

/**
 * The CSS half of the rules, added after the template when Paged.js lays the
 * document out. Selectors are written out in full rather than with :is(),
 * which Paged.js's own break handling doesn't read.
 */
export function paginationCss(rules: PaginationRules): string {
  const css: string[] = [];
  if (rules.keepHeadings) {
    css.push(`${HEADINGS.map((h) => `${FLOW} ${h}`).join(",\n")} {\n  break-after: avoid;\n  break-inside: avoid;\n}`);
  }
  // Chromium already keeps two lines on each side (the CSS default), as it
  // lays out the columns Paged.js measures; off has to say so.
  const minLines = rules.widowsOrphans ? MIN_LINES : 1;
  css.push(`${FLOW} p,\n${FLOW} li {\n  orphans: ${minLines};\n  widows: ${minLines};\n}`);
  if (rules.trimPageTop) {
    // Not on the first page, where a letterhead may sit above the first heading.
    css.push(`.pagedjs_page:not(.pagedjs_first_page) ${FLOW} > :first-child {\n  margin-top: 0 !important;\n}`);
  }
  if (rules.tableRows) {
    css.push(`${FLOW} td,\n${FLOW} th {\n  break-inside: avoid;\n}`);
  }
  return css.join("\n\n");
}

/** A short key for the rules, so a re-render only lays pages out again when they change. */
export function rulesKey(rules: PaginationRules): string {
  return PAGINATION_RULES.map((rule) => (rules[rule] ? "1" : "0")).join("");
}
