<script lang="ts">
  // Composition root: wires the persistence adapter, reads `penCheckShown`
  // on boot to decide whether to show FirstRun (AD-1, AD-12).
  import { onMount } from 'svelte';
  import type { Screen } from '../adapters/ui/screens';
  import FirstRun from '../adapters/ui/FirstRun.svelte';
  import { IdbSettingsRepository } from '../adapters/persistence/settings-repository';

  const settingsRepository = new IdbSettingsRepository();

  let screen = $state<Screen>('pen-check');
  let ready = $state(false);

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
</script>

{#if ready}
  {#if screen === 'pen-check'}
    <FirstRun {settingsRepository} onDismiss={handlePenCheckDismissed} />
  {:else}
    <!-- Story 1.2+ owns the real scope-picker screen; this scaffold-era
         placeholder just proves First Run is skipped on repeat opens. -->
    <main class="placeholder">
      <p>tegakko is set up. Practice screens ship in the next story.</p>
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
</style>
