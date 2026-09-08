<script lang="ts">
  // Test-only harness: owns `scope` as `$state`, exactly like App.svelte
  // does, so Drill receives a live reactive proxy rather than a plain
  // fixture object. Mount this (instead of Drill directly) in any test that
  // asserts on what crosses an adapter boundary -- a proxy is not
  // structured-cloneable, and only this shape reproduces what production
  // actually hands the persistence port.
  import Drill from './Drill.svelte';
  import type { Scope } from '../../domain/scope';
  import type { Attempt } from '../../domain/attempt';
  import type { Tally } from '../../domain/tally';
  import type { InkSurface } from '../../ports/ink-surface';
  import type { AttemptRepository } from '../../ports/attempt-repository';
  import type { TallyRepository } from '../../ports/tally-repository';
  import type { SessionRepository } from '../../ports/session-repository';
  import type { SessionSummaryView } from '../../domain/session';

  interface Props {
    attempts: Attempt[];
    tallies: Tally[];
    inkSurface: InkSurface;
    attemptRepository: AttemptRepository;
    tallyRepository: TallyRepository;
    sessionRepository: SessionRepository;
    idleTimeoutMs: number;
    onClose: (summary: SessionSummaryView) => void;
  }

  const drillProps: Props = $props();
  // Owned as `$state` here, exactly like the scope-picker selection in
  // App.svelte, so Drill receives a live reactive proxy rather than a plain
  // fixture object. (Initialized inline, not from a prop, so no
  // `state_referenced_locally` capture is involved.)
  // eslint-disable-next-line prefer-const -- the `$state` rune requires `let`.
  let scope = $state<Scope>({ scripts: ['hiragana'], units: ['base'] });
</script>

<Drill {scope} {...drillProps} />
