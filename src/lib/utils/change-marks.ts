import type { LineChanges } from "./line-diff";

export interface BlockMarks {
  /** Blocks (by their source line) with added or edited lines in them. */
  changed: Set<number>;
  /** Blocks with removed content just above them. */
  removedBefore: Set<number>;
  /** Block with removed content just below it (the document's end was cut). */
  removedAfter: number | null;
}

/**
 * Which rendered blocks a set of line changes touches. `blockLines` are the
 * blocks' `data-source-line` values; a block runs from its line up to the
 * next block's, so blank lines and a list's later items belong to the block
 * above them.
 */
export function blocksToMark(blockLines: readonly number[], changes: LineChanges): BlockMarks {
  const lines = [...new Set(blockLines)].sort((a, b) => a - b);
  const marks: BlockMarks = { changed: new Set(), removedBefore: new Set(), removedAfter: null };
  if (lines.length === 0) return marks;

  /** The block a line falls in: the last one starting at or before it. */
  const blockOf = (line: number): number => {
    let lo = 0;
    let hi = lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lines[mid] <= line) lo = mid;
      else hi = mid - 1;
    }
    return lines[lo];
  };

  for (const line of changes.changed) marks.changed.add(blockOf(line));
  for (const line of changes.removedBefore) {
    const next = lines.find((l) => l >= line);
    if (next === undefined) marks.removedAfter = lines[lines.length - 1];
    else marks.removedBefore.add(next);
  }
  return marks;
}
