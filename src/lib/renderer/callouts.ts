import type MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";

/**
 * GitHub-style alerts: a blockquote whose first line is exactly `[!NOTE]`,
 * `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` renders as a callout
 * box instead of a quote, with GitHub's class names so stylesheets written for
 * GitHub output apply.
 *
 * It renders as a `div`, as GitHub does, so quote styling (Tailwind's italic
 * quote marks, a template's blockquote rule) stays off it. Titles are English
 * like GitHub's: the pipeline renders documents and knows nothing of the UI
 * language.
 */

const TYPES = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
} as const;

type CalloutType = keyof typeof TYPES;

// Lucide icons (ISC), the set the app's own UI uses.
const ICONS: Record<CalloutType, string> = {
  note: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  tip: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  important:
    '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 15h.01"/><path d="M12 7v4"/>',
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  caution:
    '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>',
};

// The marker must be alone on the quote's first line, as on GitHub; `[!NOTE] text`
// stays an ordinary quote.
const MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;

export function calloutsPlugin(md: MarkdownIt): void {
  // After block parsing and before inline parsing, while the first paragraph is
  // still plain text and the marker can be cut off it.
  md.core.ruler.after("block", "callouts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i];
      if (open.type !== "blockquote_open") continue;
      const inline = tokens[i + 2];
      if (tokens[i + 1]?.type !== "paragraph_open" || inline?.type !== "inline") continue;
      const m = MARKER.exec(inline.content);
      if (!m) continue;

      const type = m[1].toLowerCase() as CalloutType;
      const close = findClose(tokens, i);
      open.tag = "div";
      tokens[close].tag = "div";
      open.attrJoin("class", `markdown-alert markdown-alert-${type}`);
      open.attrSet("role", "note");

      inline.content = inline.content.slice(m[0].length);
      const title = new state.Token("callout_title", "", 0);
      title.meta = { type };
      title.level = open.level + 1;
      // A marker on a line of its own leaves an empty paragraph behind.
      const removed = inline.content.trim() ? 0 : 3;
      tokens.splice(i + 1, removed, title);
    }
  });

  md.renderer.rules.callout_title = (tokens, idx) => {
    const type = tokens[idx].meta.type as CalloutType;
    return (
      `<p class="markdown-alert-title"><svg class="markdown-alert-icon" viewBox="0 0 24 24" aria-hidden="true">` +
      `${ICONS[type]}</svg>${TYPES[type]}</p>\n`
    );
  };
}

/** Index of the `blockquote_close` matching the one at `open`. */
function findClose(tokens: Token[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i].type === "blockquote_open") depth++;
    else if (tokens[i].type === "blockquote_close" && --depth === 0) return i;
  }
  return tokens.length - 1;
}
