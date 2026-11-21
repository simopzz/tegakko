<script lang="ts">
  // The shared full-height screen shell (docs/design.md): below the one top
  // bar, a `<main>` that fills exactly the rest of the viewport and scrolls
  // in itself, with the screen's content in one centred 640px column.
  // Every screen except Drill uses it -- Drill is not scrollable, its
  // writing area fills whatever room is left instead.
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    /** Settings passes this while its import warning is open, so the
     * modal blocks the whole screen, not just the controls inside. */
    inert?: boolean;
  }

  const { children, inert = false }: Props = $props();
</script>

<main inert={inert}>
  <div class="content">
    {@render children()}
  </div>
</main>

<style>
  main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: var(--color-surface-card);
    display: flex;
    flex-direction: column;
    padding: var(--spacing-6);
  }

  /* `margin: auto` centres the content when it is shorter than the screen
     and resolves to zero when it is taller (no clipped overflow, unlike
     justify-content centring in a scroll container). */
  .content {
    width: 100%;
    max-width: 640px;
    margin: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }
</style>
