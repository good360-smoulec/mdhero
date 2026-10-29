/**
 * Heading numbers and a table of contents, put on the rendered page rather than
 * in the markdown pipeline so a choice made in the toolbar shows at once, and
 * so the outline, search, page view and PDF all see the same numbered page.
 * Only top-level headings take part, as with collapsible sections.
 */

export type NumberStyle = "decimal" | "upper-roman" | "lower-roman" | "upper-alpha" | "lower-alpha";

type Part = { style: NumberStyle } | { text: string };

/** One pattern per heading level, from the first numbered level down. */
export type Numbering = Part[][];

/** Offered in the toolbar and Settings. Any other format can be typed in Settings. */
export const NUMBERING_PRESETS = ["1, 1.1, 1.1.1, 1.1.1.1", "I, A, 1, a", "I, i, a, 1"] as const;

export const MIN_TOC_DEPTH = 1;
export const MAX_TOC_DEPTH = 6;
export const DEFAULT_TOC_DEPTH = 3;

const PLACEHOLDERS: Record<string, NumberStyle> = {
  "1": "decimal",
  I: "upper-roman",
  i: "lower-roman",
  A: "upper-alpha",
  a: "lower-alpha",
};

/**
 * A format lists one pattern per level, separated by commas: `1, 1.1, 1.1.1`
 * or `I, i, a`. In a pattern, a lone 1, I, i, A or a stands for a counter and
 * anything else is kept as written, so `Part I` or `a)` work. A pattern's last
 * counter is its own level's and the ones before it are its parents', so `1.1`
 * on the second level reads 2.3 and `A` on it reads C. Levels past the last
 * pattern aren't numbered. Null when nothing in the format is a counter.
 */
export function parseNumbering(format: string): Numbering | null {
  const levels: Numbering = [];
  for (const raw of format.split(",")) {
    const pattern = raw.trim();
    if (!pattern) continue;
    const parts: Part[] = [];
    for (const token of pattern.match(/[A-Za-z]+|\d+|[^A-Za-z\d]+/g) ?? []) {
      const style = PLACEHOLDERS[token];
      if (style) parts.push({ style });
      else if (parts.length > 0 && "text" in parts[parts.length - 1]) (parts[parts.length - 1] as { text: string }).text += token;
      else parts.push({ text: token });
    }
    if (!parts.some((p) => "style" in p)) return null;
    levels.push(parts);
  }
  return levels.length > 0 ? levels : null;
}

function toRoman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n);
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [value, letters] of table) {
    while (n >= value) {
      out += letters;
      n -= value;
    }
  }
  return out;
}

/** A, B … Z, AA, AB …, as spreadsheets and Word letter their lists. */
function toAlpha(n: number): string {
  if (n <= 0) return String(n);
  let out = "";
  while (n > 0) {
    n--;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

export function formatCounter(n: number, style: NumberStyle): string {
  switch (style) {
    case "decimal":
      return String(n);
    case "upper-roman":
      return toRoman(n);
    case "lower-roman":
      return toRoman(n).toLowerCase();
    case "upper-alpha":
      return toAlpha(n);
    case "lower-alpha":
      return toAlpha(n).toLowerCase();
  }
}

/**
 * The number for a heading `counters.length - 1` levels below the first
 * numbered one, given the running count at each level down to it. Null past
 * the last pattern.
 */
export function formatNumber(numbering: Numbering, counters: readonly number[]): string | null {
  const depth = counters.length - 1;
  const pattern = numbering[depth];
  if (!pattern) return null;
  const counterParts = pattern.filter((p) => "style" in p).length;
  let next = depth - counterParts + 1;
  return pattern
    .map((part) => {
      if ("text" in part) return part.text;
      const value = next >= 0 ? counters[next] : 1;
      next++;
      return formatCounter(value, part.style);
    })
    .join("");
}

export interface ContentsOptions {
  /** On or off when the toolbar or the document says so; null leaves it to a `[TOC]` line, then `tocDefault`. */
  toc: boolean | null;
  tocDefault: boolean;
  /** Levels the table lists, counted from the first numbered level. */
  depth: number;
  /** A numbering format, or "" for none. */
  numbering: string;
  title: string;
}

/** Picked for one file in the toolbar. A missing key follows the document. */
export interface ContentsOverride {
  toc?: boolean;
  depth?: number;
  numbering?: string;
}

function frontmatterValue(frontmatter: Record<string, unknown> | null, key: string): string | null {
  const value = frontmatter?.[key];
  if (typeof value === "boolean") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: string | null): boolean | null {
  if (value === null) return null;
  const v = value.toLowerCase();
  if (v === "true" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "no" || v === "off") return false;
  return null;
}

export function clampTocDepth(value: unknown, fallback = DEFAULT_TOC_DEPTH): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(n) ? Math.min(MAX_TOC_DEPTH, Math.max(MIN_TOC_DEPTH, n)) : fallback;
}

/**
 * The toolbar's choice for this file beats the document's frontmatter (`toc`,
 * `toc-depth`, `numbering`, `toc-title`), which beats the defaults in Settings,
 * as templates are picked.
 */
export function resolveContents(
  override: ContentsOverride | undefined,
  frontmatter: Record<string, unknown> | null,
  defaults: { toc: boolean; depth: number; numbering: string; title: string },
): ContentsOptions {
  const fmNumbering = frontmatterValue(frontmatter, "numbering");
  let numbering = defaults.numbering;
  if (override?.numbering !== undefined) numbering = override.numbering;
  else if (fmNumbering !== null) {
    const on = asBoolean(fmNumbering);
    numbering = on === false || fmNumbering.toLowerCase() === "none" ? "" : on === true ? defaults.numbering || NUMBERING_PRESETS[0] : fmNumbering;
  }
  return {
    toc: override?.toc ?? asBoolean(frontmatterValue(frontmatter, "toc")),
    tocDefault: defaults.toc,
    depth: clampTocDepth(override?.depth ?? frontmatterValue(frontmatter, "toc-depth"), defaults.depth),
    numbering,
    title: frontmatterValue(frontmatter, "toc-title") ?? defaults.title,
  };
}

/** Whether a resolved set of options changes the page at all. */
export function contentsKey(options: ContentsOptions | null): string {
  return options ? JSON.stringify(options) : "";
}

const HEADING = /^H([1-6])$/;
const MARKER = /^\[(?:toc|\[toc\])\]$/i;

interface Heading {
  el: HTMLElement;
  level: number;
}

/**
 * The document's title: its only top-level `#`, when that comes before every
 * other heading. It is neither numbered nor listed, and the table goes after it.
 */
function findTitle(headings: Heading[]): Heading | null {
  const h1s = headings.filter((h) => h.level === 1);
  return h1s.length === 1 && headings[0] === h1s[0] ? h1s[0] : null;
}

/** Take the numbers and table off, and show a `[TOC]` line again. */
export function stripContents(root: ParentNode): void {
  root.querySelectorAll(".doc-toc").forEach((el) => el.remove());
  root.querySelectorAll(".heading-number").forEach((el) => {
    const next = el.nextSibling;
    if (next?.nodeType === Node.TEXT_NODE && next.textContent === " ") next.remove();
    el.remove();
  });
  root.querySelectorAll<HTMLElement>("p.doc-toc-marker").forEach((el) => {
    el.classList.remove("doc-toc-marker");
    el.hidden = false;
  });
}

/**
 * Put the options on the page, replacing what an earlier call put there.
 * The table goes where a `[TOC]` (or `[[toc]]`) line is, or else right before
 * the first heading after the title, so a title, subtitle and introduction
 * come first. The `[TOC]` line itself is hidden either way.
 */
export function applyContents(root: HTMLElement, options: ContentsOptions | null): void {
  stripContents(root);
  if (!options) return;

  const headings: Heading[] = [];
  let marker: HTMLElement | null = null;
  for (const el of Array.from(root.children)) {
    if (!(el instanceof HTMLElement)) continue;
    const m = HEADING.exec(el.tagName);
    if (m) headings.push({ el, level: Number(m[1]) });
    else if (!marker && el.tagName === "P" && MARKER.test(el.textContent?.trim() ?? "")) marker = el;
  }

  const title = findTitle(headings);
  const body = headings.filter((h) => h !== title);
  const top = body.length > 0 ? Math.min(...body.map((h) => h.level)) : 1;

  const numbering = options.numbering ? parseNumbering(options.numbering) : null;
  const numbers = new Map<HTMLElement, string>();
  if (numbering) {
    const counters: number[] = [];
    for (const h of body) {
      const depth = h.level - top;
      counters.length = Math.max(counters.length, depth + 1);
      for (let i = 0; i < depth; i++) counters[i] ??= 0;
      counters[depth] = (counters[depth] ?? 0) + 1;
      counters.length = depth + 1;
      const text = formatNumber(numbering, counters);
      if (text) numbers.set(h.el, text);
    }
  }

  const show = options.toc ?? (marker !== null || options.tocDefault);
  if (show) {
    const listed = body.filter((h) => h.el.id && h.level - top < options.depth);
    if (listed.length > 0) {
      const toc = buildToc(listed, top, numbers, options.title);
      if (marker) marker.after(toc);
      else listed[0].el.before(toc);
    }
  }
  if (marker) {
    marker.classList.add("doc-toc-marker");
    marker.hidden = true;
  }

  for (const [el, text] of numbers) {
    const number = document.createElement("span");
    number.className = "heading-number";
    number.textContent = text;
    // After a section toggle, which sits in the margin.
    const toggle = el.querySelector(":scope > .section-toggle");
    if (toggle) toggle.after(number);
    else el.prepend(number);
    number.after(" ");
  }
}

/** A heading's own text, without its toggle or a number from an earlier pass. */
function headingText(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".section-toggle, .heading-number").forEach((n) => n.remove());
  return copy.textContent?.trim() ?? "";
}

function buildToc(listed: Heading[], top: number, numbers: Map<HTMLElement, string>, title: string): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "doc-toc";
  if (title) {
    const heading = document.createElement("p");
    heading.className = "doc-toc-title";
    heading.textContent = title;
    nav.append(heading);
    nav.setAttribute("aria-label", title);
  }
  const list = document.createElement("ol");
  list.className = "doc-toc-list";
  for (const h of listed) {
    const item = document.createElement("li");
    item.className = `doc-toc-item doc-toc-level-${h.level - top + 1}`;
    const link = document.createElement("a");
    link.href = `#${h.el.id}`;
    const number = numbers.get(h.el);
    if (number) {
      const n = document.createElement("span");
      n.className = "doc-toc-number";
      n.textContent = number;
      // Copied or read aloud, "1.2 Results" rather than "1.2Results"; the
      // flex layout spaces it on screen.
      link.append(n, " ");
    }
    const text = document.createElement("span");
    text.className = "doc-toc-text";
    text.textContent = headingText(h.el);
    link.append(text);
    const leader = document.createElement("span");
    leader.className = "doc-toc-leader";
    leader.setAttribute("aria-hidden", "true");
    link.append(leader);
    item.append(link);
    list.append(item);
  }
  nav.append(list);
  return nav;
}
