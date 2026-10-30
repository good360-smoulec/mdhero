<script lang="ts">
  import { X, SlidersHorizontal, Palette, FileText, ListOrdered, SquarePen, Sparkles } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { settings } from "$lib/stores/settings";
  import { NO_TEMPLATE, templateLabel, type PageSize } from "$lib/templates";
  import { allTemplates } from "$lib/stores/userTemplates";
  import { isMac } from "$lib/utils/platform";
  import { ACCENT_PRESETS, normalizeAccent } from "$lib/utils/accent";
  import type { MessageKey } from "$lib/i18n/types";
  import { t, locale, setLocale, SUPPORTED_LOCALES, type Locale } from "$lib/i18n";
  import AILookupSettings from "./AILookupSettings.svelte";
  import TemplateSettings from "./TemplateSettings.svelte";
  import { NUMBERING_PRESETS, MAX_TOC_DEPTH, formatNumber, parseNumbering } from "$lib/utils/contents";

  let { visible = $bindable(false) }: { visible: boolean } = $props();

  const TABS = [
    { id: "general", label: "settings.tabGeneral", icon: SlidersHorizontal },
    { id: "appearance", label: "settings.appearance", icon: Palette },
    { id: "templates", label: "settings.tabTemplates", icon: FileText },
    { id: "layout", label: "settings.tabLayout", icon: ListOrdered },
    { id: "editor", label: "settings.editor", icon: SquarePen },
    { id: "ai", label: "settings.aiLookup", icon: Sparkles },
  ] as const satisfies readonly { id: string; label: MessageKey; icon: unknown }[];
  type TabId = (typeof TABS)[number]["id"];

  // The last tab used, so tweaking a setting and checking the result doesn't
  // mean finding the tab again.
  const TAB_KEY = "mdhero-settings-tab";
  function loadTab(): TabId {
    try {
      const stored = localStorage.getItem(TAB_KEY);
      return TABS.find((item) => item.id === stored)?.id ?? "general";
    } catch {
      return "general";
    }
  }
  let tab = $state<TabId>(loadTab());

  function chooseTab(id: TabId) {
    tab = id;
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {}
  }

  // In a narrow window the tabs are a row that scrolls; keep the open one in sight.
  $effect(() => {
    if (!visible) return;
    document.getElementById(`settings-tab-${tab}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  /** Arrow keys, Home and End move between tabs, as in a native tab list. */
  function handleTabKeydown(e: KeyboardEvent) {
    const i = TABS.findIndex((item) => item.id === tab);
    let next = i;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    chooseTab(TABS[next].id);
    document.getElementById(`settings-tab-${TABS[next].id}`)?.focus();
  }

  const PRESET_LABELS: Record<string, MessageKey> = {
    teal: "settings.accentTeal",
    blue: "settings.accentBlue",
    indigo: "settings.accentIndigo",
    violet: "settings.accentViolet",
    pink: "settings.accentPink",
    red: "settings.accentRed",
    orange: "settings.accentOrange",
    green: "settings.accentGreen",
    graphite: "settings.accentGraphite",
  };

  let isCustom = $derived(!ACCENT_PRESETS.some((p) => p.shades.accent === $settings.accentColor));

  function setAccent(color: string) {
    settings.update((s) => ({ ...s, accentColor: normalizeAccent(color) }));
  }

  // Not in the settings store: a new launch decides whether to join this
  // window before its webview exists, so Rust owns this one (#71).
  const showWindowMode = !isMac();
  let openInExistingWindow = $state(false);

  $effect(() => {
    if (visible && showWindowMode) {
      invoke<boolean>("get_open_in_existing_window")
        .then((enabled) => (openInExistingWindow = enabled))
        .catch(() => {});
    }
  });

  function setOpenInExistingWindow(enabled: boolean) {
    openInExistingWindow = enabled;
    invoke("set_open_in_existing_window", { enabled }).catch(() => {
      openInExistingWindow = !enabled;
    });
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) visible = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      visible = false;
    }
  }

  const CUSTOM_NUMBERING = "custom";
  const isPreset = (format: string) => format === "" || (NUMBERING_PRESETS as readonly string[]).includes(format);
  let customNumbering = $state(!isPreset($settings.headingNumbering));
  let numberingChoice = $derived(customNumbering ? CUSTOM_NUMBERING : $settings.headingNumbering);
  /** The first heading at each level, then the next one at the deepest, numbered as the format would. */
  let numberingPreview = $derived.by(() => {
    const parsed = parseNumbering($settings.headingNumbering);
    if (!parsed) return null;
    const counters: number[][] = parsed.map((_, i) => Array.from({ length: i + 1 }, () => 1));
    counters.push([...counters[counters.length - 1].slice(0, -1), 2]);
    return counters.map((c) => formatNumber(parsed, c)).filter(Boolean).join(" · ");
  });

  function chooseNumbering(value: string) {
    customNumbering = value === CUSTOM_NUMBERING;
    if (customNumbering) return;
    settings.update((s) => ({ ...s, headingNumbering: value }));
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
    <div class="dialog">
      <div class="dialog-header">
        <h2 class="dialog-title">{$t('settings.title')}</h2>
        <button onclick={() => (visible = false)} class="dialog-close" aria-label={$t('common.close')}>
          <X size={16} />
        </button>
      </div>

      <div class="dialog-body">
        <div
          class="settings-tabs"
          role="tablist"
          aria-orientation="vertical"
          aria-label={$t('settings.title')}
          tabindex="-1"
          onkeydown={handleTabKeydown}
        >
          {#each TABS as item (item.id)}
            <button
              type="button"
              role="tab"
              id="settings-tab-{item.id}"
              class="settings-tab"
              class:active={tab === item.id}
              aria-selected={tab === item.id}
              aria-controls="settings-panel-{item.id}"
              tabindex={tab === item.id ? 0 : -1}
              onclick={() => chooseTab(item.id)}
            >
              <item.icon size={15} />
              <span>{$t(item.label)}</span>
            </button>
          {/each}
        </div>

        <div class="settings-panels">
          {#if tab === "general"}
            <div class="settings-panel" role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general">
              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.language')}</span>
                  <span class="setting-hint">{$t('settings.languageHint')}</span>
                </div>
                <select
                  class="setting-select"
                  value={$locale}
                  onchange={(e) => setLocale(e.currentTarget.value as Locale)}
                >
                  {#each SUPPORTED_LOCALES as l (l.code)}
                    <option value={l.code}>{l.nativeName} · {l.label}</option>
                  {/each}
                </select>
              </label>

              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.closeOnEscape')}</span>
                  <span class="setting-hint">{$t('settings.closeOnEscapeHint')}</span>
                </div>
                <input
                  type="checkbox"
                  checked={$settings.closeOnEscape}
                  onchange={(e) => settings.update((s) => ({ ...s, closeOnEscape: e.currentTarget.checked }))}
                  class="setting-switch"
                />
              </label>

              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.restoreTabs')}</span>
                  <span class="setting-hint">{$t('settings.restoreTabsHint')}</span>
                </div>
                <input
                  type="checkbox"
                  checked={$settings.restoreTabsOnLaunch}
                  onchange={(e) => settings.update((s) => ({ ...s, restoreTabsOnLaunch: e.currentTarget.checked }))}
                  class="setting-switch"
                />
              </label>

              {#if showWindowMode}
                <label class="setting-row">
                  <div class="setting-text">
                    <span class="setting-label">{$t('settings.openInExistingWindow')}</span>
                    <span class="setting-hint">{$t('settings.openInExistingWindowHint')}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={openInExistingWindow}
                    onchange={(e) => setOpenInExistingWindow(e.currentTarget.checked)}
                    class="setting-switch"
                  />
                </label>
              {/if}

              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.autoPresentMarp')}</span>
                  <span class="setting-hint">{#each $t('settings.autoPresentMarpHint').split('{code}') as part, i}{#if i > 0}<code>marp: true</code>{/if}{part}{/each}</span>
                </div>
                <input
                  type="checkbox"
                  checked={$settings.autoPresentMarp}
                  onchange={(e) => settings.update((s) => ({ ...s, autoPresentMarp: e.currentTarget.checked }))}
                  class="setting-switch"
                />
              </label>

              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.highlightChanges')}</span>
                  <span class="setting-hint">{$t('settings.highlightChangesHint')}</span>
                </div>
                <input
                  type="checkbox"
                  checked={$settings.highlightChanges}
                  onchange={(e) => settings.update((s) => ({ ...s, highlightChanges: e.currentTarget.checked }))}
                  class="setting-switch"
                />
              </label>

              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.autoCheckUpdates')}</span>
                  <span class="setting-hint">{$t('settings.autoCheckUpdatesHint')}</span>
                </div>
                <input
                  type="checkbox"
                  checked={$settings.autoCheckUpdates}
                  onchange={(e) => settings.update((s) => ({ ...s, autoCheckUpdates: e.currentTarget.checked }))}
                  class="setting-switch"
                />
              </label>
            </div>
          {/if}
          {#if tab === "appearance"}
            <div class="settings-panel" role="tabpanel" id="settings-panel-appearance" aria-labelledby="settings-tab-appearance">
              <div class="setting-row accent-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.accentColor')}</span>
                  <span class="setting-hint">{$t('settings.accentColorHint')}</span>
                </div>
                <div class="accent-swatches" role="radiogroup" aria-label={$t('settings.accentColor')}>
                  {#each ACCENT_PRESETS as p (p.id)}
                    <button
                      type="button"
                      role="radio"
                      class="accent-swatch"
                      style="--swatch: {p.shades.accent}"
                      aria-checked={$settings.accentColor === p.shades.accent}
                      aria-label={$t(PRESET_LABELS[p.id])}
                      title={$t(PRESET_LABELS[p.id])}
                      onclick={() => setAccent(p.shades.accent)}
                    ></button>
                  {/each}
                  <label
                    class="accent-swatch accent-custom"
                    class:selected={isCustom}
                    style="--swatch: {isCustom ? $settings.accentColor : 'transparent'}"
                    title={$t('settings.accentCustom')}
                  >
                    <input
                      type="color"
                      value={$settings.accentColor}
                      aria-label={$t('settings.accentCustom')}
                      oninput={(e) => setAccent(e.currentTarget.value)}
                    />
                  </label>
                </div>
              </div>

              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.tabsOnSide')}</span>
                  <span class="setting-hint">{$t('settings.tabsOnSideHint')}</span>
                </div>
                <input
                  type="checkbox"
                  checked={$settings.tabsPosition === "side"}
                  onchange={(e) => settings.update((s) => ({ ...s, tabsPosition: e.currentTarget.checked ? "side" : "top" }))}
                  class="setting-switch"
                />
              </label>
            </div>
          {/if}
          {#if tab === "templates"}
            <div class="settings-panel" role="tabpanel" id="settings-panel-templates" aria-labelledby="settings-tab-templates">
              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.defaultTemplate')}</span>
                  <span class="setting-hint">{#each $t('settings.defaultTemplateHint').split('{code}') as part, i}{#if i > 0}<code>template:</code>{/if}{part}{/each}</span>
                </div>
                <select
                  class="setting-select"
                  value={$settings.defaultTemplate}
                  onchange={(e) => settings.update((s) => ({ ...s, defaultTemplate: e.currentTarget.value }))}
                >
                  <option value={NO_TEMPLATE}>{$t('templates.none')}</option>
                  {#each $allTemplates as tpl (tpl.id)}
                    <option value={tpl.id}>{templateLabel(tpl, $t)}</option>
                  {/each}
                </select>
              </label>

              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.pageSize')}</span>
                  <span class="setting-hint">{#each $t('settings.pageSizeHint').split('{code}') as part, i}{#if i > 0}<code>papersize:</code>{/if}{part}{/each}</span>
                </div>
                <select
                  class="setting-select"
                  value={$settings.pageSize}
                  onchange={(e) => settings.update((s) => ({ ...s, pageSize: e.currentTarget.value as PageSize }))}
                >
                  <option value="letter">{$t('settings.pageSizeLetter')}</option>
                  <option value="a4">{$t('settings.pageSizeA4')}</option>
                </select>
              </label>

              <p class="section-hint" style="margin-top: 12px;">{$t('settings.templatesHint')}</p>
              <TemplateSettings />
            </div>
          {/if}
          {#if tab === "layout"}
            <div class="settings-panel" role="tabpanel" id="settings-panel-layout" aria-labelledby="settings-tab-layout">
              <section class="settings-section">
                <h3 class="section-title">{$t('settings.contents')}</h3>

                <label class="setting-row">
                  <div class="setting-text">
                    <span class="setting-label">{$t('settings.tocDefault')}</span>
                    <span class="setting-hint">{#each $t('settings.tocDefaultHint').split('{code}') as part, i}{#if i > 0}<code>[TOC]</code>{/if}{part}{/each}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={$settings.tocDefault}
                    onchange={(e) => settings.update((s) => ({ ...s, tocDefault: e.currentTarget.checked }))}
                    class="setting-switch"
                  />
                </label>

                <label class="setting-row">
                  <div class="setting-text">
                    <span class="setting-label">{$t('settings.tocDepth')}</span>
                    <span class="setting-hint">{#each $t('settings.tocDepthHint').split('{code}') as part, i}{#if i > 0}<code>toc-depth:</code>{/if}{part}{/each}</span>
                  </div>
                  <select
                    class="setting-select"
                    value={$settings.tocDepth}
                    onchange={(e) => settings.update((s) => ({ ...s, tocDepth: Number(e.currentTarget.value) }))}
                  >
                    {#each Array.from({ length: MAX_TOC_DEPTH }, (_, i) => i + 1) as n (n)}
                      <option value={n}>{n}</option>
                    {/each}
                  </select>
                </label>

                <label class="setting-row">
                  <div class="setting-text">
                    <span class="setting-label">{$t('settings.headingNumbering')}</span>
                    <span class="setting-hint">{#each $t('settings.headingNumberingHint').split('{code}') as part, i}{#if i > 0}<code>numbering:</code>{/if}{part}{/each}</span>
                  </div>
                  <select
                    class="setting-select"
                    value={numberingChoice}
                    onchange={(e) => chooseNumbering(e.currentTarget.value)}
                  >
                    <option value="">{$t('contents.numberingNone')}</option>
                    {#each NUMBERING_PRESETS as format (format)}
                      <option value={format}>{format}</option>
                    {/each}
                    <option value={CUSTOM_NUMBERING}>{$t('contents.numberingCustom')}</option>
                  </select>
                </label>

                {#if customNumbering}
                  <label class="setting-row">
                    <div class="setting-text">
                      <span class="setting-label">{$t('settings.numberingFormat')}</span>
                      <span class="setting-hint">
                        {#if !$settings.headingNumbering.trim()}
                          {$t('settings.numberingFormatHint')}
                        {:else if numberingPreview}
                          {$t('contents.numberingPreview', { preview: numberingPreview })}
                        {:else}
                          <span class="setting-error">{$t('contents.numberingInvalid')}</span>
                        {/if}
                      </span>
                    </div>
                    <input
                      type="text"
                      class="setting-input"
                      value={$settings.headingNumbering}
                      placeholder="1., 1.a., 1.a.i."
                      oninput={(e) => settings.update((s) => ({ ...s, headingNumbering: e.currentTarget.value }))}
                    />
                  </label>
                {/if}

                <label class="setting-row">
                  <div class="setting-text">
                    <span class="setting-label">{$t('settings.tocTitle')}</span>
                    <span class="setting-hint">{#each $t('settings.tocTitleHint').split('{code}') as part, i}{#if i > 0}<code>toc-title:</code>{/if}{part}{/each}</span>
                  </div>
                  <input
                    type="text"
                    class="setting-input"
                    value={$settings.tocTitle}
                    placeholder={$t('contents.title')}
                    oninput={(e) => settings.update((s) => ({ ...s, tocTitle: e.currentTarget.value }))}
                  />
                </label>
              </section>
            </div>
          {/if}
          {#if tab === "editor"}
            <div class="settings-panel" role="tabpanel" id="settings-panel-editor" aria-labelledby="settings-tab-editor">
              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.lineNumbers')}</span>
                  <span class="setting-hint">{$t('settings.lineNumbersHint')}</span>
                </div>
                <input
                  type="checkbox"
                  checked={$settings.showLineNumbers}
                  onchange={(e) => settings.update((s) => ({ ...s, showLineNumbers: e.currentTarget.checked }))}
                  class="setting-switch"
                />
              </label>

              <label class="setting-row">
                <div class="setting-text">
                  <span class="setting-label">{$t('settings.syntaxHighlighting')}</span>
                  <span class="setting-hint">{$t('settings.syntaxHighlightingHint')}</span>
                </div>
                <input
                  type="checkbox"
                  checked={$settings.syntaxHighlighting}
                  onchange={(e) => settings.update((s) => ({ ...s, syntaxHighlighting: e.currentTarget.checked }))}
                  class="setting-switch"
                />
              </label>
            </div>
          {/if}
          {#if tab === "ai"}
            <div class="settings-panel" role="tabpanel" id="settings-panel-ai" aria-labelledby="settings-tab-ai">
              <p class="section-hint">{$t('settings.aiLookupHint')}</p>
              <AILookupSettings />
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 10vh;
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }

  .dialog {
    width: min(760px, calc(100vw - 32px));
    height: min(75vh, 680px);
    background: white;
    border: 1px solid #e5e5ea;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :global(html.dark) .dialog {
    background: #2c2c2e;
    border-color: #3a3a3c;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #f2f2f7;
  }

  :global(html.dark) .dialog-header {
    border-bottom-color: #3a3a3c;
  }

  .dialog-title {
    font-size: 15px;
    font-weight: 600;
    color: #1c1c1e;
    margin: 0;
  }

  :global(html.dark) .dialog-title {
    color: #e5e5e7;
  }

  .dialog-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    color: #aeaeb2;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s;
  }

  .dialog-close:hover {
    background: #f2f2f7;
    color: #636366;
  }

  :global(html.dark) .dialog-close:hover {
    background: #3a3a3c;
    color: #e5e5e7;
  }

  .dialog-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .settings-tabs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
    width: 172px;
    padding: 10px 8px;
    border-right: 1px solid #f2f2f7;
    outline: none;
  }

  :global(html.dark) .settings-tabs {
    border-right-color: #3a3a3c;
  }

  .settings-tab {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 7px 10px;
    font-size: 13px;
    color: #3a3a3c;
    text-align: left;
    background: none;
    border: none;
    border-radius: 7px;
    cursor: pointer;
    white-space: nowrap;
  }

  :global(html.dark) .settings-tab {
    color: #d1d1d6;
  }

  .settings-tab:hover {
    background: #f2f2f7;
  }

  :global(html.dark) .settings-tab:hover {
    background: #3a3a3c;
  }

  .settings-tab.active {
    color: var(--accent);
    background: rgb(var(--accent-rgb) / 0.1);
    font-weight: 500;
  }

  :global(html.dark) .settings-tab.active {
    color: var(--accent-bright);
    background: rgb(var(--accent-bright-rgb) / 0.14);
  }

  .settings-tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .settings-panels {
    flex: 1;
    min-width: 0;
    padding: 8px 16px 16px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .settings-panel {
    padding-top: 6px;
  }

  /* A narrow window has no room for the side list: the tabs become a row. */
  @media (max-width: 600px) {
    .dialog-body {
      flex-direction: column;
    }

    .settings-tabs {
      flex-direction: row;
      width: auto;
      padding: 6px 8px;
      overflow-x: auto;
      border-right: none;
      border-bottom: 1px solid #f2f2f7;
    }

    :global(html.dark) .settings-tabs {
      border-bottom-color: #3a3a3c;
    }

    .settings-tab {
      width: auto;
    }
  }

  .settings-section {
    padding-top: 12px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: #aeaeb2;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 10px;
  }

  .section-hint {
    font-size: 11.5px;
    color: #8e8e93;
    margin: -6px 0 12px;
    line-height: 1.4;
    max-width: 52ch;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0;
    cursor: pointer;
  }

  .setting-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;
  }

  .setting-label {
    font-size: 13px;
    color: #1c1c1e;
    font-weight: 500;
  }

  :global(html.dark) .setting-label {
    color: #e5e5e7;
  }

  .setting-hint {
    font-size: 11px;
    color: #8e8e93;
    line-height: 1.4;
  }

  :global(html.dark) .setting-hint {
    color: #8e8e93;
  }

  .setting-switch {
    -webkit-appearance: none;
    appearance: none;
    width: 36px;
    height: 20px;
    background: #e5e5ea;
    border-radius: 10px;
    position: relative;
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
    margin: 0;
  }

  .setting-select {
    flex-shrink: 0;
    max-width: 220px;
    padding: 5px 8px;
    font-size: 12px;
    color: #1c1c1e;
    background: #f9f9fb;
    border: 1px solid #e5e5ea;
    border-radius: 7px;
    outline: none;
    cursor: pointer;
  }

  :global(html.dark) .setting-select {
    background: #1c1c1e;
    border-color: #3a3a3c;
    color: #e5e5e7;
  }

  .setting-select:focus {
    border-color: var(--accent);
  }

  .setting-input {
    flex-shrink: 0;
    width: 180px;
    padding: 5px 8px;
    font-size: 12px;
    color: #1c1c1e;
    background: #f9f9fb;
    border: 1px solid #e5e5ea;
    border-radius: 7px;
    outline: none;
  }

  :global(html.dark) .setting-input {
    background: #1c1c1e;
    border-color: #3a3a3c;
    color: #e5e5e7;
  }

  .setting-input:focus {
    border-color: var(--accent);
  }

  .setting-error {
    color: #d70015;
  }

  :global(html.dark) .setting-error {
    color: #ff6961;
  }

  :global(html.dark) .setting-switch {
    background: #3a3a3c;
  }

  .setting-switch::before {
    content: "";
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    top: 2px;
    left: 2px;
    transition: transform 0.15s;
    box-shadow: 0 1px 2px rgba(0,0,0,0.15);
  }

  .setting-switch:checked,
  :global(html.dark) .setting-switch:checked {
    background: var(--accent);
  }

  .setting-switch:checked::before {
    transform: translateX(16px);
  }

  .accent-row {
    cursor: default;
    align-items: flex-start;
  }

  .accent-swatches {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    /* Five to a row, so the nine colors and the custom one make two even rows. */
    max-width: 130px;
    flex-shrink: 0;
  }

  .accent-swatch {
    position: relative;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--swatch);
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  }

  .accent-swatch[aria-checked="true"],
  .accent-custom.selected {
    box-shadow: 0 0 0 2px white, 0 0 0 4px var(--swatch);
  }

  :global(html.dark) .accent-swatch[aria-checked="true"],
  :global(html.dark) .accent-custom.selected {
    box-shadow: 0 0 0 2px #2c2c2e, 0 0 0 4px var(--swatch);
  }

  .accent-swatch:focus-visible,
  .accent-custom:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  /* An empty rainbow ring until a custom color is chosen, then filled with it. */
  .accent-custom {
    background:
      radial-gradient(circle, var(--swatch) 55%, transparent 56%),
      conic-gradient(#f43f5e, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #f43f5e);
  }

  .accent-custom input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    border: none;
    padding: 0;
  }
</style>
