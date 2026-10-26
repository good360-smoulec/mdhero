<script lang="ts">
  import { get } from "svelte/store";
  import { tocEntries, activeHeadingId, tocVisible, setActiveHeading } from "$lib/stores/toc";
  import {
    settings,
    clampTocWidth,
    maxTocWidthFor,
    DEFAULT_TOC_WIDTH,
    MIN_TOC_WIDTH,
  } from "$lib/stores/settings";
  import { chromeTop, sideTabsWidth } from "$lib/utils/layout";
  import PanelResizer from "./PanelResizer.svelte";
  import { t } from "$lib/i18n";
  import { document as docStore } from "$lib/stores/document";
  import { collapsedSections, revealElement, sectionsActive, setCollapsedSections, toggleSection } from "$lib/stores/sections";
  import { collapseToLevel, hiddenItems } from "$lib/utils/sections";

  // The outline mirrors the document: entries inside a collapsed section are
  // hidden, and the level buttons show headings down to a level.
  let path = $derived($docStore.filePath);
  let collapsed = $derived(new Set(path ? $collapsedSections[path] ?? [] : []));
  let canCollapse = $derived($sectionsActive && !!path);
  let hidden = $derived(canCollapse ? hiddenItems($tocEntries, collapsed) : $tocEntries.map(() => false));
  let levels = $derived(
    Array.from({ length: Math.min(4, Math.max(0, ...$tocEntries.map((e) => e.level))) }, (_, i) => i + 1),
  );
  let currentLevel = $derived(
    levels.find((level) => {
      const ids = collapseToLevel($tocEntries, level);
      return ids.length === collapsed.size && ids.every((id) => collapsed.has(id));
    }) ?? null,
  );

  function showToLevel(level: number) {
    if (path) setCollapsedSections(path, collapseToLevel($tocEntries, level));
  }

  function expandAll() {
    if (path) setCollapsedSections(path, []);
  }

  /** The width the ToC shares with the document: the window, less the side
   *  tabs panel when there is one. */
  function availableWidth(): number {
    return window.innerWidth - sideTabsWidth(get(settings));
  }

  function scrollToHeading(id: string) {
    setActiveHeading(id);
    const el = document.getElementById(id);
    revealElement(el);
    if (el) {
      const offset = chromeTop() - 5;
      const y = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }

  function getIndent(level: number): string {
    return `${(level - 1) * 12}px`;
  }
</script>

{#if $tocVisible && $tocEntries.length > 0}
  <aside class="toc-sidebar">
    <div class="toc-header">
      <span>{$t('toc.onThisPage')}</span>
      {#if canCollapse && levels.length > 0}
        <div class="toc-levels" role="group" aria-label={$t('toc.levelsLabel')}>
          {#each levels as level (level)}
            <button
              class="level-btn"
              class:current={currentLevel === level}
              onclick={() => showToLevel(level)}
              title={$t('toc.showToLevel', { count: level })}
              aria-label={$t('toc.showToLevel', { count: level })}
            >{level}</button>
          {/each}
          <button
            class="level-btn"
            class:current={collapsed.size === 0}
            onclick={expandAll}
            title={$t('toc.expandAll')}
            aria-label={$t('toc.expandAll')}
          >
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="4,3 8,7 12,3" /><polyline points="4,9 8,13 12,9" />
            </svg>
          </button>
        </div>
      {/if}
    </div>
    <nav class="toc-nav">
      {#each $tocEntries as entry, i (entry.id)}
        {#if !hidden[i]}
          <div class="toc-row">
            {#if canCollapse}
              <button
                class="toc-chevron"
                class:collapsed={collapsed.has(entry.id)}
                style="left: {getIndent(entry.level)}"
                onclick={() => path && toggleSection(path, entry.id)}
                aria-expanded={!collapsed.has(entry.id)}
                aria-label={collapsed.has(entry.id) ? $t('sections.expand') : $t('sections.collapse')}
                title={collapsed.has(entry.id) ? $t('sections.expand') : $t('sections.collapse')}
              >
                <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="4,6 8,10 12,6" />
                </svg>
              </button>
            {/if}
            <button
              onclick={() => scrollToHeading(entry.id)}
              class="toc-item"
              class:active={$activeHeadingId === entry.id}
              style="padding-left: calc({canCollapse ? 22 : 12}px + {getIndent(entry.level)})"
            >
              {entry.text}
            </button>
          </div>
        {/if}
      {/each}
    </nav>
  </aside>
  <!-- z-index 14 like the sidebar, not 15: the top tab bar is 15 and renders
       before the handle, so a 15 here would paint the strip across it while
       the sidebar itself correctly tucks underneath. `--toc-w` is owned by
       +page.svelte, which re-publishes it whenever the stored value changes. -->
  <PanelResizer
    width={$settings.tocWidth}
    min={MIN_TOC_WIDTH}
    defaultWidth={DEFAULT_TOC_WIDTH}
    clampWidth={(value) => clampTocWidth(value, availableWidth())}
    maxWidth={() => maxTocWidthFor(availableWidth())}
    cssVar="--toc-w"
    resizingClass="toc-resizing"
    label={$t('toc.resize')}
    left="calc(var(--tabs-w, 0px) + var(--toc-w, 240px) - 11px)"
    top="calc(var(--chrome-top, 88px) + 8px)"
    bottom="calc(var(--status-h, 0px) + 8px)"
    zIndex={14}
    onCommit={(width) => settings.update((s) => ({ ...s, tocWidth: width }))}
  />
{/if}

<style>
  /* A card inset 8px on every side of its `--toc-w` column, so it never sits
     flush against the side tabs panel and the document keeps its padding. It
     ends 8px above the status bar (`--status-h`, published by StatusBar). */
  .toc-sidebar {
    position: fixed;
    left: calc(var(--tabs-w, 0px) + 8px);
    top: calc(var(--chrome-top, 88px) + 8px);
    bottom: calc(var(--status-h, 0px) + 8px);
    width: calc(var(--toc-w, 240px) - 16px);
    background: #fafafa;
    border: 1px solid #e5e5e5;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    overflow-y: auto;
    z-index: 14;
  }

  :global(html.dark) .toc-sidebar {
    background: #1c1c1e;
    border-color: #2c2c2e;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3);
  }

  .toc-header {
    padding: 12px 16px 8px;
    font-size: 11px;
    font-weight: 600;
    color: #aeaeb2;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .toc-nav {
    padding: 0 8px 16px;
  }

  .toc-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 4px 12px;
    font-size: 13px;
    color: #636366;
    background: none;
    border: none;
    border-left: 2px solid transparent;
    border-radius: 0;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.15s, border-color 0.15s;
    line-height: 1.6;
  }

  :global(html.dark) .toc-item {
    color: #8e8e93;
  }

  .toc-item:hover {
    color: #1c1c1e;
  }

  :global(html.dark) .toc-item:hover {
    color: #e5e5e7;
  }

  .toc-item.active {
    color: #0891B2;
    border-left-color: #0891B2;
    border-left-width: 3px;
    font-weight: 500;
    background: rgba(8, 145, 178, 0.06);
    border-radius: 0 4px 4px 0;
  }

  :global(html.dark) .toc-item.active {
    color: #22D3EE;
    border-left-color: #22D3EE;
    background: rgba(34, 211, 238, 0.08);
  }

  .toc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .toc-levels {
    display: inline-flex;
    gap: 2px;
    text-transform: none;
    letter-spacing: 0;
  }

  .level-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    font-size: 10.5px;
    font-weight: 600;
    color: #8e8e93;
    border-radius: 4px;
  }

  .level-btn:hover {
    color: #1c1c1e;
    background: rgba(127, 127, 127, 0.14);
  }

  .level-btn.current {
    color: #0891b2;
    background: rgba(8, 145, 178, 0.1);
  }

  :global(html.dark) .level-btn:hover {
    color: #e5e5e7;
  }

  :global(html.dark) .level-btn.current {
    color: #22d3ee;
    background: rgba(34, 211, 238, 0.1);
  }

  .toc-row {
    position: relative;
  }

  .toc-chevron {
    position: absolute;
    top: 50%;
    margin-left: 6px;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    color: #aeaeb2;
    border-radius: 4px;
    z-index: 1;
  }

  .toc-chevron:hover {
    color: #1c1c1e;
    background: rgba(127, 127, 127, 0.14);
  }

  :global(html.dark) .toc-chevron:hover {
    color: #e5e5e7;
  }

  .toc-chevron svg {
    transition: transform 0.15s;
  }

  .toc-chevron.collapsed {
    color: #0891b2;
  }

  .toc-chevron.collapsed svg {
    transform: rotate(-90deg);
  }

  @media print {
    .toc-sidebar { display: none !important; }
  }
</style>
