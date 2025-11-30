# @marianmeres/fetch-store

A reactive [store](https://github.com/marianmeres/store) utility for managing async fetch
operations with built-in state tracking for loading, errors, and success counts. Designed
for Svelte-compatible reactivity but works with any framework.

## Install

```shell
deno add jsr:@marianmeres/fetch-store
```

```shell
npm i @marianmeres/fetch-store
```

## Basic Example

```typescript
// user-store.ts
import { createFetchStore } from "@marianmeres/fetch-store";

const userStore = createFetchStore(async (userId: string) => {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) throw new Error("Failed to fetch user");
    return await response.json();
});

// Fetch user data
await userStore.fetch("123");

// Access current state
const { data, isFetching, lastFetchError } = userStore.get();
```

### Svelte Integration

```svelte
<!-- UserProfile.svelte -->
<script>
    import { onMount } from 'svelte';
    import { userStore } from './user-store.ts';

    export let userId;
    onMount(() => userStore.fetch(userId));
</script>

{#if $userStore.isFetching}
    <Spinner />
{:else if $userStore.lastFetchError}
    <Error error={$userStore.lastFetchError} />
{:else}
    <UserCard user={$userStore.data} />
{/if}
```

## Features

- **Reactive state management** - Subscribe to loading, error, and data states
- **Silent fetching** - Update data without triggering loading indicators
- **Fetch-once with caching** - Prevent redundant fetches within a time threshold
- **Polling support** - Built-in recursive fetching for real-time updates
- **Request deduplication** - Optionally return in-flight promises for concurrent calls
- **Abort support** - Cancel in-flight requests with AbortController integration
- **Stream support** - Handle SSE, WebSocket, or push-based data sources

## Abortable Requests

Enable automatic request cancellation when a new fetch starts:

```typescript
import { createFetchStore } from "@marianmeres/fetch-store";

const searchStore = createFetchStore(
    async (query: string, signal: AbortSignal) => {
        const response = await fetch(`/api/search?q=${query}`, { signal });
        if (!response.ok) throw new Error("Search failed");
        return await response.json();
    },
    null,
    null,
    { abortable: true }
);

// Rapid calls - each new fetch aborts the previous one
searchStore.fetch("h");      // Aborted
searchStore.fetch("he");     // Aborted
searchStore.fetch("hel");    // Aborted
searchStore.fetch("hello");  // This one completes

// Manual abort
searchStore.abort();
```

## Request Deduplication

Prevent duplicate requests when multiple calls happen while one is in-flight:

```typescript
const userStore = createFetchStore(
    async (userId) => fetch(`/api/users/${userId}`).then(r => r.json()),
    null,
    null,
    { dedupeInflight: true }
);

// These all return the same promise (only one HTTP request is made)
const p1 = userStore.fetch("123");
const p2 = userStore.fetch("123");
const p3 = userStore.fetch("123");

p1 === p2 && p2 === p3; // true
```

## Streaming Data

For streaming data sources, use `createFetchStreamStore`:

```typescript
import { createFetchStreamStore } from "@marianmeres/fetch-store";

const sseStore = createFetchStreamStore((emit, url) => {
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
        emit("data", JSON.parse(event.data));
    };

    eventSource.onerror = (error) => {
        emit("error", error);
    };

    // Return cleanup function
    return () => {
        eventSource.close();
        emit("end");
    };
});

// Start streaming (with optional auto-restart after 5s delay)
const stop = sseStore.fetchStream(["/api/events"], 5000);

// Later: stop the stream
stop();
```

## Breaking Changes (v3.0.0)

This major release includes the following breaking changes:

### Simplified Generic Types

The `FetchStore<T>` and `FetchStreamStore<T>` interfaces have been simplified from a
two-generic pattern to a single generic:

```typescript
// Before (v2.x)
interface FetchStore<T, V = T extends FetchStoreValue<infer D> ? D : T> { ... }

// After (v3.x)
interface FetchStore<T> extends StoreReadable<FetchStoreValue<T>> { ... }
```

**Migration:** If you were using explicit generic parameters, simply use the data type
directly: `FetchStore<User>` instead of `FetchStore<FetchStoreValue<User>, User>`.

### Simplified API Signature

The `createFetchStore` and `createFetchStreamStore` functions now have a simpler signature.
The `dataFactory` parameter has been moved into the `options` object:

```typescript
// Before (v2.x)
createFetchStore(fetchWorker, initial, dataFactory, options)

// After (v3.x)
createFetchStore(fetchWorker, initial, options)
// dataFactory is now in options: { dataFactory: (data, old) => transformedData }
```

**Migration:** Move your `dataFactory` from the third parameter into the options object:

```typescript
// Before
const store = createFetchStore(
    async () => fetchData(),
    null,
    (data, old) => ({ ...old, ...data }),
    { dedupeInflight: true }
);

// After
const store = createFetchStore(
    async () => fetchData(),
    null,
    {
        dataFactory: (data, old) => ({ ...old, ...data }),
        dedupeInflight: true
    }
);
```

### DataFactory Type Change

The `DataFactory<T>` type now receives properly typed data instead of `unknown`:

```typescript
// Before (v2.x)
type DataFactory<T> = (raw: any, old?: T) => T;

// After (v3.x)
type DataFactory<T> = (data: T, old?: T) => T;
```

The `fetchWorker` must now return `Promise<T>` directly, making the types consistent
throughout the API.


## API Reference

### `createFetchStore<T>(fetchWorker, initial?, options?)`

Creates a reactive store for async fetch operations.

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fetchWorker` | `(...args) => Promise<T>` | required | Async function performing the fetch. Must return data of type T. When `abortable: true`, receives `AbortSignal` as the last argument. |
| `initial` | `T \| null` | `null` | Initial data value |
| `options` | `FetchStoreOptions<T>` | `{}` | Configuration options |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fetchOnceDefaultThresholdMs` | `number` | `300000` | Default threshold (5 min) for `fetchOnce` before allowing re-fetch |
| `dedupeInflight` | `boolean` | `false` | If true, concurrent `fetch()` calls return the same promise |
| `abortable` | `boolean` | `false` | If true, creates AbortController for each fetch, aborting previous requests |
| `dataFactory` | `(data: T, old?: T) => T` | - | Transform fetched data (useful for merge strategies) |
| `onReset` | `() => void` | - | Callback invoked when `reset()` is called |

**Returns:** `FetchStore<T>`

### FetchStore Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe` | `(fn: (value) => void) => () => void` | Subscribe to store changes (Svelte-compatible) |
| `get` | `() => FetchStoreValue<T>` | Get current store value |
| `fetch` | `(...args) => Promise<T \| null>` | Execute fetch, sets `isFetching` to true |
| `fetchSilent` | `(...args) => Promise<T \| null>` | Execute fetch without updating `isFetching` |
| `fetchOnce` | `(args?, thresholdMs?) => Promise<T \| null>` | Fetch only if not already fetched or threshold passed |
| `fetchOnceSilent` | `(args?, thresholdMs?) => Promise<T \| null>` | Silent version of `fetchOnce` |
| `fetchRecursive` | `(args?, delayMs?) => () => void` | Start polling, returns cancel function |
| `reset` | `() => void` | Reset store to initial state |
| `resetError` | `() => void` | Clear `lastFetchError` only |
| `touch` | `(data?: T) => void` | Update timestamps (tricks `fetchOnce`), optionally set data |
| `abort` | `() => void` | Abort in-flight requests (requires `abortable: true`) |
| `getInternalDataStore` | `() => StoreLike<T>` | Access internal data store |

### FetchStoreValue Properties

The store value contains both data and metadata:

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T \| null` | The fetched data (null before first fetch or after reset) |
| `isFetching` | `boolean` | Whether a fetch is in progress |
| `lastFetchStart` | `Date \| null` | When the last fetch started |
| `lastFetchEnd` | `Date \| null` | When the last fetch completed |
| `lastFetchError` | `Error \| null` | Error from the last fetch, if any |
| `lastFetchSilentError` | `Error \| null` | Error from the last silent fetch, if any |
| `successCounter` | `number` | Number of successful fetches |

### `createFetchStreamStore<T>(fetchStreamWorker, initial?, options?)`

Creates a reactive store for streaming data sources.

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fetchStreamWorker` | `(emit, ...args) => (() => void) \| void` | required | Worker receiving emit callback for events. Emit receives data of type T. Should return cleanup function. |
| `initial` | `T \| null` | `null` | Initial data value |
| `options` | `FetchStreamStoreOptions<T>` | `{}` | Configuration options |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dataFactory` | `(data: T, old?: T) => T` | - | Transform received data (useful for merge strategies) |
| `onReset` | `() => void` | - | Callback invoked when `reset()` is called |

**Emit Events:**
- `emit("data", value)` - Push new data
- `emit("error", error)` - Report an error
- `emit("end")` - Signal stream completion

**Returns:** `FetchStreamStore<T>`

### FetchStreamStore Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe` | `(fn: (value) => void) => () => void` | Subscribe to store changes |
| `get` | `() => FetchStreamStoreValue<T>` | Get current store value |
| `fetchStream` | `(args?, recursiveDelayMs?) => () => void` | Start stream, returns stop function. If `recursiveDelayMs > 0`, restarts after "end" event. |
| `reset` | `() => void` | Reset store to initial state |
| `resetError` | `() => void` | Clear `lastFetchError` only |
| `getInternalDataStore` | `() => StoreLike<T>` | Access internal data store |

## Package Identity

- **Name:** @marianmeres/fetch-store
- **Author:** Marian Meres
- **Repository:** https://github.com/marianmeres/fetch-store
- **License:** MIT
