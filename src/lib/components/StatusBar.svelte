<script lang="ts">
  import { document as docStore } from "$lib/stores/document";
  import { clearDocChanges, markedChangeCount } from "$lib/stores/docChanges";
  import { revealElement } from "$lib/stores/sections";
  import { documentStats, extractDocText, READING_WPM } from "$lib/utils/doc-stats";
  import { t } from "$lib/i18n";
  import StatsPanel from "./StatsPanel.svelte";

  // $t, not translate(): these run in the template, so they must re-run when
  // the language changes.
  function readingTime(words: number): string {
    const mins = Math.ceil(words / READING_WPM);
    return mins <= 1 ? $t("statusbar.minRead") : $t("statusbar.minReadN", { count: mins });
  }

  function tokenEstimate(tokens: number): string {
    return tokens >= 1000
      ? $t("statusbar.tokensK", { count: Math.round(tokens / 100) / 10 })
      : $t("statusbar.tokens", { count: tokens });
  }

  let visible = $derived(!!$docStore.renderedHtml && $docStore.wordCount > 0);
  let stats = $derived(visible ? documentStats(extractDocText($docStore.renderedHtml), $docStore.content) : null);
  let height = $state(0);
  let panelOpen = $state(false);

  // Publish the bar's height as `--status-h` so the fixed panels above it (the
  // table of contents) stop short of it instead of running across it. Unset
  // while the bar is hidden or unmounted (zen, edit, presenting).
  $effect(() => {
    const root = document.documentElement;
    root.style.setProperty("--status-h", `${visible ? height : 0}px`);
    return () => root.style.removeProperty("--status-h");
  });

  $effect(() => {
    if (!visible) panelOpen = false;
  });

  // Stepping through the blocks the last reload changed. A block a page break
  // split is visited once.
  let current = $state(-1);
  $effect(() => {
    $markedChangeCount;
    $docStore.filePath;
    current = -1;
  });

  function changedBlocks(): HTMLElement[] {
    const root = document.querySelector("article.md-content");
    if (!root) return [];
    const seen = new Set<string>();
    return Array.from(root.querySelectorAll<HTMLElement>(".md-changed, .md-removed-before, .md-removed-after")).filter((el) => {
      const line = el.dataset.sourceLine ?? "";
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
  }

  function goToChange(step: number) {
    const blocks = changedBlocks();
    if (blocks.length === 0) return;
    current = (current + step + blocks.length) % blocks.length;
    document.querySelectorAll(".md-change-current").forEach((el) => el.classList.remove("md-change-current"));
    const block = blocks[current];
    revealElement(block);
    block.classList.add("md-change-current");
    block.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function dismissChanges() {
    document.querySelectorAll(".md-change-current").forEach((el) => el.classList.remove("md-change-current"));
    if ($docStore.filePath) clearDocChanges($docStore.filePath);
  }
</script>

{#if visible && stats}
  <footer class="status-bar" bind:offsetHeight={height}>
    <button
      class="stats-button"
      onclick={() => (panelOpen = !panelOpen)}
      aria-expanded={panelOpen}
      aria-haspopup="dialog"
      title={$t("statusbar.statsTitle")}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
        <line x1="3" y1="13" x2="3" y2="8" />
        <line x1="8" y1="13" x2="8" y2="3" />
        <line x1="13" y1="13" x2="13" y2="6" />
      </svg>
      <span>{$t("statusbar.words", { count: stats.words })}</span>
      <span class="sep">&middot;</span>
      <span>{readingTime(stats.words)}</span>
      <span class="sep">&middot;</span>
      <span>{tokenEstimate(stats.tokens)}</span>
    </button>

    {#if $markedChangeCount > 0}
      <div class="changes" role="group" aria-label={$t("statusbar.changes", { count: $markedChangeCount })}>
        <span class="dot" aria-hidden="true"></span>
        <span>{$t("statusbar.changes", { count: $markedChangeCount })}</span>
        <button onclick={() => goToChange(-1)} title={$t("statusbar.prevChange")} aria-label={$t("statusbar.prevChange")}>&uarr;</button>
        <button onclick={() => goToChange(1)} title={$t("statusbar.nextChange")} aria-label={$t("statusbar.nextChange")}>&darr;</button>
        <button onclick={dismissChanges} title={$t("statusbar.dismissChanges")} aria-label={$t("statusbar.dismissChanges")}>&times;</button>
      </div>
    {/if}
  </footer>

  {#if panelOpen}
    <StatsPanel {stats} onClose={() => (panelOpen = false)} />
  {/if}
{/if}

<style>
  .status-bar {
    position: fixed;
    bottom: 0;
    left: var(--tabs-w, 0px);
    right: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px 16px;
    font-size: 12px;
    color: #6e6e73;
    background: rgba(250, 250, 250, 0.9);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-top: 1px solid #e5e5ea;
  }

  :global(html.dark) .status-bar {
    background: rgba(22, 22, 24, 0.9);
    border-top-color: #2c2c2e;
    color: #98989d;
  }

  .stats-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px;
    border-radius: 6px;
    color: inherit;
  }

  .stats-button:hover,
  .stats-button[aria-expanded="true"] {
    color: #1c1c1e;
    background: rgba(127, 127, 127, 0.12);
  }

  :global(html.dark) .stats-button:hover,
  :global(html.dark) .stats-button[aria-expanded="true"] {
    color: #f2f2f7;
  }

  .sep {
    color: #c7c7cc;
  }

  :global(html.dark) .sep {
    color: #48484a;
  }

  .changes {
    position: absolute;
    right: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #9a6700;
  }

  :global(html.dark) .changes {
    color: #d29922;
  }

  .dot {
    width: 7px;
    height: 7px;
    margin-right: 2px;
    border-radius: 50%;
    background: #e8a400;
  }

  .changes button {
    min-width: 20px;
    padding: 0 4px;
    border-radius: 5px;
    color: inherit;
    line-height: 18px;
  }

  .changes button:hover {
    background: rgba(232, 164, 0, 0.16);
  }

  @media print {
    .status-bar { display: none !important; }
  }
</style>
