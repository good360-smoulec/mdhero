import { writable } from "svelte/store";

export interface DictionaryLookup {
  word: string;
  /** Where the right-click was, in viewport pixels: the pop-up opens there. */
  x: number;
  y: number;
}

/** The open definition pop-up, or null. */
export const dictionaryLookup = writable<DictionaryLookup | null>(null);

// Held from the right-click until the native menu reports a choice, like the
// selection in aiLookup.ts.
let pending: DictionaryLookup | null = null;

export function setPendingLookup(lookup: DictionaryLookup | null) {
  pending = lookup;
}

/** Open the pop-up for the word that was right-clicked. */
export function openPendingLookup() {
  if (pending) dictionaryLookup.set(pending);
  pending = null;
}
