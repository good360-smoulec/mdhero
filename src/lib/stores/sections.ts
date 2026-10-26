import { get, writable } from "svelte/store";
import { document as docStore } from "./document";
import { enclosingHeadings, sectionItems } from "$lib/utils/sections";

/** Collapsed heading ids per open file, kept while the app runs. */
export const collapsedSections = writable<Record<string, string[]>>({});

/** True while the document on screen can collapse (not in page view or editing). */
export const sectionsActive = writable(false);

function update(path: string, fn: (ids: Set<string>) => void): void {
  collapsedSections.update((all) => {
    const ids = new Set(all[path] ?? []);
    fn(ids);
    return { ...all, [path]: [...ids] };
  });
}

export function toggleSection(path: string, id: string): void {
  update(path, (ids) => (ids.has(id) ? ids.delete(id) : ids.add(id)));
}

export function setCollapsedSections(path: string, ids: string[]): void {
  collapsedSections.update((all) => ({ ...all, [path]: ids }));
}

// Set by the renderer showing the document, so revealing an element can redraw
// the sections at once rather than on the next tick.
let redraw: ((collapsed: Set<string>) => void) | null = null;

export function setSectionsRedraw(fn: typeof redraw): void {
  redraw = fn;
}

/**
 * Expand whatever collapsed sections hide `el`, before something scrolls to
 * it (a search match, an outline entry, a link or footnote, a change). Returns
 * at once with the element laid out.
 */
export function revealElement(el: Element | null): void {
  if (!el || !get(sectionsActive)) return;
  const root = el.closest<HTMLElement>("article.md-content");
  const path = get(docStore).filePath;
  if (!root || !path) return;
  const collapsed = get(collapsedSections)[path] ?? [];
  if (collapsed.length === 0) return;

  const { blocks, items } = sectionItems(root);
  const index = blocks.findIndex((block) => block === el || block.contains(el));
  if (index < 0) return;
  const open = enclosingHeadings(items, index).filter((id) => collapsed.includes(id));
  if (open.length === 0) return;
  const next = collapsed.filter((id) => !open.includes(id));
  setCollapsedSections(path, next);
  redraw?.(new Set(next));
}
