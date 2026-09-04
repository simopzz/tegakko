set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

install:
    npm install

dev:
    npm run dev

build:
    npm run build

# Requires a python3 interpreter on PATH -- the only recipe in this file
# that isn't satisfied by the npm toolchain alone.
gen-icons:
    python3 scripts/gen-icons.py

clean:
    rm -rf dist dev-dist

lint:
    npm run lint

typecheck:
    npm run typecheck

test:
    npm run test

check: lint typecheck test

deploy: build
    wrangler pages deploy dist --project-name=tegakko
