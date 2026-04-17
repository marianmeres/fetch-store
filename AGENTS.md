# @marianmeres/fetch-store — Agent Guide

> Reactive store for async fetch operations. Tracks loading/error/success state, supports caching, polling, abort, deduplication, and streaming (SSE/WebSocket). Svelte-compatible but framework-agnostic.

## Quick Reference

- **Stack**: TypeScript, Deno-first, dual-published to JSR + NPM
- **Runtime**: Deno (primary), Node via NPM build
- **Test**: `deno task test` | **Build NPM**: `deno task npm:build` | **Release**: `deno task rp` (patch) / `deno task rpm` (minor)
- **Dependencies**: [@marianmeres/store](https://jsr.io/@marianmeres/store), [@marianmeres/pubsub](https://jsr.io/@marianmeres/pubsub)

## Project Structure

```
src/
├── mod.ts                  — Export barrel (types + both stores)
├── types.ts                — All public type definitions
├── fetch-store.ts          — createFetchStore (request-style: fetch, fetchOnce, polling)
└── fetch-stream-store.ts   — createFetchStreamStore (push-style: SSE/WebSocket)
tests/
└── fetch-store.test.ts     — Combined test suite for both stores
scripts/
└── build-npm.ts            — Deno → NPM dual-publish build
```

## Critical Conventions

1. **Two stores, separate files** — `createFetchStore` (request/response) and `createFetchStreamStore` (push-based events). Do not merge; they have distinct lifecycles.
2. **Types live in `types.ts`** — Both stores re-export their public types from this single file. When adding a type, add it there and re-export in the implementation file for BC.
3. **Generation token pattern** — `fetch-store.ts` uses `_generation` to invalidate late-resolving fetches after `reset()`. Any new async path that writes to stores must honor it.
4. **Silent ≠ invisible** — `fetchSilent` skips `isFetching` but still updates `lastFetchStart`, `lastFetchEnd`, `successCounter`, so `fetchOnce`-style caching works.
5. **Two separate inflight promises** — `_inflightPromise` and `_inflightSilentPromise` are tracked independently; `fetchOnce` joins whichever is active.
6. **Tabs, 4-wide, 90-col** — See [deno.json](./deno.json) `fmt` block. `no-explicit-any` lint is disabled.
7. **Never throw from worker cleanup** — stream worker's returned cancel function is wrapped in try/catch.

## Before Making Changes

- [ ] Read [docs/architecture.md](./docs/architecture.md) to understand the state-machine semantics
- [ ] Check [docs/conventions.md](./docs/conventions.md) for meta-update patterns
- [ ] Run `deno task test` — test suite covers every known edge case including late-resolve/generation bugs
- [ ] Update [CHANGELOG.md](./CHANGELOG.md) for any behavior change

## Documentation Index

- [Architecture](./docs/architecture.md) — State model, data flow, generation token
- [Conventions](./docs/conventions.md) — Code style, meta update rules, testing patterns
- [Tasks](./docs/tasks.md) — Add a method, fix a meta bug, release
- Domains:
  - [FetchStore](./docs/domains/fetch-store.md) — request-style store
  - [FetchStreamStore](./docs/domains/fetch-stream-store.md) — push-style store
- Human docs: [README.md](./README.md), [API.md](./API.md), [CHANGELOG.md](./CHANGELOG.md)
