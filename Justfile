set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

install:
    npm install

dev:
    npm run dev

build:
    npm run build

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
