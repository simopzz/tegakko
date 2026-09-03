set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

dev:
    npm run dev

build:
    npm run build

lint:
    npm run lint

typecheck:
    npm run typecheck

test:
    npm run test

deploy: build
    wrangler pages deploy dist --project-name=tegakko
