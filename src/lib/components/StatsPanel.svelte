<script lang="ts">
  import { t } from "$lib/i18n";
  import type { MessageKey } from "$lib/i18n/types";
  import { LONG_SENTENCE, READING_WPM, SPEAKING_WPM, type DocStats } from "$lib/utils/doc-stats";

  let { stats, onClose }: { stats: DocStats; onClose: () => void } = $props();

  const LEVEL_KEYS: Record<NonNullable<DocStats["readability"]>["level"], MessageKey> = {
    veryEasy: "stats.levelVeryEasy",
    easy: "stats.levelEasy",
    fairlyEasy: "stats.levelFairlyEasy",
    plain: "stats.levelPlain",
    fairlyDifficult: "stats.levelFairlyDifficult",
    difficult: "stats.levelDifficult",
    veryDifficult: "stats.levelVeryDifficult",
  };

  const n = (value: number) => value.toLocaleString();

  function duration(minutes: number): string {
    return minutes < 1 ? $t("stats.underMinute") : $t("stats.minutes", { count: Math.round(minutes) });
  }

  let contains = $derived(
    [
      stats.tables && $t("stats.tables", { count: stats.tables }),
      stats.codeBlocks && $t("stats.codeBlocks", { count: stats.codeBlocks }),
      stats.images && $t("stats.images", { count: stats.images }),
      stats.links && $t("stats.links", { count: stats.links }),
    ].filter(Boolean) as string[],
  );

  // Caught on the way down, before the page's own Escape handling, which would
  // otherwise also close the tab when "close on Escape" is on.
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydowncapture={onKeydown} />

<button class="backdrop" aria-label={$t("stats.close")} onclick={onClose}></button>

<div class="panel" role="dialog" aria-label={$t("stats.title")}>
  <header>
    <h2>{$t("stats.title")}</h2>
    <button class="close" onclick={onClose} aria-label={$t("stats.close")}>&times;</button>
  </header>

  <section>
    <h3>{$t("stats.length")}</h3>
    <dl>
      <dt>{$t("stats.words")}</dt><dd>{n(stats.words)}</dd>
      <dt>{$t("stats.characters")}</dt><dd>{n(stats.characters)}</dd>
      <dt>{$t("stats.charactersNoSpaces")}</dt><dd>{n(stats.charactersNoSpaces)}</dd>
      <dt>{$t("stats.sentences")}</dt><dd>{n(stats.sentences)}</dd>
      <dt>{$t("stats.paragraphs")}</dt><dd>{n(stats.paragraphs)}</dd>
      <dt>{$t("stats.headings")}</dt><dd>{n(stats.headings)}</dd>
    </dl>
    {#if contains.length}
      <p class="hint">{$t("stats.contains")}: {contains.join(" · ")}</p>
    {/if}
  </section>

  <section>
    <h3>{$t("stats.time")}</h3>
    <dl>
      <dt>{$t("stats.readingTime")}</dt><dd>{duration(stats.readingMinutes)}</dd>
      <dt>{$t("stats.speakingTime")}</dt><dd>{duration(stats.speakingMinutes)}</dd>
    </dl>
    <p class="hint">{$t("stats.timeHint", { read: READING_WPM, speak: SPEAKING_WPM })}</p>
  </section>

  <section>
    <h3>{$t("stats.readability")}</h3>
    {#if stats.readability}
      <dl>
        <dt>{$t("stats.ease")}</dt>
        <dd>{stats.readability.ease} · {$t(LEVEL_KEYS[stats.readability.level])}</dd>
        <dt>{$t("stats.grade")}</dt>
        <dd>{$t("stats.gradeValue", { count: stats.readability.grade })}</dd>
        <dt>{$t("stats.averageSentence")}</dt>
        <dd>{$t("stats.wordsN", { count: stats.averageSentenceWords })}</dd>
        <dt>{$t("stats.longSentences", { count: LONG_SENTENCE })}</dt>
        <dd>{n(stats.longSentences)}</dd>
      </dl>
      {#if stats.longestSentence}
        <p class="longest">
          <span class="label">{$t("stats.longest")} ({$t("stats.wordsN", { count: stats.longestSentence.words })}):</span>
          “{stats.longestSentence.text.length > 160 ? stats.longestSentence.text.slice(0, 160) + "…" : stats.longestSentence.text}”
        </p>
      {/if}
      <p class="hint">{$t("stats.readabilityHint")}</p>
    {:else}
      <p class="hint">{$t("stats.readabilityUnavailable")}</p>
    {/if}
  </section>

  <section>
    <h3>{$t("stats.repeated")}</h3>
    {#if stats.repeatedWords.length}
      <ul class="chips">
        {#each stats.repeatedWords as { word, count } (word)}
          <li>{word} <span class="count">×{count}</span></li>
        {/each}
      </ul>
      <p class="hint">{$t("stats.repeatedHint")}</p>
    {:else}
      <p class="hint">{$t("stats.repeatedNone")}</p>
    {/if}
  </section>

  <section>
    <h3>{$t("stats.tokens")}</h3>
    <dl>
      <dt>{$t("stats.tokens")}</dt><dd>~{n(stats.tokens)}</dd>
    </dl>
    <p class="hint">{$t("stats.tokensExplain")}</p>
  </section>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: transparent;
    border: none;
    cursor: default;
  }

  .panel {
    position: fixed;
    bottom: calc(var(--status-h, 28px) + 8px);
    left: calc(50% + var(--tabs-w, 0px) / 2);
    transform: translateX(-50%);
    z-index: 31;
    width: min(400px, calc(100vw - 32px));
    max-height: min(70vh, 640px);
    overflow-y: auto;
    padding: 14px 18px 16px;
    font-size: 12.5px;
    line-height: 1.45;
    color: #3a3a3c;
    background: #fff;
    border: 1px solid #e5e5ea;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  }

  :global(html.dark) .panel {
    color: #d1d1d6;
    background: #232325;
    border-color: #3a3a3c;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  h2 {
    font-size: 14px;
    font-weight: 600;
  }

  .close {
    font-size: 18px;
    line-height: 1;
    padding: 2px 6px;
    color: #8e8e93;
    border-radius: 6px;
  }

  .close:hover {
    background: rgba(127, 127, 127, 0.12);
  }

  section {
    padding: 10px 0;
    border-top: 1px solid #f0f0f2;
  }

  :global(html.dark) section {
    border-top-color: #333336;
  }

  h3 {
    margin-bottom: 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #8e8e93;
  }

  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3px 16px;
  }

  dd {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .hint {
    margin-top: 6px;
    font-size: 11.5px;
    color: #8e8e93;
  }

  .longest {
    margin-top: 8px;
    font-size: 12px;
  }

  .label {
    color: #8e8e93;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chips li {
    padding: 2px 8px;
    border-radius: 999px;
    background: #f2f2f7;
  }

  :global(html.dark) .chips li {
    background: #2c2c2e;
  }

  .count {
    color: #8e8e93;
  }
</style>
