# Changelog

## Unreleased (3.1.0 candidate)

A thorough re-analysis surfaced several real bugs and design gaps. This release
fixes all of them and tightens a few type signatures. Most fixes are behaviorally
backward compatible; the BC-visible ones are called out under "Breaking changes"
below.

### Bug fixes

- **Aborted fetch no longer leaves `isFetching: true` forever.** When a `fetch()` was aborted (manual `abort()` or `reset()`), the `AbortError` branch returned early without resetting meta. `isFetching` got stuck until another fetch started. Now the abort branch clears `isFetching` and sets `lastFetchEnd` (when we are still the current request). (`src/fetch-store.ts` — abort-branch meta update; test `A1`.)

- **`fetchSilent` now advances `lastFetchStart`, `lastFetchEnd`, and `successCounter`.** Previously silent variants updated only `lastFetchSilentError`. That broke `fetchOnceSilent` as a caching primitive: both the cold-store gate (`!successCounter`) and the threshold gate (`lastFetchStart`) never advanced, so every `fetchOnceSilent` call unconditionally re-fetched. The "silent" semantic (no loading-spinner flicker) is preserved — only `isFetching` stays unchanged. (`src/fetch-store.ts` — `doFetchSilent` meta update; tests `A2-*`.)

- **`FetchStreamStore.reset()` now stops the running stream.** Previously `reset()` only cleared state; the worker kept running, emitting into a freshly-reset store (zombie stream / leak). The store now tracks the current stream's cancel function and invokes it before wiping state. (`src/fetch-stream-store.ts` — `_currentCancel` tracked at closure scope; test `A3`.)

- **`emit("end")` no longer wipes a preceding `emit("error")`.** The emit handler unconditionally cleared `lastFetchError` at the top, so the common `emit("error", e); emit("end")` pattern lost the error by the time subscribers saw the terminal state. Error-clearing is now scoped to `"data"` events only (data implies recovery). (`src/fetch-stream-store.ts` — error-clear moved into the data branch; test `A4`.)

- **Synchronous throw in a stream worker no longer leaves `isFetching: true`.** `_metaStore.set({ isFetching: true })` ran before `try { worker(...) }`; a sync throw was caught, but `isFetching` was never reset and the returned cancel function was a no-op. The catch branch now sets `isFetching: false`, `lastFetchEnd`, and `lastFetchError`. (`src/fetch-stream-store.ts` — `catch` branch meta update; test `A5`.)

- **Non-abortable in-flight fetches can no longer overwrite `reset()`.** When `abortable: false` and a fetch was mid-`await`, calling `reset()` wiped state, but the awaited response resumed and wrote stale data + meta on top. A generation token is now bumped on `reset()`; any in-flight fetch whose generation no longer matches discards its writes. (`src/fetch-store.ts` — `_generation` token; test `A6`.)

- **`fetchOnce` joins in-flight requests instead of returning stale data.** When `isFetching` was `true`, both gates failed and the function returned `_dataStore.get()` immediately (usually `null` or stale). Now `fetchOnce` always awaits the current in-flight promise — regardless of the `dedupeInflight` option. (`src/fetch-store.ts` — explicit in-flight join in `_fetchOnce`; test `A7`.)

- **Concurrent `fetchOnce` calls dedupe internally.** Two `fetchOnce()` calls on a cold store used to both see `successCounter: 0` and both fire. The in-flight join above covers this: the second call now joins the first's in-flight promise. (`src/fetch-store.ts`; test `C3`.)

- **Stream worker emits after cancel are silently ignored.** A worker that does not honor its cleanup function synchronously could still write data/errors to the store after the user called `stop()`. The emit callback now short-circuits on the cancel flag. (`src/fetch-stream-store.ts` — `_aborted` guard inside the emit callback; test `C6`.)

- **README code samples now match the 3.x signature.** The `Abortable` and `Deduplication` sections showed 4-arg calls (`createFetchStore(worker, null, null, { ... })`) left over from the 2.x → 3.x migration. Fixed to 3 args. (`README.md`.)

### Design improvements

- **Worker-argument types now propagate through the store.** `createFetchStore` and `createFetchStreamStore` gained a second generic `A extends unknown[]` inferred from the worker. `store.fetch(...)` / `store.fetchStream(...)` now type-check arguments against the worker's signature. Defaults preserve the old `unknown[]` behavior for untyped workers. (`src/types.ts` — `FetchStore<T, A>` and `FetchStreamStore<T, A>`.)

- **`FetchStreamEventEmitFn<T>` is generic.** The public type is now parameterized over `T` with a default of `unknown`, matching the implementation. Workers typed against this interface get type safety on `emit("data", ...)` payloads. (`src/types.ts`.)

- **`fetchRecursive` accepts `{ silent?: boolean }`.** New third argument lets polling flip `isFetching` each iteration when needed. Default remains `silent: true` to preserve the old behavior.

- **`resetError()` clears both error fields.** Previously only cleared `lastFetchError`; now also clears `lastFetchSilentError`.

- **Stream store `fetchStream()` cancels a previously running stream.** Starting a new stream while one is already active now calls the previous stream's cleanup function before the new worker runs — avoids parallel zombie streams if a consumer forgets to call the returned cancel function.

### Breaking changes

The changes below are technically BC-visible. None are expected to affect most real-world usage — the old behaviors were bugs — but each is documented in case you were depending on the exact old semantics.

1. **`fetchSilent` now bumps `successCounter` and updates `lastFetchStart` / `lastFetchEnd`.** If you were subscribing to `successCounter` as a "visible-fetch counter", silent fetches (including those inside `fetchRecursive`) now increment it. Use a separate counter in your own code if you need the old semantics.

2. **`fetchOnceSilent` now caches on its threshold.** Previously every call re-fetched (because silent didn't advance `lastFetchStart` / `successCounter`). If you were using `fetchOnceSilent` in place of `fetchSilent` and relying on the broken no-cache behavior, switch to `fetchSilent` directly or pass `thresholdMs: 0`.

3. **`fetchOnce` waits for an in-flight fetch instead of returning stale data immediately.** If you were calling `fetchOnce()` during a pending `fetch()` and reading the result synchronously, you may observe a longer wait now (the correct data arrives instead of `null` / stale).

4. **`emit("end")` no longer clears `lastFetchError`.** If you were relying on `end` as a "reset the error" signal, either emit a `"data"` first or call `resetError()` explicitly.

5. **`FetchStreamStore.reset()` now stops the running stream.** If you were calling `reset()` purely to wipe displayed state while keeping the underlying stream alive, that no longer works. Start a fresh `fetchStream()` after `reset()`.

6. **`FetchStore<T>` is now `FetchStore<T, A>` (with default).** The second generic is optional (`A extends unknown[] = unknown[]`) so existing `FetchStore<User>` annotations keep working. Code that explicitly asserted the type of `fetch` as `(...args: unknown[]) => Promise<T | null>` may now see a narrower signature.

7. **`FetchStreamEventEmitFn` became `FetchStreamEventEmitFn<T>` (with default).** `type FetchStreamEventEmitFn = ...` style references still compile (default `T = unknown`).

8. **`resetError()` now also clears `lastFetchSilentError`.** If you were calling `resetError()` and reading `lastFetchSilentError` afterwards, expect `null`.

### Non-changes worth noting

- The public `createFetchStore(worker, initial?, options?)` / `createFetchStreamStore(worker, initial?, options?)` signatures are **unchanged** from 3.0.x. No third positional argument was added or removed.
- `getInternalDataStore()` still returns a fully writable `StoreLike<T | null>` — consumers using it as an escape hatch keep working exactly as before.
- Svelte store contract (synchronous notify on subscribe, strict-equality short-circuit) is unchanged.

---

## 3.0.4

- Docs updates.

## 3.0.3

- Deps bump.

## 3.0.0

Major release. See earlier README "Breaking Changes" section (now in git history) for the 2.x → 3.x migration — simplified generic types, moved `dataFactory` into `options`, and changed `DataFactory<T>` to receive strongly-typed `T` instead of `unknown`.
