import type { CreateStoreOptions, StoreLike, StoreReadable } from "@marianmeres/store";
/**
 * Factory function that transforms raw fetched data into the store's data type.
 * Receives the raw data and optionally the previous value for merge strategies.
 *
 * @template T - The target data type
 * @param raw - Raw data from the fetch worker
 * @param old - Previous data value (optional, for merge strategies)
 * @returns Transformed data of type T
 */
export type DataFactory<T> = (raw: any, old?: T) => T;
/**
 * Base metadata interface shared by all fetch stores.
 * Contains common fields for tracking fetch operation state.
 */
export interface FetchMetaBase {
    /** Whether a fetch operation is currently in progress */
    isFetching: boolean;
    /** Timestamp when the last fetch operation started */
    lastFetchStart: Date | null;
    /** Timestamp when the last fetch operation completed */
    lastFetchEnd: Date | null;
    /** Error from the last fetch operation, if any */
    lastFetchError: Error | null;
}
/**
 * Extended metadata for FetchStore including success tracking and silent fetch errors.
 */
export interface FetchStoreMeta extends FetchMetaBase {
    /** Count of successful fetch operations (incremented on each success) */
    successCounter: number;
    /** Error from the last silent fetch operation, if any */
    lastFetchSilentError: Error | null;
}
/**
 * Metadata for FetchStreamStore (uses base meta fields only).
 */
export interface FetchStreamStoreMeta extends FetchMetaBase {
}
/**
 * Combined value type for FetchStore containing both data and metadata.
 * This is the shape of the value returned by `get()` and passed to subscribers.
 *
 * @template T - The data type stored in the fetch store
 */
export interface FetchStoreValue<T> extends FetchStoreMeta {
    /** The fetched data */
    data: T;
}
/**
 * Combined value type for FetchStreamStore containing both data and metadata.
 * This is the shape of the value returned by `get()` and passed to subscribers.
 *
 * @template T - The data type stored in the stream store
 */
export interface FetchStreamStoreValue<T> extends FetchStreamStoreMeta {
    /** The streamed data */
    data: T;
}
/**
 * Main FetchStore interface providing reactive state management for async fetch operations.
 * Extends StoreReadable for Svelte-compatible subscribe functionality.
 *
 * @template T - Either the data type or FetchStoreValue<DataType>
 * @template V - Inferred data type (for backwards compatibility)
 */
export interface FetchStore<T, V = T extends FetchStoreValue<infer D> ? D : T> extends StoreReadable<T extends FetchStoreValue<unknown> ? T : FetchStoreValue<V>> {
    /**
     * Executes the fetch worker and updates store state.
     * Sets `isFetching` to true during the operation.
     * @param args - Arguments passed to the fetch worker
     * @returns Promise resolving to fetched data or null on error
     */
    fetch: (...args: unknown[]) => Promise<V | null>;
    /**
     * Like `fetch`, but does not set `isFetching` to true.
     * Useful for background refreshes without showing loading spinners.
     * @param args - Arguments passed to the fetch worker
     * @returns Promise resolving to fetched data or null on error
     */
    fetchSilent: (...args: unknown[]) => Promise<V | null>;
    /**
     * Fetches data only if not already fetched or if the threshold has passed.
     * Useful for caching scenarios where you want to avoid redundant fetches.
     * @param args - Arguments passed to the fetch worker
     * @param thresholdMs - Time in ms before re-fetching is allowed (default from options)
     * @returns Promise resolving to fetched data or null on error
     */
    fetchOnce: (args?: unknown[], thresholdMs?: number) => Promise<V | null>;
    /**
     * Like `fetchOnce`, but uses silent fetching (no `isFetching` state change).
     * @param args - Arguments passed to the fetch worker
     * @param thresholdMs - Time in ms before re-fetching is allowed (default from options)
     * @returns Promise resolving to fetched data or null on error
     */
    fetchOnceSilent: (args?: unknown[], thresholdMs?: number) => Promise<V | null>;
    /**
     * Starts recursive polling using silent fetch.
     * Each fetch waits for the previous one to complete before scheduling the next.
     * @param args - Arguments passed to the fetch worker
     * @param delayMs - Delay between fetches in ms, or function returning delay
     * @returns Cancel function to stop the polling
     */
    fetchRecursive: (args?: unknown[], delayMs?: number | (() => number)) => () => void;
    /**
     * Resets the store to its initial state, clearing all data and metadata.
     * Also aborts any in-flight requests if abortable is enabled.
     */
    reset: () => void;
    /**
     * Clears only the `lastFetchError` field without resetting other state.
     */
    resetError: () => void;
    /**
     * Returns the internal data store for direct manipulation.
     * Use with caution as it bypasses the fetch store's state management.
     */
    getInternalDataStore: () => StoreLike<V>;
    /**
     * The raw fetch worker function passed to createFetchStore.
     */
    fetchWorker: (...args: unknown[]) => Promise<unknown>;
    /**
     * Updates internal timestamps to trick `fetchOnce` into thinking data was just fetched.
     * Optionally sets new data. Useful for external cache invalidation.
     * @param data - Optional new data to set
     */
    touch: (data?: V) => void;
    /**
     * Aborts any in-flight fetch requests.
     * Only effective when `abortable: true` option is set.
     */
    abort: () => void;
}
/**
 * Event names that can be emitted by the stream worker.
 * - `data`: New data chunk received
 * - `error`: An error occurred
 * - `end`: Stream has completed
 */
export type FetchStreamEventName = "data" | "error" | "end";
/**
 * Emit function passed to the stream worker for sending events.
 * @param eventName - The type of event being emitted
 * @param eventData - The event payload (data chunk or error)
 */
export type FetchStreamEventEmitFn = (eventName: FetchStreamEventName, eventData?: unknown) => void;
/**
 * FetchStreamStore interface for handling streaming data sources.
 * Useful for SSE, WebSocket, or any streaming data pattern.
 *
 * @template T - Either the data type or FetchStreamStoreValue<DataType>
 * @template V - Inferred data type (for backwards compatibility)
 */
export interface FetchStreamStore<T, V = T extends FetchStreamStoreValue<infer D> ? D : T> extends StoreReadable<T extends FetchStreamStoreValue<unknown> ? T : FetchStreamStoreValue<V>> {
    /**
     * Starts the stream and optionally restarts it after completion.
     * @param args - Arguments passed to the stream worker
     * @param recursiveDelayMs - Delay before restarting stream after "end" event (0 = no restart)
     * @returns Cancel function to stop the stream
     */
    fetchStream: (args?: unknown[], recursiveDelayMs?: number | (() => number)) => () => void;
    /**
     * The raw stream worker function passed to createFetchStreamStore.
     */
    fetchStreamWorker: (emit: FetchStreamEventEmitFn, ...args: unknown[]) => unknown;
    /**
     * Resets the store to its initial state, clearing all data and metadata.
     */
    reset: () => void;
    /**
     * Clears only the `lastFetchError` field without resetting other state.
     */
    resetError: () => void;
    /**
     * Returns the internal data store for direct manipulation.
     * Use with caution as it bypasses the stream store's state management.
     */
    getInternalDataStore: () => StoreLike<V>;
}
/**
 * Configuration options for createFetchStore.
 * Extends CreateStoreOptions from @marianmeres/store.
 *
 * @template T - The data type stored in the fetch store
 */
export interface FetchStoreOptions<T> extends CreateStoreOptions<T> {
    /** Default threshold in ms for fetchOnce before allowing re-fetch (default: 300000 = 5 min) */
    fetchOnceDefaultThresholdMs: number;
    /** Callback invoked when reset() is called */
    onReset: () => void;
    /** If true, subsequent fetch() calls while one is in-flight return the existing promise */
    dedupeInflight: boolean;
    /** If true, creates AbortController for each fetch, passing signal to worker and aborting previous requests */
    abortable: boolean;
}
/**
 * Configuration options for createFetchStreamStore.
 * Extends CreateStoreOptions from @marianmeres/store.
 *
 * @template T - The data type stored in the stream store
 */
export interface FetchStreamStoreOptions<T> extends CreateStoreOptions<T> {
    /** Callback invoked when reset() is called */
    onReset: () => void;
}
