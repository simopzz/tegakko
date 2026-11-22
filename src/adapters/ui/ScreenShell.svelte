<script lang="ts">
  // The shared full-height screen shell (docs/design.md): below the one top
  // bar, a `<main>` that fills exactly the rest of the viewport and scrolls
  // in itself, with the screen's content in one centred 640px column.
  // Every screen except Drill uses it -- Drill is not scrollable, its
  // writing area fills whatever room is left instead.
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    /** The bookmark carries the current page context across screens. */
    bookmark?: string;
    /** Settings passes this while its import warning is open, so the
     * modal blocks the whole screen, not just the controls inside. */
    inert?: boolean;
  }

  const { children, bookmark, inert = false }: Props = $props();
</script>

<main inert={inert}>
  <div class="sheet">
    {#if bookmark}<span class="bookmark">{bookmark}</span>{/if}
    <div class="content">
      {@render children()}
    </div>
  </div>
</main>

<style>
  main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: var(--color-desk);
    display: flex;
    flex-direction: column;
    padding: clamp(18px, 4vw, 42px);
  }

  .sheet {
    position: relative;
    width: min(100%, 880px);
    margin: auto;
    padding: clamp(28px, 5vw, 52px) clamp(22px, 5vw, 52px);
    border: 1px solid var(--color-paper-line);
    border-radius: var(--radius-sm);
    background: var(--color-paper);
  }

  .bookmark {
    position: absolute;
    top: -1px;
    right: clamp(22px, 5vw, 52px);
    max-width: 45%;
    padding: 9px 14px 11px;
    border-radius: 0 0 5px 5px;
    background: var(--color-mark);
    color: var(--color-accent-on-paper);
    font-family: var(--font-label);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .content {
    width: 100%;
    max-width: 680px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  @media (max-width: 520px) {
    main {
      padding: 14px;
    }

    .sheet {
      padding: 46px 18px 24px;
    }

    .bookmark {
      right: 18px;
    }
  }
</style>
