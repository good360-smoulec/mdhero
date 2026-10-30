<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { get } from "svelte/store";
  import { invoke } from "@tauri-apps/api/core";
  import { settings, fontFamilyMap, getContentMaxWidth, DEFAULT_FONT_SIZE } from "$lib/stores/settings";
  import { templateStylesheet, pagedStylesheet, type DocTemplate, type PageSize } from "$lib/templates";
  import type { Previewer } from "pagedjs";
  import type { LineChanges } from "$lib/utils/line-diff";
  import { blocksToMark } from "$lib/utils/change-marks";
  import { markedChangeCount } from "$lib/stores/docChanges";
  import { addSectionToggles, applySections, sectionItems, stripSections } from "$lib/utils/sections";
  import { applyContents, contentsKey, type ContentsOptions } from "$lib/utils/contents";
  import { paginationCss, rulesKey } from "$lib/utils/pagination";
  import { registerPageBreakRules, setPageBreakRules } from "$lib/templates/paged-rules";
  import { revealElement, sectionsActive, setSectionsView } from "$lib/stores/sections";
  import { pagesLaidOut } from "$lib/stores/search";
  import { chromeTop } from "$lib/utils/layout";
  import { tocEntries, activeHeadingId, extractToc, isObserverPaused } from "$lib/stores/toc";
  import { aiLookup, setPendingSelection } from "$lib/stores/aiLookup";
  import { t, translate } from "$lib/i18n";
  import mermaid from "mermaid";
  import DOMPurify from "dompurify";
  import { MERMAID_SANITIZE_CONFIG } from "$lib/renderer/mermaid-sanitize";

  let {
    html = "",
    onImageClick = (_src: string, _all: string[], _idx: number) => {},
    onLocalLink,
    template = null,
    pageSize = "letter",
    paged = false,
    onPagesChange = (_ready: boolean) => {},
    changes = null,
    collapsed = null,
    onToggleSection = (_id: string) => {},
    contents = null,
  }: {
    html: string;
    /** Lay the document out as a page in this template instead of the reader view. */
    template?: DocTemplate | null;
    pageSize?: PageSize;
    /** With a template, show separate pages (Paged.js) instead of one long sheet. */
    paged?: boolean;
    /** False while pages are being laid out, true once they're on screen. */
    onPagesChange?: (ready: boolean) => void;
    /** What the last reload from disk changed, to mark on screen. */
    changes?: LineChanges | null;
    /** Collapsed heading ids; null when sections can't collapse here. */
    collapsed?: string[] | null;
    onToggleSection?: (id: string) => void;
    /** Table of contents and heading numbers to add to the page. */
    contents?: ContentsOptions | null;
    onImageClick?: (src: string, allImages: string[], index: number) => void;
    /**
     * Called when a link to a local file (relative or absolute path, no URL
     * scheme) is clicked. The parent resolves it against the current document
     * and opens it in-app or via the OS (issue #30). When omitted, such links
     * fall back to the external opener.
     */
    onLocalLink?: (href: string) => void;
  } = $props();

  /** True for hrefs that are real URLs (browser/mail/etc.), not filesystem paths. */
  function isUrlHref(href: string): boolean {
    // Any explicit scheme except file: — http, https, mailto, tel, data, blob…
    // `file:` is a local file (handled by onLocalLink), so it's excluded here.
    return /^(?!file:)[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
  }

  let articleEl: HTMLElement | undefined = $state();
  let pagesEl: HTMLElement | undefined = $state();
  let observer: IntersectionObserver | undefined;
  let paginating = $state(false);
  // Set when Paged.js throws; the single sheet is shown instead until the
  // document or template changes.
  let pagedFailed = $state(false);
  let showPages = $derived(!!template && paged && !pagedFailed);
  let contentsSignature = $derived(contentsKey(contents));
  let paginationSignature = $derived(rulesKey($settings.paginationRules));
  let pagedRun = 0;
  let previewer: Previewer | null = null;
  let lastMermaidTheme = "";
  let tooltipEl: HTMLDivElement | undefined;

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = "none";
  }

  function initMermaid() {
    // A template page stays white in dark mode, so its diagrams must too.
    const isDark = document.documentElement.classList.contains("dark") && !template;
    const theme = isDark ? "dark" : "default";
    if (theme === lastMermaidTheme) return;
    lastMermaidTheme = theme;
    mermaid.initialize({
      startOnLoad: false,
      theme,
      // #security: strict keeps Mermaid from emitting HTML labels or click-node
      // JS/URL bindings from untrusted diagram source; the SVG is then sanitized
      // again below as defense in depth. (Felipe Boralli disclosure, 2026-08-14.)
      securityLevel: "strict",
      // #security: render labels as SVG <text>, never as HTML inside
      // <foreignObject>. DOMPurify >= 3.4 strips HTML from foreignObject (it is
      // a known XSS vector -- the same class the Mermaid disclosure was about),
      // which would otherwise leave every diagram with empty shapes. Keeping
      // labels in pure SVG means there is no HTML inside the SVG to sanitize.
      // The Quick Look path already carries these (#117); the drift guard in
      // tests/unit/quicklook-bundle.test.ts keeps the two from separating.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
      themeVariables: isDark ? {
        primaryColor: "#0A1E2E",
        primaryTextColor: "#e5e5e7",
        primaryBorderColor: "#0891B2",
        lineColor: "#8e8e93",
        secondaryColor: "#1c1c1e",
        tertiaryColor: "#2c2c2e",
        noteBkgColor: "#2c2c2e",
        noteTextColor: "#e5e5e7",
        actorTextColor: "#e5e5e7",
        actorLineColor: "#636366",
        signalColor: "#aeaeb2",
        signalTextColor: "#e5e5e7",
      } : {},
    });
  }

  async function renderMermaidBlocks() {
    if (!articleEl) return;
    const blocks = articleEl.querySelectorAll<HTMLElement>("code.language-mermaid");
    if (blocks.length === 0) return;

    initMermaid();

    for (const block of blocks) {
      const pre = block.parentElement;
      if (!pre || pre.tagName !== "PRE") continue;
      if (pre.dataset.mermaidRendered) continue;

      const source = block.textContent ?? "";
      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;

      try {
        const { svg } = await mermaid.render(id, source);
        const container = document.createElement("div");
        container.className = "mermaid-diagram my-4 flex justify-center";
        // #security: never trust Mermaid's SVG straight into the DOM. Even in
        // strict mode this is the last gate before an <svg> from an untrusted
        // document is live. The allowlist lives in renderer/mermaid-sanitize.ts
        // because the Quick Look extension renders diagrams too and the two
        // paths must not drift apart; see the notes there before changing it.
        container.innerHTML = DOMPurify.sanitize(svg, MERMAID_SANITIZE_CONFIG);
        if (block.dataset.sourceLine) container.dataset.sourceLine = block.dataset.sourceLine;
        pre.replaceWith(container);
      } catch {
        // Leave the code block as-is if Mermaid fails
        pre.dataset.mermaidRendered = "failed";
      }
    }
  }

  function setupTocObserver(root: HTMLElement | undefined = articleEl) {
    if (!root) return;
    if (observer) observer.disconnect();

    const headings = root.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]");
    if (headings.length === 0) return;

    observer = new IntersectionObserver(
      (entries) => {
        if (isObserverPaused()) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            activeHeadingId.set(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    headings.forEach((h) => observer!.observe(h));
  }

  // Right-click on the rendered article opens the AI Lookup native context
  // menu. We suppress the default webview menu (Cut/Copy/Paste — they're
  // rebuilt as the first items of our menu) and pass a slim provider payload
  // to Rust (no urlTemplate, no prompt template body — those stay
  // frontend-side; Rust only needs id/name to build the menu).
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const selection = window.getSelection()?.toString() ?? "";
    setPendingSelection(selection);

    const providers = get(aiLookup).providers.map((p) => ({
      id: p.id,
      name: p.name,
      prompts: p.prompts.map((pr) => ({ id: pr.id, name: pr.name })),
    }));

    invoke("show_ai_context_menu", {
      providers,
      hasSelection: selection.trim().length > 0,
      // Localized labels — the menu is built in Rust, which has no access to
      // the frontend i18n tables, so we pass the strings across (same pattern
      // as set_menu_language for the menu bar).
      labels: {
        searchGoogle: translate("contextMenu.searchGoogle"),
        ask: translate("contextMenu.ask"),
        noPrompts: translate("contextMenu.noPrompts"),
        customPrompt: translate("contextMenu.customPrompt"),
        cut: translate("menu.cut"),
        copy: translate("menu.copy"),
        paste: translate("menu.paste"),
      },
    }).catch((err) => console.error("show_ai_context_menu failed:", err));
  }

  onMount(() => {
    return () => {
      observer?.disconnect();
      discardPages();
      // Remove the body-level tooltip so it can't outlive the component.
      tooltipEl?.remove();
      tooltipEl = undefined;
    };
  });

  // A single style element in the head, not a stylesheet per template, so a
  // template added later at runtime goes in the same way as the built-in ones.
  // Not while pages are shown: Paged.js inserts its own processed copy, and a
  // second one would restart CSS counters (section numbers) on every page.
  $effect(() => {
    if (!template || showPages) return;
    const style = document.createElement("style");
    style.dataset.mdheroTemplate = template.id;
    style.textContent = templateStylesheet(template, pageSize);
    document.head.appendChild(style);
    return () => style.remove();
  });

  // A new document or template gets another try at pages after a failure.
  $effect(() => {
    html;
    template?.id;
    pagedFailed = false;
  });

  $effect(() => {
    // Re-run when html changes, or when a template change re-inserts it
    html;
    template?.id;
    pageSize;
    // A new object with the same options must not lay the pages out again.
    contentsSignature;
    const contentsOptions = untrack(() => contents);
    const pages = showPages;
    // Pages leave hidden sections out of the layout, so collapsing lays them out again.
    if (pages) collapsed;
    if (pages) paginationSignature;

    // A re-render (e.g. opening a linked file in a new tab) replaces the
    // article, so a hover's mouseleave may never fire — clear any stuck tooltip.
    hideTooltip();

    if (!pages) discardPages();

    tick().then(() => {
      if (!articleEl) return;
      applyContents(articleEl, contentsOptions);
      if (pages) {
        drawSections();
        paginate();
        return;
      }

      // Extract TOC entries
      const entries = extractToc(articleEl);
      tocEntries.set(entries);

      // Set up intersection observer for active heading
      setupTocObserver();

      // Add copy buttons to code blocks
      addCodeCopyButtons();

      // Add image click handlers for lightbox
      addImageClickHandlers();

      // Add link hover tooltips
      addLinkTooltips();

      // Open external links in system browser
      addLinkHandlers();

      markChanges(articleEl);
      drawSections();

      // Render Mermaid diagrams
      renderMermaidBlocks();
    });
  });

  // In page view the sections are drawn on the hidden source and carried into
  // the pages, where hidden blocks stay (so search still finds their text) but
  // take no room.
  let canCollapse = $derived(collapsed !== null);

  function sectionLabels() {
    return { collapse: translate("sections.collapse"), expand: translate("sections.expand") };
  }

  function drawSections(set: ReadonlySet<string> = new Set(collapsed ?? [])) {
    if (!articleEl) return;
    if (!canCollapse) {
      stripSections(articleEl);
      return;
    }
    applySections(articleEl, set, sectionLabels(), (id) => onToggleSection(id));
  }

  $effect(() => {
    collapsed;
    canCollapse;
    $t;
    drawSections();
    if (showPages && pagesEl && canCollapse) {
      addSectionToggles(pagesEl, new Set(collapsed ?? []), sectionLabels(), (id) => onToggleSection(id));
    }
  });

  // What a reveal in page view asked to scroll to once the pages are laid out again.
  let pendingReveal: { id: string; block: string } | null = null;

  $effect(() => {
    if (!canCollapse) return;
    sectionsActive.set(true);
    setSectionsView({
      items: () => (articleEl ? sectionItems(articleEl).items : []),
      redraw: (set, target) => {
        drawSections(set);
        if (!showPages) return;
        pendingReveal = { id: target.id, block: target.closest<HTMLElement>("[data-block]")?.dataset.block ?? "" };
      },
    });
    return () => {
      sectionsActive.set(false);
      setSectionsView(null);
    };
  });

  function scrollToPendingReveal(root: HTMLElement) {
    const want = pendingReveal;
    pendingReveal = null;
    if (!want) return;
    const el =
      (want.id && root.querySelector<HTMLElement>(`#${CSS.escape(want.id)}`)) ||
      (want.block && root.querySelector<HTMLElement>(`[data-block="${want.block}"]`));
    if (!el) return;
    if (/^H[1-6]$/.test(el.tagName)) {
      const y = el.getBoundingClientRect().top + window.scrollY - (chromeTop() - 5);
      window.scrollTo({ top: y, behavior: "smooth" });
    } else {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  // An in-page link (a footnote, a #heading) can point into a collapsed
  // section; open it before the browser scrolls there.
  function revealLinkTarget(e: MouseEvent) {
    const link = (e.target as Element | null)?.closest?.("a[href^='#']");
    if (!link) return;
    const id = decodeURIComponent(link.getAttribute("href")!.slice(1));
    revealElement(document.getElementById(id));
  }

  // Dismissing or replacing the changes only restyles the blocks on screen;
  // the marks don't move anything, so pages need no new layout.
  $effect(() => {
    changes;
    markChanges(showPages ? pagesEl : articleEl);
  });

  /**
   * Mark the blocks the last reload changed. A block split across two pages is
   * marked on both, but counted once.
   */
  function markChanges(root: HTMLElement | undefined) {
    if (!root) return;
    root.querySelectorAll(".md-changed, .md-removed-before, .md-removed-after").forEach((el) => {
      el.classList.remove("md-changed", "md-removed-before", "md-removed-after");
    });
    if (!changes) {
      markedChangeCount.set(0);
      return;
    }
    const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-source-line]"));
    const marks = blocksToMark(blocks.map((el) => Number(el.dataset.sourceLine)), changes);
    const counted = new Set<number>();
    for (const tagged of blocks) {
      const line = Number(tagged.dataset.sourceLine);
      // A fenced code block carries its line on the <code>; mark the whole <pre>.
      const el = tagged.tagName === "CODE" && tagged.parentElement?.tagName === "PRE" ? tagged.parentElement : tagged;
      el.dataset.sourceLine = String(line);
      if (marks.changed.has(line)) el.classList.add("md-changed");
      if (marks.removedBefore.has(line)) el.classList.add("md-removed-before");
      if (marks.removedAfter === line) el.classList.add("md-removed-after");
      if (marks.changed.has(line) || marks.removedBefore.has(line) || marks.removedAfter === line) counted.add(line);
    }
    markedChangeCount.set(counted.size);
  }

  /**
   * Paged.js 0.4.3 writes each page's `string-set` values (a running header's
   * chapter title) as `"text` with no closing quote (string-sets.js), which
   * Chromium rejects, so every `string()` in a margin box came out empty.
   */
  function closeStringSets(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>(".pagedjs_page").forEach((page) => {
      for (const name of Array.from(page.style)) {
        if (!name.startsWith("--pagedjs-string-")) continue;
        const value = page.style.getPropertyValue(name).trim();
        if (value.startsWith('"') && !/(^|[^\\])"$/.test(value.slice(1))) {
          page.style.setProperty(name, `${value}"`);
        }
      }
    });
  }

  /**
   * Put the blocks of collapsed sections back into the laid-out pages, each
   * after the block before it, so search finds their text and a reveal can
   * tell which section to open. They take no room, so the layout stands.
   */
  function restoreHiddenBlocks(root: HTMLElement, blocks: HTMLElement[]) {
    for (const block of blocks) {
      block.style.display = "none";
      for (let i = Number(block.dataset.block) - 1; i >= 0; i--) {
        const before = root.querySelectorAll(`[data-block="${i}"]`);
        if (before.length === 0) continue;
        before[before.length - 1].after(block);
        break;
      }
    }
  }

  /** Drop any pages and Paged.js's stylesheets, and cancel a layout in progress. */
  function discardPages() {
    pagedRun++;
    paginating = false;
    previewer?.chunker.destroy();
    previewer?.polisher.destroy();
    previewer = null;
  }

  /**
   * Lay the (hidden) template article out as pages. Diagrams are rendered
   * first so they are measured at their real size. Paged.js works on a copy,
   * off-screen and unzoomed, because it measures what it renders and the
   * visible pages carry the reader's zoom; the finished pages are then moved
   * in, which also keeps the old ones on screen until the new ones are ready.
   */
  async function paginate() {
    const run = ++pagedRun;
    paginating = true;
    onPagesChange(false);
    // A burst of reloads (an editor saving as you type) lays out once.
    if (previewer) await new Promise((r) => setTimeout(r, 250));
    if (run !== pagedRun) return;
    await renderMermaidBlocks();
    const tpl = template;
    if (run !== pagedRun || !articleEl || !tpl) return;

    const flow = document.createElement("div");
    flow.className = "doc-page doc-flow";
    flow.dataset.template = tpl.id;
    flow.dataset.pageSize = pageSize;
    flow.innerHTML = articleEl.innerHTML;
    // Listeners don't survive the copy, so the markers saying they're bound
    // must not either; copy buttons don't belong on paper.
    flow.querySelectorAll(".code-copy-btn, .section-toggle").forEach((btn) => btn.remove());
    // Paged.js starts a new page at nearly every display:none block, so hidden
    // sections stay out of the layout and are put back afterwards.
    const hiddenBlocks = Array.from(flow.querySelectorAll<HTMLElement>(":scope > .md-section-hidden"));
    hiddenBlocks.forEach((el) => el.remove());
    flow.querySelectorAll(":scope > .doc-toc-marker").forEach((el) => el.remove());
    flow.querySelectorAll<HTMLElement>("[data-link-bound], [data-tooltip-bound], [data-lightbox-bound]").forEach((el) => {
      delete el.dataset.linkBound;
      delete el.dataset.tooltipBound;
      delete el.dataset.lightboxBound;
    });
    const content = document.createDocumentFragment();
    content.appendChild(flow);

    const stage = document.createElement("div");
    stage.className = "paged-stage";
    document.body.appendChild(stage);
    let next: Previewer | null = null;
    try {
      const paged = await import("pagedjs");
      registerPageBreakRules(paged);
      const rules = get(settings).paginationRules;
      setPageBreakRules(rules);
      next = new paged.Previewer();
      const css = [pagedStylesheet(tpl, pageSize), paginationCss(rules)].join("\n");
      await next.preview(content, [{ "template.css": css }], stage);
    } catch (err) {
      console.error("Paged view failed, showing the single sheet:", err);
      next?.polisher.destroy();
      stage.remove();
      if (run === pagedRun) {
        discardPages();
        pagedFailed = true;
        onPagesChange(true);
      }
      return;
    }
    if (run !== pagedRun || !pagesEl) {
      next.chunker.destroy();
      next.polisher.destroy();
      stage.remove();
      return;
    }

    closeStringSets(stage);
    previewer?.chunker.destroy();
    previewer?.polisher.destroy();
    previewer = next;
    pagesEl.replaceChildren(...stage.childNodes);
    stage.remove();
    paginating = false;
    restoreHiddenBlocks(pagesEl, hiddenBlocks);

    tocEntries.set(extractToc(pagesEl));
    setupTocObserver(pagesEl);
    markChanges(pagesEl);
    addImageClickHandlers(pagesEl);
    addLinkTooltips(pagesEl);
    addLinkHandlers(pagesEl);
    if (canCollapse) addSectionToggles(pagesEl, new Set(collapsed ?? []), sectionLabels(), (id) => onToggleSection(id));
    scrollToPendingReveal(pagesEl);
    pagesLaidOut.update((n) => n + 1);
    onPagesChange(true);
  }

  // The copy buttons are plain DOM, so relabel them when the language changes.
  $effect(() => {
    const label = $t("markdown.copy");
    articleEl?.querySelectorAll(".code-copy-btn").forEach((btn) => (btn.textContent = label));
  });

  function addImageClickHandlers(root: HTMLElement | undefined = articleEl) {
    if (!root) return;
    const imgs = root.querySelectorAll("img");
    const allSrcs = Array.from(imgs).map((img) => img.src).filter(Boolean);

    imgs.forEach((img, idx) => {
      if (img.dataset.lightboxBound) return;
      img.dataset.lightboxBound = "true";
      img.style.cursor = "zoom-in";
      img.addEventListener("click", () => {
        onImageClick(img.src, allSrcs, idx);
      });
    });
  }

  function addLinkTooltips(root: HTMLElement | undefined = articleEl) {
    if (!root) return;

    // Create tooltip element once
    // Sweep any orphaned tooltips left by dev HMR reloads so they can't pile up.
    document.querySelectorAll(".link-tooltip").forEach((el) => {
      if (el !== tooltipEl) el.remove();
    });
    if (!tooltipEl || !tooltipEl.isConnected) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "link-tooltip";
      document.body.appendChild(tooltipEl);
    }

    const links = root.querySelectorAll("a[href]");
    links.forEach((link) => {
      if ((link as HTMLElement).dataset.tooltipBound) return;
      (link as HTMLElement).dataset.tooltipBound = "true";

      link.addEventListener("mouseenter", (e) => {
        const href = link.getAttribute("href") ?? "";
        if (!href || href.startsWith("#")) return;
        tooltipEl!.textContent = href;
        tooltipEl!.style.display = "block";
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        tooltipEl!.style.left = `${rect.left}px`;
        tooltipEl!.style.top = `${rect.bottom + 4}px`;
      });

      link.addEventListener("mouseleave", hideTooltip);
    });
  }

  function addLinkHandlers(root: HTMLElement | undefined = articleEl) {
    if (!root) return;
    const links = root.querySelectorAll("a[href]");
    links.forEach((link) => {
      if ((link as HTMLElement).dataset.linkBound) return;
      const href = link.getAttribute("href") ?? "";
      // Skip anchor links (in-page navigation handled by the browser default).
      if (!href || href.startsWith("#")) return;
      (link as HTMLElement).dataset.linkBound = "true";
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        hideTooltip();
        // Local file path (no URL scheme, or a file: URL) → let the parent
        // resolve it against the current document and open it (#30).
        if (onLocalLink && !isUrlHref(href)) {
          onLocalLink(href);
          return;
        }
        // Real URL → external opener (browser, mail client, …).
        try {
          const { openUrl } = await import("@tauri-apps/plugin-opener");
          await openUrl(href);
        } catch {
          window.open(href, "_blank");
        }
      });
    });
  }

  function addCodeCopyButtons() {
    if (!articleEl) return;
    const pres = articleEl.querySelectorAll("pre");

    for (const pre of pres) {
      if (pre.querySelector(".code-copy-btn")) continue;
      if (pre.dataset.mermaidRendered) continue;

      // Make pre relative for absolute positioning of the button
      pre.style.position = "relative";

      const btn = document.createElement("button");
      btn.className = "code-copy-btn";
      btn.textContent = translate("markdown.copy");
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code");
        const text = code?.textContent ?? pre.textContent ?? "";
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = translate("markdown.copied");
          setTimeout(() => (btn.textContent = translate("markdown.copy")), 1500);
        });
      });

      pre.appendChild(btn);
    }
  }
</script>

{#if template}
  {#if showPages}
    <!-- The pages Paged.js laid out. It is the article other code looks up
         (search, scroll restore, Copy as Rich Text) and comes first, so a
         heading id finds the page copy, not the hidden source below. -->
    <article
      bind:this={pagesEl}
      oncontextmenu={handleContextMenu}
      onclickcapture={revealLinkTarget}
      class="md-content paged-view"
      data-template={template.id}
      data-page-size={pageSize}
      style="zoom: {$settings.fontSize / DEFAULT_FONT_SIZE};"
    ></article>
    {#if paginating}
      <div class="paginating print:hidden" role="status">{$t("markdown.paginating")}</div>
    {/if}
  {/if}
  <!-- The template owns type and width; the reader's text size still applies,
       as a zoom of the whole page, so Cmd/Ctrl +/- keep working. In page view
       this is the hidden source the pages are laid out from. -->
  <article
    bind:this={articleEl}
    oncontextmenu={handleContextMenu}
    onclickcapture={revealLinkTarget}
    class="doc-page"
    class:md-content={!showPages}
    class:wrap-code={$settings.wrapCodeBlocks}
    hidden={showPages}
    data-template={template.id}
    data-page-size={pageSize}
    style="zoom: {$settings.fontSize / DEFAULT_FONT_SIZE};"
  >
    {#key template.id}
      {@html html}
    {/key}
  </article>
{:else}
  <article
    bind:this={articleEl}
    oncontextmenu={handleContextMenu}
    onclickcapture={revealLinkTarget}
    class="md-content prose prose-slate dark:prose-invert max-w-none mx-auto px-8 py-8 transition-all"
    class:wrap-code={$settings.wrapCodeBlocks}
    style="
      max-width: {getContentMaxWidth($settings)};
      font-size: {$settings.fontSize}px;
      line-height: {$settings.lineHeight};
      font-family: {fontFamilyMap[$settings.fontFamily]};
    "
  >
    {@html html}
  </article>
{/if}

<style>
  .md-content:not([data-template]) {
    color: #1c1c1e;
  }

  :global(html.dark) .md-content:not([data-template]) {
    color: #d1d1d6;
    background: transparent;
  }

  /* Override any Tailwind prose white backgrounds in dark mode */
  :global(html.dark) article.prose {
    --tw-prose-body: #d1d1d6;
    --tw-prose-headings: #f2f2f7;
    --tw-prose-bold: #e5e5e7;
    --tw-prose-counters: #8e8e93;
    --tw-prose-bullets: #636366;
    --tw-prose-quotes: #8e8e93;
    --tw-prose-code: #67E8F9;
    --tw-prose-pre-bg: #1c1c1e;
    --tw-prose-th-borders: #3a3a3c;
    --tw-prose-td-borders: #2c2c2e;
  }

  /* Typography refinement */
  article:not([data-template]) :global(h1) {
    font-size: 1.75em;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-top: 1.5em;
    color: #1c1c1e;
  }

  :global(html.dark) article:not([data-template]) :global(h1) {
    color: #f2f2f7;
  }

  article:not([data-template]) :global(h2) {
    font-size: 1.4em;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: #1c1c1e;
  }

  :global(html.dark) article:not([data-template]) :global(h2) {
    color: #e5e5e7;
  }

  article:not([data-template]) :global(h3) {
    font-size: 1.15em;
    font-weight: 600;
    color: #1c1c1e;
  }

  :global(html.dark) article:not([data-template]) :global(h3) {
    color: #e5e5e7;
  }

  /* Code */
  article:not([data-template]) :global(pre) {
    border-radius: 10px;
    padding: 1em 1.2em;
    overflow-x: auto;
    font-size: 0.8em;
    border: 1px solid #e5e5ea;
    background: #f6f8fa !important;
    color: #24292f !important;
  }

  :global(html.dark) article:not([data-template]) :global(pre) {
    border-color: #2c2c2e;
  }

  /* overflow-wrap breaks a URL or hash longer than the block, which would
     otherwise still force a scrollbar. */
  article.wrap-code :global(pre) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  article:not([data-template]) :global(code) {
    font-family: "SF Mono", "JetBrains Mono", "Fira Code", Menlo, monospace;
  }

  article:not([data-template]) :global(:not(pre) > code) {
    background: #f2f2f7;
    padding: 0.15em 0.4em;
    border-radius: 5px;
    font-size: 0.85em;
    color: #0E7490;
  }

  :global(html.dark) article:not([data-template]) :global(:not(pre) > code) {
    background: #2c2c2e;
    color: #67E8F9;
  }

  /* Strip the literal backticks @tailwindcss/typography adds around inline
     code via ::before/::after — every other markdown renderer omits them. */
  article :global(:not(pre) > code)::before,
  article :global(:not(pre) > code)::after {
    content: none;
  }

  /* Tables */
  article:not([data-template]) :global(table) {
    border-collapse: collapse;
    width: 100%;
    overflow-x: auto;
    display: block;
    font-size: 0.9em;
  }

  article:not([data-template]) :global(th),
  article:not([data-template]) :global(td) {
    border: 1px solid #e5e5ea;
    padding: 0.5em 0.75em;
    text-align: start;
  }

  :global(html.dark) article:not([data-template]) :global(th),
  :global(html.dark) article:not([data-template]) :global(td) {
    border-color: #3a3a3c;
  }

  article:not([data-template]) :global(th) {
    background: #f2f2f7;
    font-weight: 600;
    font-size: 0.9em;
    color: #636366;
  }

  :global(html.dark) article:not([data-template]) :global(th) {
    background: #1c1c1e;
    color: #aeaeb2;
  }

  /* Blockquotes */
  article:not([data-template]) :global(blockquote) {
    border-left: 3px solid #0891B2;
    padding-left: 1em;
    margin-left: 0;
    color: #636366;
  }

  :global(html.dark) article:not([data-template]) :global(blockquote) {
    border-left-color: rgba(8, 145, 178, 0.6);
    color: #8e8e93;
  }

  /* Images */
  article:not([data-template]) :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }

  /* Horizontal rules — subtle divider, not a slab */
  article:not([data-template]) :global(hr) {
    border: none;
    border-top: 1px solid #ededf0;
    margin: 2.5em 0;
  }

  :global(html.dark) article:not([data-template]) :global(hr) {
    border-top-color: #242426;
  }

  /* Task lists */
  article:not([data-template]) :global(.task-list-item) {
    list-style: none;
    margin-left: -1.5em;
  }

  article:not([data-template]) :global(.task-list-item input[type="checkbox"]) {
    margin-right: 0.5em;
    accent-color: #0891B2;
  }

  /* Callouts: GitHub's > [!NOTE] alerts, in GitHub's colours */
  article:not([data-template]) :global(.markdown-alert) {
    --alert-color: #0969da;
    margin: 1.25em 0;
    padding: 0.5em 1em;
    border-left: 3px solid var(--alert-color);
  }

  article:not([data-template]) :global(.markdown-alert-tip) { --alert-color: #1a7f37; }
  article:not([data-template]) :global(.markdown-alert-important) { --alert-color: #8250df; }
  article:not([data-template]) :global(.markdown-alert-warning) { --alert-color: #9a6700; }
  article:not([data-template]) :global(.markdown-alert-caution) { --alert-color: #cf222e; }

  :global(html.dark) article:not([data-template]) :global(.markdown-alert) { --alert-color: #4493f8; }
  :global(html.dark) article:not([data-template]) :global(.markdown-alert-tip) { --alert-color: #3fb950; }
  :global(html.dark) article:not([data-template]) :global(.markdown-alert-important) { --alert-color: #ab7df8; }
  :global(html.dark) article:not([data-template]) :global(.markdown-alert-warning) { --alert-color: #d29922; }
  :global(html.dark) article:not([data-template]) :global(.markdown-alert-caution) { --alert-color: #f85149; }

  article:not([data-template]) :global(.markdown-alert > :first-child) {
    margin-top: 0;
  }

  article:not([data-template]) :global(.markdown-alert > :last-child) {
    margin-bottom: 0;
  }

  article:not([data-template]) :global(.markdown-alert-title) {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.25em;
    font-weight: 600;
    color: var(--alert-color);
  }

  article:not([data-template]) :global(.markdown-alert-title + *) {
    margin-top: 0;
  }

  article :global(.markdown-alert-icon) {
    width: 1em;
    height: 1em;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Table of contents (utils/contents.ts) */
  article :global(.doc-toc-marker) {
    display: none !important;
  }

  article:not([data-template]) :global(.doc-toc) {
    margin: 1.5em 0 2em;
    padding: 1em 1.25em;
    border: 1px solid #e5e5ea;
    border-radius: 8px;
  }

  :global(html.dark) article:not([data-template]) :global(.doc-toc) {
    border-color: #3a3a3c;
  }

  article:not([data-template]) :global(.doc-toc-title) {
    margin: 0 0 0.5em;
    font-weight: 600;
    font-size: 1.05em;
  }

  article:not([data-template]) :global(.doc-toc-list) {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  article:not([data-template]) :global(.doc-toc-item) {
    margin: 0.2em 0;
  }

  article:not([data-template]) :global(.doc-toc-level-1) { font-weight: 500; }
  article:not([data-template]) :global(.doc-toc-level-2) { padding-left: 1.25em; }
  article:not([data-template]) :global(.doc-toc-level-3) { padding-left: 2.5em; }
  article:not([data-template]) :global(.doc-toc-level-4) { padding-left: 3.75em; }
  article:not([data-template]) :global(.doc-toc-level-5) { padding-left: 5em; }
  article:not([data-template]) :global(.doc-toc-level-6) { padding-left: 6.25em; }

  article:not([data-template]) :global(.doc-toc a) {
    display: flex;
    gap: 0.5em;
  }

  article:not([data-template]) :global(.doc-toc-number) {
    color: #8e8e93;
    font-variant-numeric: tabular-nums;
  }

  article:not([data-template]) :global(.doc-toc-leader) {
    display: none;
  }

  /* Footnotes */
  article:not([data-template]) :global(.footnote-ref a) {
    text-decoration: none;
    font-weight: 600;
  }

  article:not([data-template]) :global(.footnotes) {
    font-size: 0.875em;
    color: #636366;
  }

  :global(html.dark) article:not([data-template]) :global(.footnotes) {
    color: #8e8e93;
  }

  article:not([data-template]) :global(hr.footnotes-sep) {
    margin: 2.5em 0 1em;
  }

  article:not([data-template]) :global(.footnote-backref) {
    text-decoration: none;
  }

  article:not([data-template]) :global(.footnote-item:target) {
    background: rgba(8, 145, 178, 0.08);
    border-radius: 4px;
  }

  /* Links */
  article:not([data-template]) :global(a) {
    color: #0891B2;
    text-decoration: none;
  }

  article:not([data-template]) :global(a:hover) {
    text-decoration: underline;
  }

  :global(html.dark) article:not([data-template]) :global(a) {
    color: #22D3EE;
  }

  /* Code copy button */
  article :global(.code-copy-btn) {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 500;
    font-family: -apple-system, sans-serif;
    color: #8e8e93;
    background: rgba(255,255,255,0.8);
    border: 1px solid #e5e5ea;
    border-radius: 5px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s;
    z-index: 2;
    backdrop-filter: blur(4px);
  }

  :global(html.dark) article:not([data-template]) :global(.code-copy-btn) {
    background: rgba(44,44,46,0.8);
    border-color: #3a3a3c;
    color: #aeaeb2;
  }

  article :global(pre:hover .code-copy-btn) {
    opacity: 1;
  }

  article :global(.code-copy-btn:hover) {
    background: rgba(255,255,255,0.95);
    color: #1c1c1e;
  }

  :global(html.dark) article:not([data-template]) :global(.code-copy-btn:hover) {
    background: rgba(58,58,60,0.95);
    color: #e5e5e7;
  }

  /* Collapsible sections: a chevron in the heading's left margin, faint until
     the heading is hovered and always shown once collapsed. Hidden only on
     screen; a print has the whole document. */
  article :global(.md-section-heading) {
    position: relative;
  }

  article :global(.section-toggle) {
    position: absolute;
    left: -26px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: #aeaeb2;
    opacity: 0;
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s;
  }

  article :global(.md-section-heading:hover > .section-toggle),
  article :global(.section-toggle:focus-visible),
  article :global(.md-section-collapsed > .section-toggle) {
    opacity: 1;
  }

  article :global(.section-toggle:hover) {
    color: #1c1c1e;
    background: rgba(127, 127, 127, 0.14);
  }

  :global(html.dark) article:not([data-template]) :global(.section-toggle:hover) {
    color: #f2f2f7;
  }

  article :global(.section-toggle svg) {
    transition: transform 0.15s;
  }

  article :global(.md-section-collapsed > .section-toggle svg) {
    transform: rotate(-90deg);
  }

  article :global(.md-section-collapsed > .section-toggle) {
    color: var(--accent);
  }

  @media screen {
    article :global(.md-section-hidden) {
      display: none !important;
    }
  }

  @media print {
    article :global(.section-toggle) {
      display: none !important;
    }
  }

  /* What the last reload changed. Shadows and a background only, so marking or
     clearing moves nothing and laid-out pages stay as they are. */
  /* The tint runs 14px past both sides; the bar is a stripe at its far left,
     clear of the text whatever the block's own indent. */
  article :global(.md-changed) {
    position: relative;
    background-color: rgba(255, 196, 0, 0.12);
    box-shadow: 14px 0 0 0 rgba(255, 196, 0, 0.12), -14px 0 0 0 rgba(255, 196, 0, 0.12);
  }

  article :global(.md-changed)::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: -14px;
    width: 3px;
    border-radius: 2px;
    background: #e8a400;
    pointer-events: none;
  }

  /* Tables and code scroll sideways, which clips the stripe, so theirs is a
     shadow on their own left edge. */
  article :global(table.md-changed),
  article :global(pre.md-changed) {
    box-shadow: -4px 0 0 0 #e8a400, 14px 0 0 0 rgba(255, 196, 0, 0.12), -14px 0 0 0 rgba(255, 196, 0, 0.12);
  }

  article :global(table.md-changed)::after,
  article :global(pre.md-changed)::after {
    content: none;
  }

  article :global(.md-removed-before) {
    box-shadow: 0 -0.6em 0 -0.45em #e5484d;
  }

  article :global(.md-removed-after) {
    box-shadow: 0 0.6em 0 -0.45em #e5484d;
  }

  article :global(.md-changed.md-removed-before) {
    box-shadow: 0 -0.6em 0 -0.45em #e5484d, 14px 0 0 0 rgba(255, 196, 0, 0.12), -14px 0 0 0 rgba(255, 196, 0, 0.12);
  }

  :global(html.dark) article:not([data-template]) :global(.md-changed) {
    background-color: rgba(255, 196, 0, 0.1);
  }

  /* The block the status bar's arrows just moved to. */
  article :global(.md-change-current) {
    outline: 2px solid rgba(232, 164, 0, 0.55);
    outline-offset: 4px;
  }

  @media print {
    article :global(.md-changed),
    article :global(.md-removed-before),
    article :global(.md-removed-after) {
      background-color: transparent !important;
      box-shadow: none !important;
      outline: none !important;
    }

    article :global(.md-changed)::after {
      display: none;
    }
  }

  /* Page view (Paged.js). The paper stays white in dark mode, like the single
     sheet, and so does what's printed in its margins. */
  .paged-view {
    padding: 2rem 0;
  }

  /* `safe`: a page wider than the window overflows to the right, where it can
     be scrolled to, rather than off the left edge. */
  .paged-view :global(.pagedjs_pages) {
    display: flex;
    flex-direction: column;
    align-items: safe center;
    gap: 1.5rem;
  }

  .paged-view :global(.pagedjs_page),
  :global(.paged-stage .pagedjs_page) {
    background: #fff;
    color: #111;
  }

  .paged-view :global(.pagedjs_page) {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.08);
  }

  .paginating {
    position: fixed;
    right: 1.25rem;
    bottom: 3rem;
    z-index: 20;
    padding: 0.35rem 0.8rem;
    font-size: 12px;
    color: #636366;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid #e5e5ea;
    border-radius: 999px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  :global(html.dark) .paginating {
    color: #aeaeb2;
    background: rgba(44, 44, 46, 0.92);
    border-color: #3a3a3c;
  }

  /* Where Paged.js lays pages out: rendered, so it can measure, but off screen. */
  :global(.paged-stage) {
    position: fixed;
    top: 0;
    left: -100000px;
    pointer-events: none;
  }

  @media print {
    .paged-view {
      padding: 0;
      zoom: 1 !important;
    }

    .paged-view :global(.pagedjs_pages) {
      display: block;
    }

    /* One sheet of paper per page at its exact size, rather than Paged.js's
       height: 100%, which depends on every ancestor's height. */
    .paged-view :global(.pagedjs_page) {
      width: var(--pagedjs-pagebox-width) !important;
      height: var(--pagedjs-pagebox-height) !important;
      min-height: 0 !important;
      max-height: none !important;
      box-shadow: none;
    }
  }

  /* Link tooltip */
  :global(.link-tooltip) {
    display: none;
    position: fixed;
    z-index: 50;
    max-width: 400px;
    padding: 4px 8px;
    font-size: 11px;
    font-family: "SF Mono", monospace;
    color: #636366;
    background: white;
    border: 1px solid #e5e5ea;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  :global(html.dark .link-tooltip) {
    background: #2c2c2e;
    border-color: #3a3a3c;
    color: #aeaeb2;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }

  /* Code block dark mode override for highlight.js.
   *
   * This mirrors highlight.js's own `github-dark` theme, selector group for
   * selector group, against the `github` (light) theme imported in app.css.
   * It deliberately covers EVERY class the light theme colours — not a
   * hand-picked subset.
   *
   * The subset approach was the bug in #67: any class the light theme styled
   * but the dark override missed kept its light colour against #0d1117.
   * `.hljs-subst`, `.hljs-emphasis` and `.hljs-strong` are #24292e — near-black
   * on a near-black background, i.e. invisible — and `.hljs-bullet` (#735c0f),
   * `.hljs-literal`/`.hljs-operator` (#005cc5) and friends were barely legible.
   * Fixing only the tokens in the bug report would have left the rest invisible.
   *
   * Source: node_modules/highlight.js/styles/github-dark.min.css
   * `tests/unit/hljs-dark-coverage.test.ts` fails if the two ever drift apart,
   * so a highlight.js upgrade that adds a class can't silently reintroduce this.
   */
  :global(html.dark) article:not([data-template]) :global(pre) {
    background: #0d1117 !important;
    color: #c9d1d9 !important;
  }
  :global(html.dark) article:not([data-template]) :global(.hljs) { color: #c9d1d9 !important; background: #0d1117 !important; }

  :global(html.dark) article:not([data-template]) :global(.hljs-doctag),
  :global(html.dark) article:not([data-template]) :global(.hljs-keyword),
  :global(html.dark) article:not([data-template]) :global(.hljs-meta .hljs-keyword),
  :global(html.dark) article:not([data-template]) :global(.hljs-template-tag),
  :global(html.dark) article:not([data-template]) :global(.hljs-template-variable),
  :global(html.dark) article:not([data-template]) :global(.hljs-type),
  :global(html.dark) article:not([data-template]) :global(.hljs-variable.language_) { color: #ff7b72 !important; }

  :global(html.dark) article:not([data-template]) :global(.hljs-title),
  :global(html.dark) article:not([data-template]) :global(.hljs-title.class_),
  :global(html.dark) article:not([data-template]) :global(.hljs-title.class_.inherited__),
  :global(html.dark) article:not([data-template]) :global(.hljs-title.function_) { color: #d2a8ff !important; }

  :global(html.dark) article:not([data-template]) :global(.hljs-attr),
  :global(html.dark) article:not([data-template]) :global(.hljs-attribute),
  :global(html.dark) article:not([data-template]) :global(.hljs-literal),
  :global(html.dark) article:not([data-template]) :global(.hljs-meta),
  :global(html.dark) article:not([data-template]) :global(.hljs-number),
  :global(html.dark) article:not([data-template]) :global(.hljs-operator),
  :global(html.dark) article:not([data-template]) :global(.hljs-selector-attr),
  :global(html.dark) article:not([data-template]) :global(.hljs-selector-class),
  :global(html.dark) article:not([data-template]) :global(.hljs-selector-id),
  :global(html.dark) article:not([data-template]) :global(.hljs-variable) { color: #79c0ff !important; }

  :global(html.dark) article:not([data-template]) :global(.hljs-meta .hljs-string),
  :global(html.dark) article:not([data-template]) :global(.hljs-regexp),
  :global(html.dark) article:not([data-template]) :global(.hljs-string) { color: #a5d6ff !important; }

  :global(html.dark) article:not([data-template]) :global(.hljs-built_in),
  :global(html.dark) article:not([data-template]) :global(.hljs-symbol) { color: #ffa657 !important; }

  :global(html.dark) article:not([data-template]) :global(.hljs-code),
  :global(html.dark) article:not([data-template]) :global(.hljs-comment),
  :global(html.dark) article:not([data-template]) :global(.hljs-formula) { color: #8b949e !important; }

  :global(html.dark) article:not([data-template]) :global(.hljs-name),
  :global(html.dark) article:not([data-template]) :global(.hljs-quote),
  :global(html.dark) article:not([data-template]) :global(.hljs-selector-pseudo),
  :global(html.dark) article:not([data-template]) :global(.hljs-selector-tag) { color: #7ee787 !important; }

  :global(html.dark) article:not([data-template]) :global(.hljs-subst) { color: #c9d1d9 !important; }
  /* The one deliberate deviation from upstream github-dark: its #1f6feb scores
   * 4.08:1 against #0d1117, under the 4.5:1 WCAG AA floor the test enforces.
   * #58a6ff is GitHub's own dark-mode blue and scores 7.49:1. */
  :global(html.dark) article:not([data-template]) :global(.hljs-section) { color: #58a6ff !important; font-weight: 700; }
  :global(html.dark) article:not([data-template]) :global(.hljs-bullet) { color: #f2cc60 !important; }
  :global(html.dark) article:not([data-template]) :global(.hljs-emphasis) { color: #c9d1d9 !important; font-style: italic; }
  :global(html.dark) article:not([data-template]) :global(.hljs-strong) { color: #c9d1d9 !important; font-weight: 700; }
  :global(html.dark) article:not([data-template]) :global(.hljs-addition) { color: #aff5b4 !important; background-color: #033a16 !important; }
  :global(html.dark) article:not([data-template]) :global(.hljs-deletion) { color: #ffdcd7 !important; background-color: #67060c !important; }

  /* Mermaid */
  article :global(.mermaid-diagram) {
    overflow-x: auto;
  }

  article :global(.mermaid-diagram svg) {
    max-width: 100%;
    height: auto;
  }


  /* KaTeX */
  article :global(.katex-display) {
    overflow-x: auto;
    padding: 0.5em 0;
  }

  article :global(.katex) {
    font-size: 1.1em;
  }
</style>
