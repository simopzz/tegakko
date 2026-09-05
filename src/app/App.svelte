<script lang="ts">
  // Composition root: wires the persistence adapter, reads `penCheckShown`
  // on boot to decide whether to show FirstRun (AD-1, AD-12).
  import { onMount } from 'svelte';
  import type { Screen } from '../adapters/ui/screens';
  import FirstRun from '../adapters/ui/FirstRun.svelte';
  import ScopePicker from '../adapters/ui/ScopePicker.svelte';
  import { IdbSettingsRepository } from '../adapters/persistence/settings-repository';
  import { InMemoryCardRepository } from '../adapters/content/card-repository';
  import type { Scope } from '../domain/scope';

  const settingsRepository = new IdbSettingsRepository();
  const cardRepository = new InMemoryCardRepository();

  let screen = $state<Screen>('pen-check');
  let ready = $state(false);
  let scope = $state<Scope | null>(null);

  onMount(() => {
    void settingsRepository.get().then((result) => {
      // First Run never hard-blocks: an unreadable settings store just means
      // we fall back to showing First Run rather than skipping it silently.
      screen = result.ok && result.value.penCheckShown ? 'scope-picker' : 'pen-check';
      ready = true;
    });
  });

  function handlePenCheckDismissed(): void {
    screen = 'scope-picker';
  }

  function handleStart(chosenScope: Scope): void {
    scope = chosenScope;
    screen = 'drill';
  }
</script>

{#if ready}
  {#if screen === 'pen-check'}
    <FirstRun {settingsRepository} onDismiss={handlePenCheckDismissed} />
  {:else if screen === 'scope-picker'}
    <ScopePicker {cardRepository} onStart={handleStart} />
  {:else}
    <!-- Story 1.3 owns the real drill screen; this scaffold-era placeholder
         just proves the Scope picker hands its chosen scope forward -- the
         readout below is throwaway, replaced wholesale by the real drill
         loop, not something that story extends. -->
    <main class="placeholder">
      <p>tegakko is set up. Practice screens ship in the next story.</p>
      {#if scope}
        <p class="placeholder-scope">
          scope: {scope.scripts.join('+')} / {scope.units.join('+')}
        </p>
      {/if}
    </main>
  {/if}
{/if}

<style>
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--spacing-6);
    text-align: center;
    font-family: var(--font-body);
    color: var(--color-ink-muted);
  }

  .placeholder-scope {
    margin: var(--spacing-2) 0 0;
    font-size: 0.875rem;
  }
</style>
