import { changedRange } from "./line-patch";

/** Where a new version of a file differs from the old one, by line of the new one. */
export interface LineChanges {
  /** Lines of the new text that were added or edited (0-based). Blank lines are left out. */
  changed: number[];
  /** Lines of the new text that have old lines removed just before them; the
   *  new text's length means removed from the end. */
  removedBefore: number[];
}

// Above this many cells the middle of the diff is marked changed as a whole
// instead of being matched line by line: an edit that big is a rewrite anyway.
const MAX_CELLS = 4_000_000;

export function lineChanges(prev: readonly string[], next: readonly string[]): LineChanges {
  const { start, prevEnd, nextEnd } = changedRange(prev, next);
  const changed: number[] = [];
  const removedBefore: number[] = [];
  const a = prev.slice(start, prevEnd);
  const b = next.slice(start, nextEnd);

  const add = (line: number) => {
    if (next[line].trim()) changed.push(line);
  };

  if (a.length === 0) {
    for (let j = 0; j < b.length; j++) add(start + j);
  } else if (b.length === 0) {
    removedBefore.push(start);
  } else if (a.length * b.length > MAX_CELLS) {
    for (let j = 0; j < b.length; j++) add(start + j);
  } else {
    // Longest common subsequence of the middle; what isn't in it changed.
    const n = a.length;
    const m = b.length;
    const lcs = new Int32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * (m + 1) + j] =
          a[i] === b[j]
            ? lcs[(i + 1) * (m + 1) + j + 1] + 1
            : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
      }
    }
    // Walk the runs between matching lines. A run with new lines in it is an
    // edit and shows as those lines; only a run of removals alone leaves a
    // mark where the old lines were.
    let i = 0;
    let j = 0;
    let removed = 0;
    let added = 0;
    const endRun = () => {
      if (removed > 0 && added === 0) removedBefore.push(start + j);
      removed = 0;
      added = 0;
    };
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        endRun();
        i++;
        j++;
      } else if (j < m && (i === n || lcs[i * (m + 1) + j + 1] >= lcs[(i + 1) * (m + 1) + j])) {
        add(start + j);
        added++;
        j++;
      } else {
        removed++;
        i++;
      }
    }
    endRun();
  }

  return { changed, removedBefore };
}
