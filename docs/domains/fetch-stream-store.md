# FetchStreamStore

## Overview

Push-style reactive store for streaming data sources: Server-Sent Events, WebSocket, Node streams, long-polling loops, or any generator-style source. The worker receives an `emit` callback and returns an optional cleanup function. The store converts emitted events into observable state.

## Key Files

| File | Purpose |
|------|---------|
| [src/fetch-stream-store.ts](../../src/fetch-stream-store.ts) | `createFetchStreamStore` factory |
| [src/types.ts](../../src/types.ts) | `FetchStreamStore`, `FetchStreamStoreMeta`, `FetchStreamStoreValue`, `FetchStreamEventEmitFn` |

## Data Model

```ts
interface FetchStreamStoreValue<T> {
    data: T | null;
    isFetching: boolean;
    lastFetchStart: Date | null;
    lastFetchEnd: Date | null;
    lastFetchError: Error | null;
}

type FetchStreamEventName = "data" | "error" | "end";
type FetchStreamEventEmitFn<T = unknown> =
    (eventName: FetchStreamEventName, eventData?: T | Error) => void;
```

Note: no `successCounter` or `lastFetchSilentError` — streams don't model "silent" refreshes.

## Event Semantics

| Emitted | `isFetching` | `data` | `lastFetchError` | `lastFetchEnd` |
|---------|:---:|:---:|:---:|:---:|
| `"data", value` | unchanged | `dataFactory(value, old)` | cleared | unchanged |
| `"error", err` | unchanged | unchanged | set | unchanged |
| `"end"` | `false` | unchanged | unchanged | `new Date()` |

Key rule: **`end` does not clear errors**. The common pattern `emit("error", e); emit("end")` preserves the error for subscribers.

## Business Rules

- **`fetchStream()` while one is running cancels the previous stream**. Prevents parallel zombie streams when a consumer forgets to call the returned cancel function.
- **`reset()` stops the running stream**. Unlike v3.0.x, `reset()` now invokes `_currentCancel` before wiping state.
- **Synchronous throws in the worker are caught**. `isFetching` is reset and the error is stored; the app does not crash.
- **Emits after `cancel()` are ignored**. A worker that does not honor its cleanup synchronously cannot corrupt post-cancel state.
- **`recursiveDelayMs > 0` restarts the worker** after every `emit("end")`. Use `0` (default) for single-run streams.

## Options

| Option | Default | Purpose |
|--------|---------|---------|
| `dataFactory` | — | `(data, old) => T` merge strategy for chunked streams |
| `onReset` | — | Called after `reset()` stops the stream and wipes state |

## Worker Contract

```ts
(emit, ...args) => (() => void) | void
```

- **First arg is `emit`** — do not destructure args before this.
- **Return a cleanup function** if the source needs teardown (`eventSource.close()`, `socket.close()`, `clearInterval`, etc.).
- **Cleanup must not throw** — if it does, the error is swallowed but do not rely on this.
- **Cleanup may call `emit("end")`** if you want subscribers to see the terminal state on cancel.

## Integration Points

- **Upstream**: same `@marianmeres/store` primitives as [FetchStore](./fetch-store.md).
- **Pair with**: [FetchStore](./fetch-store.md) for request/response data; a typical app uses both.
