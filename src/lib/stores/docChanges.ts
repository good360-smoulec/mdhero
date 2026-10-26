import { writable } from "svelte/store";
import type { LineChanges } from "$lib/utils/line-diff";

/**
 * What the last reload from disk changed in each open file, by line of the
 * rendered body (frontmatter excluded, matching `data-source-line`). Only the
 * latest reload is kept: line numbers from earlier ones no longer line up.
 */
export const docChanges = writable<Record<string, LineChanges & { seq: number }>>({});

/** How many changed blocks the renderer marked in the document on screen. */
export const markedChangeCount = writable(0);

let seq = 0;

export function setDocChanges(path: string, changes: LineChanges): void {
  const empty = changes.changed.length === 0 && changes.removedBefore.length === 0;
  docChanges.update((all) => {
    const { [path]: _old, ...rest } = all;
    return empty ? rest : { ...rest, [path]: { ...changes, seq: ++seq } };
  });
}

export function clearDocChanges(path: string): void {
  docChanges.update((all) => {
    if (!(path in all)) return all;
    const { [path]: _old, ...rest } = all;
    return rest;
  });
}
