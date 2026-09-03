#!/usr/bin/env bash
# typescript-eslint 8.69.0 and svelte-check 4.7.6 both hard-refuse to load
# against TypeScript >=7 (typescript-eslint: a version-major guard in its own
# source, not just a peer-range warning -- see
# https://github.com/typescript-eslint/typescript-eslint/issues/10940;
# svelte-check: bin/ts-version-check.js throws unless TS is 5.x/6.x, or you
# opt into --tsgo with a separate @typescript/native alias).
# This project pins TypeScript 7.0.2 (ARCHITECTURE-SPINE.md's Stack table),
# so `just lint` and `just typecheck` need each tool's own dependency subtree
# to see a supported TS instead. `npm install`'s package.json `overrides`
# entries nest a `typescript` dependency under each tool's own
# node_modules for exactly this reason, but npm's override mechanism only
# actually materializes a nested copy when the package depends on
# `typescript` directly -- both tools only declare it as a peerDependency,
# so npm just warns and leaves the root's TypeScript 7.0.2 to be resolved by
# hoisting. This script drops a real TypeScript 6.0.3 (the officially
# documented side-by-side compatibility line, per
# https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0)
# into each tool's own nested node_modules, where Node's module resolution
# finds it before walking up to the root's TypeScript 7.0.2.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Package directory (relative to repo root) whose own node_modules needs the
# TS 6.0.3 shim nested inside it.
TARGETS=(
  "node_modules/typescript-eslint"
  "node_modules/svelte-check"
)

tmp_dir=""
cleanup() {
  if [ -n "$tmp_dir" ]; then
    rm -rf "$tmp_dir"
  fi
}
trap cleanup EXIT

for package_dir in "${TARGETS[@]}"; do
  if [ ! -d "$package_dir" ]; then
    # Not installed yet (e.g. a partial/prod install) -- nothing to shim.
    continue
  fi

  target_dir="$package_dir/node_modules/typescript"

  current_version=""
  if [ -f "$target_dir/package.json" ]; then
    current_version=$(node -p "require('./$target_dir/package.json').version" 2>/dev/null || true)
  fi

  if [ "$current_version" = "6.0.3" ]; then
    continue
  fi

  if [ -z "$tmp_dir" ]; then
    tmp_dir=$(mktemp -d)
    npm pack typescript@6.0.3 --silent --pack-destination "$tmp_dir" >/dev/null
  fi
  tarball=$(find "$tmp_dir" -maxdepth 1 -name 'typescript-*.tgz')
  [ -n "$tarball" ] || { echo "link-ts6-for-eslint: npm pack produced no tarball" >&2; exit 1; }

  rm -rf "$target_dir"
  mkdir -p "$target_dir"
  tar -xzf "$tarball" -C "$target_dir" --strip-components=1

  echo "link-ts6-for-eslint: linked typescript@6.0.3 into $target_dir."
done
