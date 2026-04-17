# FetchStore

## Overview

Request-style reactive store. Wraps a user-supplied async worker and tracks its lifecycle (start / end / error / success) in observable state. Supports caching (`fetchOnce`), silent refresh (`fetchSilent`), polling (`fetchRecursive`), request deduplication, and AbortController integration.

## Key Files

| File | Purpose |
|------|---------|
| [src/fetch-store.ts](../../src/fetch-store.ts) | `createFetchStore` factory |
| [src/types.ts](../../src/types.ts) | `FetchStore`, `FetchStoreMeta`, `FetchStoreValue`, `FetchStoreOptions` |

## Data Model

```ts
interface FetchStoreValue<T> {
    data: T | null;
    isFetching: boolean;
    lastFetchStart: Date | null;
    lastFetchEnd: Date | null;
    lastFetchError: Error | null;
    lastFetchSilentError: Error | null;
    successCounter: number;
}
```

## Method Matrix

| Method | Flips `isFetching` | Updates `successCounter` | Joins inflight | Caches via threshold |
|--------|:---:|:---:|:---:|:---:|
| `fetch` | ✅ | ✅ | ⬜ (unless `dedupeInflight`) | ⬜ |
| `fetchSilent` | ⬜ | ✅ | ⬜ (unless `dedupeInflight`) | ⬜ |
| `fetchOnce` | ✅ (on miss) | ✅ (on miss) | ✅ (always) | ✅ |
| `fetchOnceSilent` | ⬜ | ✅ (on miss) | ✅ (always) | ✅ |
| `fetchRecursive` | ⬜ by default; `silent: false` flips it | ✅ | ⬜ | ⬜ |
| `touch` | ⬜ | ✅ (synthetic) | — | advances cache timer |

## Business Rules

- **Reset wipes everything**, including `_inflightPromise*` and the `_generation` token bumps. Post-reset, any still-resolving fetch discards its writes.
- **Superseded abortable fetch discards writes**. When `abortable: true`, a newer `fetch()` aborts the old one; even if the old one still resolves, its write is dropped via the `myController !== _abortController` check.
- **`fetchOnce` always joins an in-flight** — regardless of `dedupeInflight`. This prevents a cold-store thundering herd.
- **`touch` increments `successCounter`** as a side effect of advancing the cache timer — subscribers watching the counter should not assume every increment is a network response.

## Options

| Option | Default | Purpose |
|--------|---------|---------|
| `fetchOnceDefaultThresholdMs` | `300_000` | Default TTL for `fetchOnce` / `fetchOnceSilent` |
| `dedupeInflight` | `false` | Concurrent `fetch()` calls return the same promise |
| `abortable` | `false` | Worker receives `AbortSignal` as its last arg; new `fetch()` aborts prior in-flight |
| `dataFactory` | — | `(data, old) => T` merge strategy |
| `onReset` | — | Called after `reset()` wipes state |

## Integration Points

- **Upstream**: `@marianmeres/store` — `createStore`, `createDerivedStore`.
- **Downstream consumers**: Svelte (via the `$store` contract), any reactive UI that accepts a `subscribe` function.
- **Pair with**: [FetchStreamStore](./fetch-stream-store.md) when the data source is push-based rather than request/response.
