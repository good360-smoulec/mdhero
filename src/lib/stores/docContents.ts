import { writable } from "svelte/store";
import { clampTocDepth, type ContentsOverride } from "$lib/utils/contents";

/**
 * Table of contents and numbering picked in the toolbar, by file path, as
 * templates are (docTemplate.ts). A setting left out follows the document.
 */
const STORAGE_KEY = "mdhero-contents-overrides";

function cleanOverride(value: unknown): ContentsOverride | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const out: ContentsOverride = {};
  if (typeof v.toc === "boolean") out.toc = v.toc;
  if (v.depth !== undefined) out.depth = clampTocDepth(v.depth);
  if (typeof v.numbering === "string") out.numbering = v.numbering;
  return Object.keys(out).length > 0 ? out : null;
}

function load(): Record<string, ContentsOverride> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, ContentsOverride> = {};
    for (const [path, value] of Object.entries(parsed)) {
      const clean = cleanOverride(value);
      if (clean) out[path] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

export const contentsOverrides = writable<Record<string, ContentsOverride>>(load());

contentsOverrides.subscribe((value) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {}
});

/** `undefined` drops that one choice, so it follows the document again. */
export function setContentsOverride<K extends keyof ContentsOverride>(
  filePath: string,
  key: K,
  value: ContentsOverride[K] | undefined,
) {
  contentsOverrides.update((all) => {
    const entry = { ...all[filePath] };
    if (value === undefined) delete entry[key];
    else entry[key] = value;
    const next = { ...all };
    if (Object.keys(entry).length > 0) next[filePath] = entry;
    else delete next[filePath];
    return next;
  });
}
