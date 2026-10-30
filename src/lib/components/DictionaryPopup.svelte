<script lang="ts">
  import { tick } from "svelte";
  import { get } from "svelte/store";
  import { dictionaryLookup, type DictionaryLookup } from "$lib/stores/dictionary";
  import {
    briefView,
    dictionaryEdition,
    fetchDefinition,
    senseCount,
    wiktionaryUrl,
    type Definition,
  } from "$lib/utils/dictionary";
  import { locale, t, type MessageKey } from "$lib/i18n";

  type Result =
    | { status: "loading" }
    | { status: "error" }
    | { status: "missing" }
    | { status: "found"; def: Definition };

  const POS_KEYS: Record<string, MessageKey> = {
    noun: "dictionary.pos.noun",
    verb: "dictionary.pos.verb",
    adj: "dictionary.pos.adj",
    adv: "dictionary.pos.adv",
    name: "dictionary.pos.name",
    pron: "dictionary.pos.pron",
    prep: "dictionary.pos.prep",
    conj: "dictionary.pos.conj",
    intj: "dictionary.pos.intj",
    num: "dictionary.pos.num",
    det: "dictionary.pos.det",
    article: "dictionary.pos.article",
    phrase: "dictionary.pos.phrase",
    abbrev: "dictionary.pos.abbrev",
  };

  const GAP = 12;
  const MARGIN = 8;

  let result = $state<Result>({ status: "loading" });
  let expanded = $state(false);
  let popupEl: HTMLDivElement | undefined = $state();
  let left = $state(0);
  let top = $state(0);
  let request = 0;

  const lookup = $derived($dictionaryLookup);
  const edition = $derived(dictionaryEdition($locale));
  const shown = $derived(
    result.status === "found" ? (expanded ? result.def.languages : briefView(result.def)) : [],
  );
  const hidden = $derived(
    result.status === "found" ? senseCount(result.def.languages) - senseCount(briefView(result.def)) : 0,
  );
  const headIpa = $derived(shown[0]?.parts[0]?.ipa);

  $effect(() => {
    if (lookup) load(lookup);
  });

  // Re-place whenever the content changes size, so it never runs off screen.
  $effect(() => {
    void result;
    void expanded;
    if (lookup) tick().then(() => place(lookup));
  });

  async function load(l: DictionaryLookup) {
    const id = ++request;
    result = { status: "loading" };
    expanded = false;
    try {
      const def = await fetchDefinition(l.word, dictionaryEdition(get(locale)));
      if (id === request) result = def ? { status: "found", def } : { status: "missing" };
    } catch {
      if (id === request) result = { status: "error" };
    }
  }

  /** Below the pointer, or above it when there's no room below. */
  function place(l: DictionaryLookup) {
    if (!popupEl) return;
    const { width, height } = popupEl.getBoundingClientRect();
    left = Math.max(MARGIN, Math.min(l.x - 24, window.innerWidth - width - MARGIN));
    const below = l.y + GAP;
    top =
      below + height <= window.innerHeight - MARGIN
        ? below
        : Math.max(MARGIN, l.y - GAP - height);
  }

  function close() {
    request++;
    dictionaryLookup.set(null);
  }

  function languageName(code: string, ui: string): string {
    try {
      const name = new Intl.DisplayNames([ui], { type: "language" }).of(code) ?? code;
      return name.charAt(0).toLocaleUpperCase(ui) + name.slice(1);
    } catch {
      return code;
    }
  }

  function posLabel(pos: string): string {
    const key = POS_KEYS[pos];
    return key ? $t(key) : pos;
  }

  async function openWiktionary(word: string) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    openUrl(wiktionaryUrl(edition, word)).catch(() => {});
  }

  function inside(e: Event): boolean {
    return !!popupEl && e.target instanceof Node && popupEl.contains(e.target);
  }

  function onPointerDown(e: PointerEvent) {
    if (lookup && !inside(e)) close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (lookup && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  // The pop-up is pinned to where the word was; once the page moves under it,
  // it no longer points at anything.
  function onScroll(e: Event) {
    if (lookup && !inside(e)) close();
  }
</script>

<svelte:window
  onpointerdowncapture={onPointerDown}
  onkeydowncapture={onKeydown}
  onscrollcapture={onScroll}
  onresize={() => lookup && close()}
/>

{#if lookup}
  <div
    bind:this={popupEl}
    class="dict-popup print:hidden"
    role="dialog"
    aria-label={lookup.word}
    style="left: {left}px; top: {top}px;"
  >
    <div class="dict-head">
      <span class="dict-word">{lookup.word}</span>
      {#if headIpa}<span class="dict-ipa">{headIpa}</span>{/if}
    </div>

    {#if result.status === "loading"}
      <p class="dict-note">{$t("dictionary.loading")}</p>
    {:else if result.status === "missing"}
      <p class="dict-note">{$t("dictionary.notFound", { word: lookup.word })}</p>
    {:else if result.status === "error"}
      <p class="dict-note">{$t("dictionary.error")}</p>
      <div class="dict-foot">
        <button type="button" class="dict-action" onclick={() => load(lookup)}>{$t("dictionary.retry")}</button>
      </div>
    {:else}
      <div class="dict-body" class:expanded>
        {#each shown as language (language.lang)}
          {#if language.lang !== edition || (expanded && shown.length > 1)}
            <p class="dict-lang">{languageName(language.lang, $locale)}</p>
          {/if}
          {#each language.parts as part (part.pos)}
            <p class="dict-pos">
              {posLabel(part.pos)}
              {#if part.ipa && part.ipa !== headIpa}<span class="dict-ipa">{part.ipa}</span>{/if}
            </p>
            <ol class="dict-senses">
              {#each part.senses as sense, i (i)}
                <li>
                  <span class:clamp={!expanded}>{sense.text}</span>
                  {#if sense.example}<span class="dict-example" class:clamp-short={!expanded}>{sense.example}</span>{/if}
                </li>
              {/each}
            </ol>
          {/each}
        {/each}
      </div>
      <div class="dict-foot">
        {#if expanded}
          <button type="button" class="dict-action" onclick={() => (expanded = false)}>{$t("dictionary.less")}</button>
        {:else if hidden > 0}
          <button type="button" class="dict-action" onclick={() => (expanded = true)}>
            {$t("dictionary.more", { count: hidden })}
          </button>
        {:else}
          <span></span>
        {/if}
        <button
          type="button"
          class="dict-source"
          title={$t("dictionary.sourceTitle")}
          onclick={() => openWiktionary(lookup.word)}
        >
          {$t("dictionary.source")}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .dict-popup {
    position: fixed;
    z-index: 60;
    width: min(380px, calc(100vw - 16px));
    padding: 12px 14px 10px;
    font-size: 13px;
    line-height: 1.5;
    color: #1c1c1e;
    background: #fff;
    border: 1px solid #e5e5ea;
    border-radius: 10px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08), 0 12px 32px rgba(0, 0, 0, 0.12);
  }

  :global(html.dark) .dict-popup {
    color: #e5e5e7;
    background: #2c2c2e;
    border-color: #3a3a3c;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 12px 32px rgba(0, 0, 0, 0.4);
  }

  .dict-head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 2px 8px;
  }

  .dict-word {
    font-size: 17px;
    font-weight: 600;
  }

  .dict-ipa {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 12px;
    font-weight: 400;
    color: #8e8e93;
  }

  .dict-note {
    margin: 6px 0 2px;
    color: #636366;
  }

  :global(html.dark) .dict-note {
    color: #aeaeb2;
  }

  .dict-body.expanded {
    max-height: min(60vh, 480px);
    overflow-y: auto;
    margin-right: -8px;
    padding-right: 8px;
  }

  .dict-lang {
    margin: 10px 0 0;
    padding-bottom: 2px;
    font-size: 11px;
    color: #8e8e93;
    border-bottom: 1px solid #e5e5ea;
  }

  :global(html.dark) .dict-lang {
    border-bottom-color: #3a3a3c;
  }

  .dict-pos {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 8px 0 0;
    font-size: 11px;
    font-weight: 500;
    color: var(--accent);
  }

  :global(html.dark) .dict-pos {
    color: var(--accent-bright);
  }

  .dict-senses {
    margin: 2px 0 0;
    padding-left: 18px;
    list-style: decimal;
  }

  .dict-senses li {
    margin: 3px 0;
  }

  .dict-senses li::marker {
    color: #8e8e93;
    font-size: 11px;
  }

  .dict-example {
    display: block;
    font-style: italic;
    color: #636366;
  }

  :global(html.dark) .dict-example {
    color: #aeaeb2;
  }

  .clamp,
  .clamp-short {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .clamp {
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }

  .clamp-short {
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .dict-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding-top: 7px;
    border-top: 1px solid #e5e5ea;
    font-size: 11px;
  }

  :global(html.dark) .dict-foot {
    border-top-color: #3a3a3c;
  }

  .dict-action,
  .dict-source {
    padding: 0;
    font: inherit;
    background: none;
    border: none;
    cursor: pointer;
  }

  .dict-action {
    color: var(--accent);
  }

  :global(html.dark) .dict-action {
    color: var(--accent-bright);
  }

  .dict-source {
    color: #8e8e93;
  }

  .dict-action:hover,
  .dict-source:hover {
    text-decoration: underline;
  }
</style>
