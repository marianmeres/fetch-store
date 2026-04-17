# Architecture

## Overview

`@marianmeres/fetch-store` wraps `@marianmeres/store` primitives into two higher-level factories that track the lifecycle of async operations. Both factories return a `StoreReadable` whose value is the union of `{ data }` and a meta object.

Internally each factory composes two independent stores (`_dataStore`, `_metaStore`) joined by `createDerivedStore` so that subscribers see a single, consistent snapshot on every change.

## Component Map

```
createFetchStore (request/response)
├── _dataStore           (StoreLike<T | null>)
├── _metaStore           (StoreLike<FetchStoreMeta>)
├── _generation          (number — reset invalidation token)
├── _inflightPromise     (normal fetch in flight)
├── _inflightSilentPromise (silent fetch in flight)
├── _abortController     (per-mode AbortController when abortable)
└── subscribe/get        (createDerivedStore([_dataStore, _metaStore]))

createFetchStreamStore (push events)
├── _dataStore
├── _metaStore           (FetchStreamStoreMeta — no successCounter)
├── _currentCancel       (cancel fn of the running stream, for reset)
└── subscribe/get
```

## Data Flow — FetchStore.fetch()

```
caller
  │
  ▼
fetch(...args)
  │  ─ dedupeInflight? return _inflightPromise
  │  ─ abortable? abort previous controller, create new one
  │  ─ capture myController, myGeneration
  ▼
_metaStore.set({ isFetching: true, lastFetchStart, lastFetchError: null })
  │
  ▼
await fetchWorker(...args [, signal])
  │
  ├── success → if (myGeneration === _generation && myController is current)
  │              _dataStore.set(dataFactory(data, old))
  │              _metaStore.set({ isFetching: false, lastFetchEnd, successCounter++ })
  │
  ├── AbortError → if still current: clear isFetching; else drop
  │
  └── other error → _metaStore.set({ isFetching: false, lastFetchError })
```

## State Invariants

| Invariant | Where enforced |
|-----------|----------------|
| Late-resolving fetch never overwrites post-reset state | `_generation` compared before every meta/data write |
| Superseded abortable fetch never overwrites current fetch's state | `myController !== _abortController` check before write |
| `fetchOnce` never fires when any fetch is in-flight (silent or not) | `_fetchOnce` joins `_inflightPromise` / `_inflightSilentPromise` first |
| `fetchSilent` does not flip `isFetching` | no `isFetching: true` write in silent path |
| Stream `emit` after `cancel()` is silently ignored | `_aborted` guard at top of emit callback |
| Stream `emit("end")` does not wipe a prior `emit("error")` | error-clear lives inside the `data` branch only |
| `reset()` on stream store stops the running worker | `_currentCancel` invoked before state wipe |

## External Dependencies

| Package | Usage |
|---------|-------|
| [@marianmeres/store](https://jsr.io/@marianmeres/store) | `createStore`, `createDerivedStore` — underlying reactive primitive |
| [@marianmeres/pubsub](https://jsr.io/@marianmeres/pubsub) | transitively, via `@marianmeres/store` |
| `@std/assert`, `@std/fs`, `@std/path` | tests + npm build only |

## Key Files

| File | Role |
|------|------|
| [src/types.ts](../src/types.ts) | Single source of truth for all public types |
| [src/fetch-store.ts](../src/fetch-store.ts) | Request-style factory + generation/abort plumbing |
| [src/fetch-stream-store.ts](../src/fetch-stream-store.ts) | Push-style factory + stream cancel plumbing |
| [src/mod.ts](../src/mod.ts) | Consumer-facing barrel |
| [scripts/build-npm.ts](../scripts/build-npm.ts) | Deno→NPM build pipeline |

## Security Boundaries

None — this is a pure client-side state library. It invokes a user-supplied worker; all network, auth, and retry concerns live in that worker.
