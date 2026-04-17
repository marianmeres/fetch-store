# Conventions

## File Organisation

- One factory per file; types in `types.ts`.
- `mod.ts` is a pure barrel — no logic.
- Re-export public types from the implementation file too (BC for consumers who imported from `fetch-store.ts` directly).

## Naming

| Kind | Convention | Example |
|------|------------|---------|
| Factories | `createXxxStore` | `createFetchStore` |
| Public types | `PascalCase` | `FetchStoreMeta` |
| Internal state | `_camelCase` | `_inflightPromise`, `_generation` |
| Internal helpers | `_camelCase` | `_createMetaObj`, `_normalizeArgs` |

## Formatting

Set in [deno.json](../deno.json):

- Tabs, width 4, line width 90
- `no-explicit-any` lint **disabled** — this library deliberately uses `any` in generic glue

## Meta Update Patterns

### ✅ Do — always read `prev` before writing

```ts
const prev = _metaStore.get();
_metaStore.set({
    ...prev,
    isFetching: false,
    lastFetchEnd: new Date(),
    successCounter: error ? prev.successCounter : prev.successCounter + 1,
});
```

### ❌ Don't — never construct meta from scratch in an update

```ts
_metaStore.set({ isFetching: false, lastFetchEnd: new Date() });
// wipes all other fields
```

### ✅ Do — guard every post-await write with generation + controller

```ts
if (myGeneration !== _generation) return null;
if (abortable && myController !== _abortController && _abortController !== null) return null;
_dataStore.set(...);
```

### ❌ Don't — write after `await` without guards

```ts
const data = await fetchWorker(...);
_dataStore.set(data); // may overwrite reset() or a newer fetch
```

## Stream Worker Contract

- Worker receives `emit` as its **first** argument; user args follow.
- Worker may return a cleanup function or void.
- `emit("data", v)` → write data and clear any prior error.
- `emit("error", e)` → write error; does NOT clear data.
- `emit("end")` → set `isFetching: false`, `lastFetchEnd`; does NOT clear error.
- All `emit` calls after cancel are no-ops — do not emit from cleanup unless you explicitly want an `"end"` event.

## Error Handling

- Fetch worker errors wrap non-`Error` throws: `e instanceof Error ? e : new Error(String(e))`.
- `AbortError` is detected via `DOMException && name === "AbortError"`; do not rely on message text.
- Synchronous throws inside a stream worker are caught and written to `lastFetchError`; the store does not crash.

## Testing

- All tests live in [tests/fetch-store.test.ts](../tests/fetch-store.test.ts).
- Pattern: build the smallest reproducer, assert state before and after each async step.
- Regression tests are numbered (`A1`–`A7`, `C3`–`C6`) and referenced from [CHANGELOG.md](../CHANGELOG.md) bug-fix entries. Keep this mapping when adding new fixes.
- Run: `deno task test` (or `deno task test:watch`).

## Anti-Patterns

| Don't | Do instead |
|-------|------------|
| Add a new inflight tracker per method | Reuse `_inflightPromise` / `_inflightSilentPromise`; add new mode only if semantics truly differ |
| Skip the generation check on a new write path | Copy the pattern from `doFetch` — every post-await branch checks `myGeneration !== _generation` |
| Clear `lastFetchError` in `end` handler | Only `data` events clear errors |
| Throw from user-supplied cleanup | Wrap in try/catch — cleanup must not escalate |
