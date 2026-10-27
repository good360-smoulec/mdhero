/**
 * Collapsible sections. A heading's section is everything after it up to the
 * next heading of the same or a higher level, subsections included. Only
 * top-level headings take part: the rendered document is a flat run of blocks.
 */

export interface SectionItem {
  /** Heading level 1–6, or null for any other block. */
  level: number | null;
  /** The heading's id, for headings. */
  id?: string;
}

/** Which items a set of collapsed headings hides. A hidden heading's own state doesn't matter. */
export function hiddenItems(items: readonly SectionItem[], collapsed: ReadonlySet<string>): boolean[] {
  const hidden: boolean[] = [];
  // Level of the outermost collapsed heading whose section we're inside.
  let hidingFrom = Infinity;
  for (const item of items) {
    if (item.level !== null && item.level <= hidingFrom) hidingFrom = Infinity;
    hidden.push(hidingFrom !== Infinity);
    if (hidingFrom === Infinity && item.level !== null && item.id && collapsed.has(item.id)) hidingFrom = item.level;
  }
  return hidden;
}

/** Headings to collapse to show the outline down to `level`: every heading at that level or deeper. */
export function collapseToLevel(items: readonly SectionItem[], level: number): string[] {
  return items.filter((i) => i.level !== null && i.level >= level && i.id).map((i) => i.id!);
}

/**
 * The headings whose sections contain item `index`, innermost first: each
 * earlier heading of a lower level than the last one found.
 */
export function enclosingHeadings(items: readonly SectionItem[], index: number): string[] {
  const out: string[] = [];
  let below = items[index]?.level ?? Infinity;
  for (let i = index - 1; i >= 0 && below > 1; i--) {
    const { level, id } = items[i];
    if (level !== null && level < below) {
      if (id) out.push(id);
      below = level;
    }
  }
  return out;
}

const HEADING = /^H([1-6])$/;

export function sectionItems(root: HTMLElement): { blocks: HTMLElement[]; items: SectionItem[] } {
  const blocks = Array.from(root.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
  const items = blocks.map((el) => {
    const m = HEADING.exec(el.tagName);
    return m ? { level: Number(m[1]), id: el.id || undefined } : { level: null };
  });
  return { blocks, items };
}

const CHEVRON =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4,6 8,10 12,6"/></svg>';

type Labels = { collapse: string; expand: string };

function drawToggle(heading: HTMLElement, id: string, collapsed: ReadonlySet<string>, labels: Labels, onToggle: (id: string) => void) {
  let toggle = heading.querySelector<HTMLButtonElement>(":scope > .section-toggle");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "section-toggle";
    toggle.innerHTML = CHEVRON;
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle(id);
    });
    heading.prepend(toggle);
    heading.classList.add("md-section-heading");
  }
  const isCollapsed = collapsed.has(id);
  heading.classList.toggle("md-section-collapsed", isCollapsed);
  toggle.setAttribute("aria-expanded", String(!isCollapsed));
  toggle.setAttribute("aria-label", isCollapsed ? labels.expand : labels.collapse);
  toggle.title = isCollapsed ? labels.expand : labels.collapse;
}

/**
 * Put the collapse state on the page: a toggle in each top-level heading's
 * margin, and hidden blocks marked. Synchronous, so a caller about to scroll
 * to something it just revealed finds it laid out. Each block is numbered
 * (data-block), so a copy laid out as pages still says which block it came from.
 */
export function applySections(
  root: HTMLElement,
  collapsed: ReadonlySet<string>,
  labels: Labels,
  onToggle: (id: string) => void,
): void {
  const { blocks, items } = sectionItems(root);
  const hidden = hiddenItems(items, collapsed);
  blocks.forEach((el, i) => {
    el.dataset.block = String(i);
    el.classList.toggle("md-section-hidden", hidden[i]);
    const id = items[i].id;
    if (items[i].level !== null && id) drawToggle(el, id, collapsed, labels, onToggle);
  });
}

/** Toggles for the headings of a copy laid out as pages, whose own toggles didn't survive the copy. */
export function addSectionToggles(
  root: HTMLElement,
  collapsed: ReadonlySet<string>,
  labels: Labels,
  onToggle: (id: string) => void,
): void {
  root.querySelectorAll<HTMLElement>(".md-section-heading[id]").forEach((heading) => {
    drawToggle(heading, heading.id, collapsed, labels, onToggle);
  });
}

/** Take the toggles and hidden marks off. */
export function stripSections(root: ParentNode): void {
  root.querySelectorAll(".section-toggle").forEach((el) => el.remove());
  root.querySelectorAll<HTMLElement>(".md-section-hidden, .md-section-collapsed, .md-section-heading, [data-block]").forEach((el) => {
    el.classList.remove("md-section-hidden", "md-section-collapsed", "md-section-heading");
    delete el.dataset.block;
  });
}
