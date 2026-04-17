# @marianmeres/fetch-store

[![JSR](https://jsr.io/badges/@marianmeres/fetch-store)](https://jsr.io/@marianmeres/fetch-store)
[![NPM](https://img.shields.io/npm/v/@marianmeres/fetch-store)](https://www.npmjs.com/package/@marianmeres/fetch-store)
[![License](https://img.shields.io/npm/l/@marianmeres/fetch-store)](LICENSE)

Reactive store for async fetch operations with loading/error/success state tracking, caching, polling, request deduplication, abort support, and streaming (SSE, WebSocket). Svelte-compatible but framework-agnostic.

## Installation

```bash
deno add jsr:@marianmeres/fetch-store
```

```bash
npm install @marianmeres/fetch-store
```

## Usage

```typescript
import { createFetchStore } from "@marianmeres/fetch-store";

const userStore = createFetchStore(async (userId: string) => {
    const res = await fetch(`/api/users/${userId}`);
    if (!res.ok) throw new Error("Failed to fetch user");
    return (await res.json()) as User;
});

userStore.subscribe(({ data, isFetching, lastFetchError }) => {
    // react to state changes
});

await userStore.fetch("123");
```

### Svelte

```svelte
<script lang="ts">
    import { userStore } from "./user-store.ts";
    userStore.fetch(userId);
</script>

{#if $userStore.isFetching}
    <Spinner />
{:else if $userStore.lastFetchError}
    <Error error={$userStore.lastFetchError} />
{:else if $userStore.data}
    <UserCard user={$userStore.data} />
{/if}
```

### Abortable

```typescript
const searchStore = createFetchStore(
    async (q: string, signal: AbortSignal) => {
        const r = await fetch(`/api/search?q=${q}`, { signal });
        return (await r.json()) as Result[];
    },
    null,
    { abortable: true }
);

searchStore.fetch("h");      // aborted
searchStore.fetch("he");     // aborted
searchStore.fetch("hello");  // completes
```

### Deduplication

```typescript
const store = createFetchStore(worker, null, { dedupeInflight: true });

const a = store.fetch("x");
const b = store.fetch("x");
a === b; // true — one network call
```

### Cached / polled reads

```typescript
// fire only if no successful fetch yet, or more than 60s old
await store.fetchOnce("123", 60_000);

// poll every 5s, silent (no isFetching flicker)
const stop = store.fetchRecursive("123", 5_000);
// ...later
stop();
```

### Streaming (SSE)

```typescript
import { createFetchStreamStore } from "@marianmeres/fetch-store";

const feed = createFetchStreamStore<Message>((emit, url: string) => {
    const es = new EventSource(url);
    es.onmessage = (e) => emit("data", JSON.parse(e.data));
    es.onerror = (e) => emit("error", e);
    return () => { es.close(); emit("end"); };
});

const stop = feed.fetchStream(["/api/events"]);
```

## Features

- Reactive state: `data`, `isFetching`, `lastFetchError`, `successCounter`, timestamps
- `fetchSilent` — background refresh without loading indicator
- `fetchOnce` — TTL-cached fetch that joins any in-flight request
- `fetchRecursive` — polling with cancel
- `abortable` — automatic `AbortController` per call
- `dedupeInflight` — concurrent calls share one promise
- `dataFactory` — custom merge/transform strategies
- `createFetchStreamStore` — push-based sources (SSE, WebSocket, generators)

## API

See [API.md](API.md) for the complete API reference.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
