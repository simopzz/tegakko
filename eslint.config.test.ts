import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { Linter, RuleTester } from 'eslint';
import type { Rule } from 'eslint';
import importPlugin from 'eslint-plugin-import-x';
import eslintConfig, {
  adapterZones,
  domainPurityZones,
  boundaryResolverSettings,
} from './eslint.config.js';

// no-restricted-paths' zone/target matching (path.relative-based) and its
// import resolver (real filesystem lookups relative to the source file's
// directory) both require an absolute `physicalFilename` -- a relative
// fixture `filename` silently resolves to no match and the rule reports
// nothing, regardless of zone config. `path.resolve` anchors each fixture
// path to this file's own directory (the repo root), which is also where
// the zones' `./src/...` targets resolve from.
const abs = (relativePath: string): string => path.resolve(import.meta.dirname, relativePath);

// Proves the boundary rule (docs/adr/0001-hexagonal-boundary.md) actually
// rejects a disallowed import. It uses the *real* zone arrays, so a
// regression in the config (e.g. a dropped trailing `/**` silently turning a
// zone into a no-op) fails this test.
const zones = [...adapterZones, ...domainPurityZones];

// eslint-plugin-import-x's `no-restricted-paths` rule is typed against its
// own rule-creator generic, which isn't directly assignable to the
// `RuleDefinition` type `RuleTester.run`'s second parameter expects in this
// installed `eslint` version. `Rule.RuleModule` (eslint's classic rule type)
// itself extends `RuleDefinition`, so routing through it via a double cast
// resolves the mismatch with no `any` in project code.
const noRestrictedPaths = importPlugin.rules[
  'no-restricted-paths'
] as unknown as Rule.RuleModule;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  // Sourced from the real config (not retyped) so drift in the real
  // resolver settings -- e.g. losing the `.svelte` extension -- fails this
  // test too, the same way zone drift does.
  settings: {
    'import-x/resolver': boundaryResolverSettings,
  },
});

describe('eslint.config.js hexagonal boundary zones', () => {
  it('accepts allowed shapes and rejects disallowed cross-boundary imports', () => {
    ruleTester.run('import-x/no-restricted-paths', noRestrictedPaths, {
      valid: [
        {
          // Same-adapter import stays allowed (existing adapterZones
          // behavior -- must not regress).
          filename: abs('src/adapters/persistence/tally-repository.ts'),
          code: "import './db';",
          options: [{ zones }],
        },
        {
          // domain/ -> ports/ stays allowed: domain depends on port types.
          filename: abs('src/domain/drill.ts'),
          code: "import '../ports/tally-repository';",
          options: [{ zones }],
        },
        {
          // ports/ -> domain/ stays allowed too: the boundary never
          // restricts this direction.
          filename: abs('src/ports/card-repository.ts'),
          code: "import '../domain/drill';",
          options: [{ zones }],
        },
        {
          // app/ stays exempt from every zone -- it's the composition root.
          filename: abs('src/app/main.ts'),
          code: "import '../adapters/persistence/db';",
          options: [{ zones }],
        },
      ],
      invalid: [
        {
          // Cross-adapter import: existing adapterZones zone. Targets a
          // .svelte file so the resolver's `.svelte` extension entry is
          // actually exercised (all other fixtures here import .ts files).
          filename: abs('src/adapters/persistence/tally-repository.ts'),
          code: "import '../ui/ScopePicker.svelte';",
          options: [{ zones }],
          errors: [{ messageId: 'zone' }],
        },
        {
          // domain/ -> adapters/: new domainPurityZones zone, first `from`
          // entry (./src/adapters/**).
          filename: abs('src/domain/cards.ts'),
          code: "import '../adapters/persistence/db';",
          options: [{ zones }],
          errors: [{ messageId: 'zone' }],
        },
        {
          // domain/ -> app/: new domainPurityZones zone, second `from`
          // entry (./src/app/**) -- a regression narrowing just this entry
          // would otherwise ship silently.
          filename: abs('src/domain/cards.ts'),
          code: "import '../app/main';",
          options: [{ zones }],
          errors: [{ messageId: 'zone' }],
        },
        {
          // ports/ -> app/: new domainPurityZones zone, second `from` entry
          // (./src/app/**).
          filename: abs('src/ports/card-repository.ts'),
          code: "import '../app/main';",
          options: [{ zones }],
          errors: [{ messageId: 'zone' }],
        },
        {
          // ports/ -> adapters/: new domainPurityZones zone, first `from`
          // entry (./src/adapters/**) -- a regression narrowing just this
          // entry would otherwise ship silently.
          filename: abs('src/ports/card-repository.ts'),
          code: "import '../adapters/persistence/db';",
          options: [{ zones }],
          errors: [{ messageId: 'zone' }],
        },
      ],
    });
  });

  // The RuleTester checks above hand the rule and zones straight to
  // RuleTester.run, bypassing the default-exported flat config entirely --
  // so a regression that drops 'src/domain/**/*.ts' / 'src/ports/**/*.ts'
  // (or the adapters entries) from that config's `files` glob would pass
  // every check above silently while real `eslint .` runs stopped enforcing
  // the rule on those directories. This exercises the real default export
  // through eslint's Linter, the same way `eslint .` does, so a `files`
  // regression fails here.
  it('routes domain/ and ports/ files to the boundary rule via the real flat config', () => {
    const linter = new Linter({ configType: 'flat' });
    // `eslintConfig` (tseslint.config()'s return type) isn't structurally
    // assignable to eslint's own `Linter.Config[]` -- their `languageOptions`
    // types disagree on an index signature -- despite being the same object
    // shape at runtime. Same double-cast rationale as `noRestrictedPaths`
    // above: no `any` in project code.
    const flatConfig = eslintConfig as unknown as Linter.Config[];
    const violations = (filename: string, code: string) =>
      linter
        .verify(code, flatConfig, abs(filename))
        .filter((message) => message.ruleId === 'import-x/no-restricted-paths');

    expect(violations('src/domain/cards.ts', "import '../adapters/persistence/db';")).toHaveLength(
      1,
    );
    expect(violations('src/domain/cards.ts', "import '../ports/tally-repository';")).toHaveLength(
      0,
    );
    expect(violations('src/ports/card-repository.ts', "import '../app/main';")).toHaveLength(1);
    expect(violations('src/ports/card-repository.ts', "import './tally-repository';")).toHaveLength(
      0,
    );

    // The four assertions above only ever hand the linter a `.ts` filename
    // under domain/ or ports/ -- a regression dropping the adapters `files`
    // entries, or the new domain/ports `.svelte` entries, would pass every
    // check above silently. These fill that gap.
    expect(violations('src/adapters/ui/screens.ts', "import '../persistence/db';")).toHaveLength(1);
    expect(
      violations('src/adapters/persistence/tally-repository.ts', "import './db';"),
    ).toHaveLength(0);
    expect(
      violations(
        'src/adapters/ui/ScopePicker.svelte',
        "<script>\n  import '../persistence/db';\n</script>\n",
      ),
    ).toHaveLength(1);
    // No .svelte file exists under domain/ or ports/ (none should: they hold
    // no UI) -- a minimal synthetic SFC is enough to
    // prove the `.svelte` files-glob entries still route through the rule.
    expect(
      violations(
        'src/domain/Thing.svelte',
        "<script>\n  import '../adapters/persistence/db';\n</script>\n",
      ),
    ).toHaveLength(1);
    expect(
      violations('src/ports/Thing.svelte', "<script>\n  import '../app/main';\n</script>\n"),
    ).toHaveLength(1);
  });
});
