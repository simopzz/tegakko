<script lang="ts">
  // PROTOTYPE ONLY (ticket #80): floating bottom bar for switching UI variants
  // and simulating auto-grade outcomes without a live Vision API.
  import { onMount } from 'svelte';

  export type VariantKey = 'A' | 'B' | 'C';
  export type MockOutcome = 'pass-clean' | 'pass-order-hint' | 'fail-misread' | 'offline';

  export const VARIANTS: { key: VariantKey; name: string }[] = [
    { key: 'A', name: 'Reveal & Check' },
    { key: 'B', name: 'Check-First Card' },
    { key: 'C', name: 'Stamp & Retry' },
  ];

  const OUTCOMES: { key: MockOutcome; label: string }[] = [
    { key: 'pass-clean', label: 'Pass + Order OK' },
    { key: 'pass-order-hint', label: 'Pass + Order Hint' },
    { key: 'fail-misread', label: 'Fail (Misread)' },
    { key: 'offline', label: 'Offline Fallback' },
  ];

  interface Props {
    current: VariantKey;
    outcome: MockOutcome;
    onVariantChange: (next: VariantKey) => void;
    onOutcomeChange: (next: MockOutcome) => void;
  }

  const { current, outcome, onVariantChange, onOutcomeChange }: Props = $props();

  const currentIndex = $derived(VARIANTS.findIndex((v) => v.key === current));
  const currentVariant = $derived(VARIANTS[currentIndex] ?? VARIANTS[0]!);

  function cycle(delta: number): void {
    const nextIndex = (currentIndex + delta + VARIANTS.length) % VARIANTS.length;
    onVariantChange(VARIANTS[nextIndex]!.key);
  }

  onMount(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cycle(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        cycle(1);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });
</script>

{#if import.meta.env.DEV}
  <aside class="proto-switcher" aria-label="Prototype switcher">
    <div class="proto-variants">
      <button
        type="button"
        class="proto-arrow"
        aria-label="Previous variant"
        onclick={() => cycle(-1)}
      >
        ←
      </button>
      <span class="proto-label">
        <strong>{currentVariant.key}</strong> ({currentVariant.name})
      </span>
      <button
        type="button"
        class="proto-arrow"
        aria-label="Next variant"
        onclick={() => cycle(1)}
      >
        →
      </button>
    </div>
    <label class="proto-outcome">
      <span class="proto-outcome-label">Mock:</span>
      <select
        class="proto-select"
        value={outcome}
        onchange={(e) => onOutcomeChange((e.currentTarget as HTMLSelectElement).value as MockOutcome)}
      >
        {#each OUTCOMES as opt (opt.key)}
          <option value={opt.key}>{opt.label}</option>
        {/each}
      </select>
    </label>
  </aside>
{/if}

<style>
  .proto-switcher {
    position: fixed;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    border-radius: 9999px;
    background: #1f2421;
    color: #fbf6eb;
    font-family: var(--font-body);
    font-size: 0.82rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    white-space: nowrap;
  }

  .proto-variants {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .proto-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 9999px;
    border: 1px solid rgba(251, 246, 235, 0.25);
    background: transparent;
    color: #fbf6eb;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .proto-arrow:hover {
    background: rgba(251, 246, 235, 0.14);
  }

  .proto-label {
    min-width: 140px;
    text-align: center;
  }

  .proto-outcome {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 10px;
    border-left: 1px solid rgba(251, 246, 235, 0.22);
  }

  .proto-outcome-label {
    opacity: 0.75;
  }

  .proto-select {
    background: #2d3530;
    color: #fbf6eb;
    border: 1px solid rgba(251, 246, 235, 0.25);
    border-radius: 6px;
    padding: 3px 6px;
    font-size: 0.8rem;
    font-family: inherit;
  }
</style>
