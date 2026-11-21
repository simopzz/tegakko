import { tick } from 'svelte';

/** Arrow-key navigation for the radio pill groups, like a native radio
 * group: an arrow (or Home/End) selects the next option, commits it
 * through the same path a tap takes, and moves focus to it. Wraps at
 * the ends.
 *
 * Keydown sits on the group, not the option: the keystroke lands wherever
 * focus happens to be, but the *checked* option is the anchor.
 * `options` must be in the same order as the group's `[role="radio"]`
 * children. */
export function handleRadioKeys<T>(
  event: KeyboardEvent,
  options: readonly T[],
  apply: (next: T) => void,
): void {
  // The handler is attached to the group element, so currentTarget is
  // that element at dispatch time (the DOM type is wider).
  const radios = [...(event.currentTarget as Element).querySelectorAll<HTMLElement>('[role="radio"]')];
  if (radios.length === 0) return;
  const checked = radios.findIndex((radio) => radio.getAttribute('aria-checked') === 'true');
  let next: number;
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      next = checked <= 0 ? radios.length - 1 : checked - 1;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      next = checked >= radios.length - 1 ? 0 : checked + 1;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = radios.length - 1;
      break;
    default:
      return;
  }
  const option = options[next];
  if (option === undefined) return;
  event.preventDefault();
  apply(option);
  // Focus follows the commit, once Svelte has flushed the new
  // aria-checked/tabindex onto the target.
  void tick().then(() => radios[next]?.focus());
}
