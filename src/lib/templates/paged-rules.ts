import type { Handler } from "pagedjs";
import { MIN_ITEMS, MIN_LINES, SHORT_BLOCK_SHARE, type PaginationRules } from "$lib/utils/pagination";

/**
 * The page-break rules CSS can't express to Paged.js 0.4.3, which honours
 * `break-after: avoid` for one element back and has no widows or orphans.
 * Paged.js reports where it is about to break a page (onOverflow), with the
 * page's content still laid out past its end, so each rule measures what it
 * needs and moves the break up. A break is never moved back to the start of
 * the page, which would leave it empty.
 */

let active: PaginationRules | null = null;

let registered = false;

/** Paged.js keeps one list of handlers for every Previewer, so ours goes in once. */
export function registerPageBreakRules(paged: typeof import("pagedjs")) {
  if (registered) return;
  registered = true;
  paged.registerHandlers(createPageBreakHandler(paged.Handler));
}

/** The rules for the next layout; null turns them off. */
export function setPageBreakRules(rules: PaginationRules | null) {
  active = rules;
}

const HEADING = /^H[1-6]$/;
const SHORT_BLOCK = new Set(["PRE", "BLOCKQUOTE", "TABLE"]);

/** The child of the document wrapper that `node` is in. */
function topBlock(node: Node, flow: Element): HTMLElement | null {
  let el: Node | null = node;
  while (el && el.parentNode !== flow) el = el.parentNode;
  return el instanceof HTMLElement ? el : null;
}

function startPoint(range: Range): { node: Node; offset: number } {
  return { node: range.startContainer, offset: range.startOffset };
}

/** True when the break is right before `block`, not inside it. */
function breaksBefore(range: Range, block: HTMLElement): boolean {
  const { node, offset } = startPoint(range);
  return node === block.parentNode && node.childNodes[offset] === block;
}

/**
 * Paged.js lays a page out as one column of a multi-column box, so what
 * doesn't fit flows into the next column, to the right, starting again at
 * the top. A box is past the page when it is in that column or below the page.
 */
function pastPage(rect: DOMRect, bounds: DOMRect): boolean {
  return rect.left >= Math.round(bounds.right) || rect.top >= Math.round(bounds.bottom);
}

function visibleRects(rects: DOMRectList): DOMRect[] {
  return Array.from(rects).filter((r) => r.width > 0 && r.height > 0);
}

/** An element's height, adding up the pieces on this page and past it. */
function fullHeight(el: Element): number {
  return visibleRects(el.getClientRects()).reduce((sum, r) => sum + r.height, 0);
}

function isPast(el: Element, bounds: DOMRect): boolean {
  const rects = visibleRects(el.getClientRects());
  return rects.length > 0 && rects.every((r) => pastPage(r, bounds));
}

function isSplit(el: Element, bounds: DOMRect): boolean {
  const rects = visibleRects(el.getClientRects());
  return rects.some((r) => pastPage(r, bounds)) && rects.some((r) => !pastPage(r, bounds));
}

/** Lines of text in `el` on this page, by their tops, and how many are past it. */
function lines(el: HTMLElement, bounds: DOMRect): { onPage: number[]; past: number } {
  const r = document.createRange();
  r.selectNodeContents(el);
  const onPage: number[] = [];
  const past: { left: number; top: number }[] = [];
  for (const rect of visibleRects(r.getClientRects())) {
    if (pastPage(rect, bounds)) {
      if (!past.some((l) => Math.abs(l.left - rect.left) < bounds.width / 2 && Math.abs(l.top - rect.top) < rect.height / 2)) {
        past.push({ left: rect.left, top: rect.top });
      }
    } else if (!onPage.some((t) => Math.abs(t - rect.top) < rect.height / 2)) {
      onPage.push(rect.top);
    }
  }
  return { onPage: onPage.sort((a, b) => a - b), past: past.length };
}

/** Where the line on this page starting at `top` begins, as a text position in `el`. */
function lineStart(el: HTMLElement, top: number, bounds: DOMRect): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      if (/s/.test(text[i])) continue;
      r.setStart(node, i);
      r.setEnd(node, i + 1);
      const rect = r.getClientRects()[0];
      if (rect && !pastPage(rect, bounds) && rect.top >= top - 1) return { node, offset: i };
    }
  }
  return null;
}

function rangeBefore(el: Node, rendered: Element): Range {
  const r = document.createRange();
  r.selectNode(el);
  r.setEndAfter(rendered.lastChild!);
  return r;
}

function rangeAt(node: Text, offset: number, rendered: Element): Range {
  const r = document.createRange();
  r.setStart(node, offset);
  r.setEndAfter(rendered.lastChild!);
  return r;
}

/** The break moved inside or before one block, by the rules about splitting it. */
function adjustInside(range: Range, block: HTMLElement, rendered: Element, bounds: DOMRect, rules: PaginationRules): Range {
  const shortLimit = bounds.height * SHORT_BLOCK_SHARE;

  if (rules.shortBlocks && fullHeight(block) < shortLimit && (SHORT_BLOCK.has(block.tagName) || block.classList.contains("markdown-alert"))) {
    return rangeBefore(block, rendered);
  }

  if (block.tagName === "UL" || block.tagName === "OL") {
    const items = Array.from(block.children).filter((el): el is HTMLElement => el.tagName === "LI");
    // The first item that doesn't fit whole on this page.
    const at = items.findIndex((li) => isPast(li, bounds) || isSplit(li, bounds));
    if (at >= 0) {
      const after = items.length - at;
      if (rules.listItems && at < MIN_ITEMS) return rangeBefore(block, rendered);
      if (rules.listItems && after < MIN_ITEMS && items.length - MIN_ITEMS >= MIN_ITEMS) {
        return rangeBefore(items[items.length - MIN_ITEMS], rendered);
      }
      if (rules.shortBlocks && isSplit(items[at], bounds) && fullHeight(items[at]) < shortLimit) {
        return rangeBefore(items[at], rendered);
      }
    }
    return range;
  }

  if (rules.widowsOrphans && block.tagName === "P") {
    const { onPage, past } = lines(block, bounds);
    const before = onPage.length;
    if (before > 0 && before < MIN_LINES) return rangeBefore(block, rendered);
    if (past > 0 && past < MIN_LINES && before - (MIN_LINES - past) >= MIN_LINES) {
      const start = lineStart(block, onPage[before - (MIN_LINES - past)], bounds);
      if (start) return rangeAt(start.node, start.offset, rendered);
    }
  }
  return range;
}

/** Take the headings just above `block` over to the next page with it. */
function keepHeadingsWith(block: HTMLElement, rendered: Element): Range | null {
  let first: HTMLElement = block;
  let prev = block.previousElementSibling as HTMLElement | null;
  while (prev && HEADING.test(prev.tagName)) {
    first = prev;
    prev = prev.previousElementSibling as HTMLElement | null;
  }
  return first === block ? null : rangeBefore(first, rendered);
}

/** The first block on this page, below which a break must stay. */
function firstBlock(flow: Element): Element | null {
  return flow.firstElementChild;
}

/** A Paged.js handler class, made from the library's Handler once it's loaded. */
export function createPageBreakHandler(Base: typeof Handler): typeof Handler {
  return class PageBreakRules extends Base {
    onOverflow(overflow: Range | undefined, rendered: Element, bounds: DOMRect): Range | undefined {
      const rules = active;
      if (!rules || !overflow) return undefined;
      const flow = rendered.querySelector(".doc-flow");
      if (!flow) return undefined;
      const block = topBlock(overflow.startContainer.childNodes[overflow.startOffset] ?? overflow.startContainer, flow);
      if (!block) return undefined;

      let range = overflow;
      let target = block;
      if (!breaksBefore(range, block)) {
        range = adjustInside(range, block, rendered, bounds, rules);
        if (!breaksBefore(range, block)) return range === overflow ? undefined : range;
      }
      if (rules.keepHeadings) {
        const moved = keepHeadingsWith(target, rendered);
        if (moved) {
          range = moved;
          target = topBlock(moved.startContainer.childNodes[moved.startOffset], flow) ?? target;
        }
      }
      // Never break before the page's first block: that page would be empty.
      if (target === firstBlock(flow)) return undefined;
      return range === overflow ? undefined : range;
    }

    renderNode(clone: Node, node: Node): void {
      if (!active?.tableHeaders || !(clone instanceof HTMLTableRowElement)) return;
      const table = clone.closest("table");
      if (!table || !table.dataset.splitFrom || table.tHead) return;
      const head = (node as Element).closest("table")?.tHead;
      if (!head) return;
      const copy = head.cloneNode(true) as HTMLElement;
      copy.removeAttribute("data-ref");
      copy.querySelectorAll("[data-ref]").forEach((el) => el.removeAttribute("data-ref"));
      copy.dataset.repeated = "";
      table.prepend(copy);
    }
  };
}
