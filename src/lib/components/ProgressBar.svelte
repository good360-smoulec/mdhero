<script lang="ts">
  import { onMount } from "svelte";
  import { document as docStore } from "$lib/stores/document";

  let progress = $state(0);

  onMount(() => {
    function update() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress = max > 0 ? Math.min((window.scrollY / max) * 100, 100) : 0;
    }
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  });
</script>

{#if $docStore.renderedHtml}
  <div class="progress-bar" style="width: {progress}%"></div>
{/if}

<style>
  .progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    background: var(--accent);
    z-index: 100;
    transition: width 0.1s linear;
    pointer-events: none;
  }

  :global(html.dark) .progress-bar {
    background: var(--accent-bright);
  }

  @media print {
    .progress-bar { display: none !important; }
  }
</style>
