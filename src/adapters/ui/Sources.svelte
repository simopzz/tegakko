<script lang="ts">
  import ScreenShell from './ScreenShell.svelte';
</script>

<ScreenShell bookmark="Data sources">
  <section class="source-section" aria-labelledby="kanjidic-title">
    <h2 class="section-title" id="kanjidic-title">Kanji readings and meanings</h2>
    <p class="body">
      KANJIDIC2 data is copyright © James William Breen and the Electronic Dictionary Research and
      Development Group (EDRDG), and is used under the Creative Commons Attribution-ShareAlike 4.0
      International license.
    </p>
    <p class="body">
      Tegakko adapts the data by selecting JLPT-level kanji, keeping up to three English meanings,
      and removing dots from kun'yomi readings.
    </p>
    <ul class="links">
      <li><a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project">KANJIDIC2 project</a></li>
      <li><a href="https://www.edrdg.org/edrdg/licence.html">EDRDG license and attribution terms</a></li>
      <li><a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0 license</a></li>
    </ul>
  </section>

  <section class="source-section" aria-labelledby="jlpt-title">
    <h2 class="section-title" id="jlpt-title">JLPT level lists</h2>
    <p class="body">
      JLPT level assignments are based on Jonathan Waller's lists from Tanos, licensed under
      Creative Commons Attribution (CC BY). The app uses the CSV mirror maintained in
      Bluskyo's JLPT Vocabulary repository.
    </p>
    <p class="body">These level assignments are community estimates, not official JLPT specifications.</p>
    <ul class="links">
      <li><a href="https://github.com/Bluskyo/JLPT_Vocabulary#readme">Repository mirror and source attribution</a></li>
    </ul>
  </section>

  <section class="source-section" aria-labelledby="project-title">
    <h2 class="section-title" id="project-title">Project</h2>
    <p class="body">
      Tegakko was created by
      <a href="https://simopzz.com/" target="_blank" rel="noopener noreferrer">Simone Pedrazzi</a>.
    </p>
  </section>
</ScreenShell>

<style>
  .source-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-2);
  }

  .source-section + .source-section {
    padding-top: var(--spacing-5);
    border-top: 1px solid var(--color-paper-line);
  }

  .section-title {
    margin: 0 0 var(--spacing-1);
    font-family: var(--font-heading);
    font-size: 1.35rem;
    line-height: 1.2;
    font-weight: 600;
    color: var(--color-ink);
  }

  .body {
    max-width: 68ch;
    margin: 0;
    font-family: var(--font-body);
    color: var(--color-ink-muted);
    line-height: 1.55;
  }

  .links {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    margin: 0;
    padding-left: 1.25rem;
    color: var(--color-ink);
  }

  a {
    color: var(--color-accent-deep);
    text-underline-offset: 0.18em;
  }

  a:focus-visible {
    outline: 2px solid var(--color-accent-deep);
    outline-offset: 3px;
    border-radius: 2px;
  }
</style>
