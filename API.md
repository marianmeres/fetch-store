# API

## Functions

### `createFetchStore(fetchWorker, initial?, options?)`

Creates a reactive store for async fetch operations.

**Type signature:**

```typescript
createFetchStore<T, A extends unknown[] = unknown[]>(
    fetchWorker: (...args: A) => Promise<T>,
    initial?: T | null,
    options?: Partial<FetchStoreOptions<T>>
): FetchStore<T, A>
```

**Parameters:**

- `fetchWorker` (`(...args: A) => Promise<T>`) — Async function performing the fetch. When `abortable: true`, receives `AbortSignal` as the last argument.
- `initial` (`T | null`, optional) — Initial data value. Default: `null`.
- `options` (`Partial<FetchStoreOptions<T>>`, optional) — See [FetchStoreOptions](#fetchstoreoptions).

**Returns:** [`FetchStore<T, A>`](#fetchstore)

**Example:**

```typescript
const userStore = createFetchStore(
    async (id: string) => (await fetch(`/api/users/${id}`)).json() as Promise<User>,
    null,
    { fetchOnceDefaultThresholdMs: 60_000 }
);

await userStore.fetch("123");
const { data } = userStore.get();
```

---

### `createFetchStreamStore(fetchStreamWorker, initial?, options?)`

Creates a reactive store for streaming data sources (SSE, WebSocket, push-based).

**Type signature:**

```typescript
createFetchStreamStore<T, A extends unknown[] = unknown[]>(
    fetchStreamWorker: (
        emit: FetchStreamEventEmitFn<T>,
        ...args: A
    ) => (() => void) | void,
    initial?: T | null,
    options?: Partial<FetchStreamStoreOptions<T>>
): FetchStreamStore<T, A>
```

**Parameters:**

- `fetchStreamWorker` — Worker function. Receives an `emit` callback as first arg and user args after. May return a cleanup function.
- `initial` (`T | null`, optional) — Initial data value. Default: `null`.
- `options` (`Partial<FetchStreamStoreOptions<T>>`, optional) — See [FetchStreamStoreOptions](#fetchstreamstoreoptions).

**Returns:** [`FetchStreamStore<T, A>`](#fetchstreamstore)

**Example:**

```typescript
const store = createFetchStreamStore<Message>((emit, url: string) => {
    const es = new EventSource(url);
    es.onmessage = (e) => emit("data", JSON.parse(e.data));
    es.onerror = (e) => emit("error", e);
    return () => { es.close(); emit("end"); };
});

const stop = store.fetchStream(["/api/events"]);
```

---

## Interfaces

### `FetchStore`

Returned by `createFetchStore`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe` | `(fn: (value: FetchStoreValue<T>) => void) => () => void` | Svelte-compatible subscription. Fires immediately with the current value, then on every change. Returns an unsubscribe function. |
| `get` | `() => FetchStoreValue<T>` | Synchronous snapshot of current value. |
| `fetch` | `(...args: A) => Promise<T \| null>` | Run the worker. Sets `isFetching: true`. Returns data or `null` on error/abort. |
| `fetchSilent` | `(...args: A) => Promise<T \| null>` | Like `fetch` but never sets `isFetching`. Still advances `successCounter`, timestamps. |
| `fetchOnce` | `(args?: A \| unknown, thresholdMs?: number) => Promise<T \| null>` | Fetch only if no successful fetch yet **or** last fetch older than `thresholdMs`. Joins any in-flight request. |
| `fetchOnceSilent` | `(args?: A \| unknown, thresholdMs?: number) => Promise<T \| null>` | Silent version of `fetchOnce`. |
| `fetchRecursive` | `(args?: A \| unknown, delayMs?: number \| (() => number), options?: { silent?: boolean }) => () => void` | Polling. Each iteration waits for the previous to finish. Returns cancel fn. Default uses `fetchSilent`; set `silent: false` to flip `isFetching`. `delayMs` as function allows dynamic intervals — returning `0` stops polling. |
| `reset` | `() => void` | Clear data + meta to initial state. Aborts in-flight (when abortable). Invalidates late-resolving fetches via an internal generation token. |
| `resetError` | `() => void` | Clear `lastFetchError` **and** `lastFetchSilentError`. Other state untouched. |
| `touch` | `(data?: T) => void` | Advance `lastFetchStart`/`lastFetchEnd` to now (tricks `fetchOnce`). Optionally replaces data. Increments `successCounter`. |
| `abort` | `() => void` | Abort any in-flight requests (requires `abortable: true`). |
| `fetchWorker` | `(...args: A) => Promise<T>` | The original worker, exposed for composition. |
| `getInternalDataStore` | `() => StoreLike<T \| null>` | Access the underlying data store. Bypasses `dataFactory` and meta — use with care. |

`fetchArgs` can be passed either as a tuple (`["x"]`) or as a single non-array value (`"x"`); the store normalizes it.

---

### `FetchStreamStore`

Returned by `createFetchStreamStore`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe` | `(fn: (value: FetchStreamStoreValue<T>) => void) => () => void` | Svelte-compatible subscription. |
| `get` | `() => FetchStreamStoreValue<T>` | Synchronous snapshot. |
| `fetchStream` | `(args?: A \| unknown, recursiveDelayMs?: number \| (() => number)) => () => void` | Start the stream. Returns cancel fn. If `recursiveDelayMs > 0`, the worker is restarted `recursiveDelayMs` after every `emit("end")`. Starting a new stream while one is running cancels the previous one. |
| `reset` | `() => void` | Stop the running stream (calls its cleanup), clear data + meta. |
| `resetError` | `() => void` | Clear `lastFetchError` only. |
| `fetchStreamWorker` | raw worker | Original worker, exposed for composition. |
| `getInternalDataStore` | `() => StoreLike<T \| null>` | Underlying data store. |

---

## Types

### `FetchStoreValue<T>`

The value returned by `get()` and passed to subscribers.

```typescript
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

| Field | Description |
|-------|-------------|
| `data` | Fetched data; `null` before first successful fetch or after `reset()`. |
| `isFetching` | `true` during a `fetch()` call. Silent fetches do not flip this. |
| `lastFetchStart` / `lastFetchEnd` | Timestamps of the most recent fetch (silent or not). |
| `lastFetchError` | Error from the last non-silent fetch. Cleared at the start of the next non-silent `fetch()`. |
| `lastFetchSilentError` | Error from the last silent fetch. Cleared on next silent success. |
| `successCounter` | Incremented on every successful fetch, silent or not (and by `touch()`). |

### `FetchStreamStoreValue<T>`

```typescript
interface FetchStreamStoreValue<T> {
    data: T | null;
    isFetching: boolean;
    lastFetchStart: Date | null;
    lastFetchEnd: Date | null;
    lastFetchError: Error | null;
}
```

Set to `isFetching: true` when `fetchStream()` starts; flipped back to `false` on `emit("end")`.

### `FetchStoreOptions`

```typescript
interface FetchStoreOptions<T> extends CreateStoreOptions<T> {
    fetchOnceDefaultThresholdMs: number;
    onReset: () => void;
    dedupeInflight: boolean;
    abortable: boolean;
    dataFactory: DataFactory<T>;
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `fetchOnceDefaultThresholdMs` | `300_000` (5 min) | TTL for `fetchOnce` / `fetchOnceSilent`. Use `0` at call site to skip threshold and rely only on `successCounter`. |
| `dedupeInflight` | `false` | Concurrent `fetch()` (or `fetchSilent()`) calls return the same promise. |
| `abortable` | `false` | Worker receives `AbortSignal` as last arg. A new `fetch()` aborts the previous in-flight one. |
| `dataFactory` | — | `(data, old?) => T` — transform/merge each incoming payload. |
| `onReset` | — | Called after `reset()` wipes state. |

### `FetchStreamStoreOptions`

```typescript
interface FetchStreamStoreOptions<T> extends CreateStoreOptions<T> {
    onReset: () => void;
    dataFactory: DataFactory<T>;
}
```

### `DataFactory<T>`

```typescript
type DataFactory<T> = (data: T, old?: T) => T;
```

Applied to every data write. Use for merge strategies (shallow merge, deep merge, array append, etc.).

### `FetchStreamEventName`

```typescript
type FetchStreamEventName = "data" | "error" | "end";
```

### `FetchStreamEventEmitFn<T>`

```typescript
type FetchStreamEventEmitFn<T = unknown> = (
    eventName: FetchStreamEventName,
    eventData?: T | Error
) => void;
```

Passed to the stream worker as its first argument. Semantics:

- `emit("data", value)` — writes data; clears any prior `lastFetchError`.
- `emit("error", err)` — sets `lastFetchError`; does not touch data.
- `emit("end")` — sets `isFetching: false`, `lastFetchEnd`; **does not** clear errors.

Emits after `cancel()` / `reset()` are silently ignored.

### `FetchMetaBase` / `FetchStoreMeta` / `FetchStreamStoreMeta`

Base shape shared by both stores; the concrete `*StoreValue<T>` is `{ data } & *StoreMeta`.

```typescript
interface FetchMetaBase {
    isFetching: boolean;
    lastFetchStart: Date | null;
    lastFetchEnd: Date | null;
    lastFetchError: Error | null;
}

interface FetchStoreMeta extends FetchMetaBase {
    successCounter: number;
    lastFetchSilentError: Error | null;
}

interface FetchStreamStoreMeta extends FetchMetaBase {}
```
