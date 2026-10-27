import { get, writable } from "svelte/store";
import { document as docStore } from "./document";
import { enclosingHeadings, type SectionItem } from "$lib/utils/sections";

/** Collapsed heading ids per open file, kept while the app runs. */
export const collapsedSections = writable<Record<string, string[]>>({});

/** True while the document on screen can collapse (not while editing). */
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

/** The renderer showing the document. */
export interface SectionsView {
  /** The document's top-level blocks, numbered as their data-block says. */
  items: () => SectionItem[];
  /**
   * Show the new collapse state at once rather than on the next tick. Pages
   * are laid out again first, so the renderer scrolls to `target` itself.
   */
  redraw: (collapsed: Set<string>, target: Element) => void;
}

let view: SectionsView | null = null;

export function setSectionsView(next: SectionsView | null): void {
  view = next;
}

/**
 * Expand whatever collapsed sections hide `el`, before something scrolls to
 * it (a search match, an outline entry, a link or footnote, a change). In the
 * reader view this returns with the element laid out; in page view the pages
 * are laid out again and the renderer scrolls there once they are.
 */
export function revealElement(el: Element | null): void {
  if (!el || !view) return;
  const path = get(docStore).filePath;
  const block = el.closest<HTMLElement>("[data-block]");
  if (!path || !block) return;
  const collapsed = get(collapsedSections)[path] ?? [];
  if (collapsed.length === 0) return;

  const open = enclosingHeadings(view.items(), Number(block.dataset.block)).filter((id) => collapsed.includes(id));
  if (open.length === 0) return;
  const next = collapsed.filter((id) => !open.includes(id));
  setCollapsedSections(path, next);
  view.redraw(new Set(next), el);
}
