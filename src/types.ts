import type { CreateStoreOptions, StoreLike, StoreReadable } from "@marianmeres/store";

/**
 * Factory function that transforms fetched data, useful for merge strategies.
 * Receives the new data and optionally the previous value.
 *
 * @template T - The data type
 * @param data - New data from the fetch worker
 * @param old - Previous data value (optional, for merge strategies)
 * @returns Transformed data of type T
 */
export type DataFactory<T> = (data: T, old?: T) => T;

/**
 * Base metadata interface shared by all fetch stores.
 * Contains common fields for tracking fetch operation state.
 */
export interface FetchMetaBase {
	/** Whether a `fetch` operation is currently in progress (silent fetches do not flip this) */
	isFetching: boolean;
	/** Timestamp when the last fetch operation started */
	lastFetchStart: Date | null;
	/** Timestamp when the last fetch operation completed */
	lastFetchEnd: Date | null;
	/** Error from the last `fetch` operation, if any */
	lastFetchError: Error | null;
}

/**
 * Extended metadata for FetchStore including success tracking and silent fetch errors.
 */
export interface FetchStoreMeta extends FetchMetaBase {
	/** Count of successful fetch operations (incremented on each success, silent or not) */
	successCounter: number;
	/** Error from the last silent fetch operation, if any */
	lastFetchSilentError: Error | null;
}

/**
 * Metadata for FetchStreamStore (uses base meta fields only).
 */
export interface FetchStreamStoreMeta extends FetchMetaBase {}

/**
 * Combined value type for FetchStore containing both data and metadata.
 * This is the shape of the value returned by `get()` and passed to subscribers.
 *
 * @template T - The data type stored in the fetch store
 */
export interface FetchStoreValue<T> extends FetchStoreMeta {
	/** The fetched data (null before first successful fetch or after reset) */
	data: T | null;
}

/**
 * Combined value type for FetchStreamStore containing both data and metadata.
 * This is the shape of the value returned by `get()` and passed to subscribers.
 *
 * @template T - The data type stored in the stream store
 */
export interface FetchStreamStoreValue<T> extends FetchStreamStoreMeta {
	/** The streamed data (null before first data or after reset) */
	data: T | null;
}

/**
 * Main FetchStore interface providing reactive state management for async fetch operations.
 * Extends StoreReadable for Svelte-compatible subscribe functionality.
 *
 * @template T - The data type stored in the fetch store
 * @template A - The argument tuple accepted by the fetch worker
 */
export interface FetchStore<T, A extends unknown[] = unknown[]>
	extends StoreReadable<FetchStoreValue<T>> {
	/**
	 * Executes the fetch worker and updates store state.
	 * Sets `isFetching` to true during the operation.
	 * @param args - Arguments passed to the fetch worker
	 * @returns Promise resolving to fetched data or null on error
	 */
	fetch: (...args: A) => Promise<T | null>;

	/**
	 * Like `fetch`, but does not set `isFetching` to true.
	 * Useful for background refreshes without showing loading spinners.
	 * Still updates `lastFetchStart`, `lastFetchEnd`, and `successCounter`.
	 * @param args - Arguments passed to the fetch worker
	 * @returns Promise resolving to fetched data or null on error
	 */
	fetchSilent: (...args: A) => Promise<T | null>;

	/**
	 * Fetches data only if not already fetched or if the threshold has passed.
	 * If a fetch (silent or not) is currently in-flight, joins it instead of firing a new one.
	 * @param args - Arguments passed to the fetch worker (pass as array or single value)
	 * @param thresholdMs - Time in ms before re-fetching is allowed (default from options).
	 *   Use `0` to skip the threshold check and rely only on `successCounter`.
	 * @returns Promise resolving to fetched data or null on error
	 */
	fetchOnce: (args?: A | unknown, thresholdMs?: number) => Promise<T | null>;

	/**
	 * Like `fetchOnce`, but uses silent fetching (no `isFetching` state change).
	 * @param args - Arguments passed to the fetch worker
	 * @param thresholdMs - Time in ms before re-fetching is allowed (default from options)
	 * @returns Promise resolving to fetched data or null on error
	 */
	fetchOnceSilent: (args?: A | unknown, thresholdMs?: number) => Promise<T | null>;

	/**
	 * Starts recursive polling.
	 * Each fetch waits for the previous one to complete before scheduling the next.
	 * By default uses `fetchSilent` so the UI does not flash loading state between polls.
	 * @param args - Arguments passed to the fetch worker
	 * @param delayMs - Delay between fetches in ms, or function returning delay (returning `0` stops)
	 * @param options - Optional overrides. `silent: false` uses `fetch` instead of `fetchSilent`.
	 * @returns Cancel function to stop the polling
	 */
	fetchRecursive: (
		args?: A | unknown,
		delayMs?: number | (() => number),
		options?: { silent?: boolean }
	) => () => void;

	/**
	 * Resets the store to its initial state, clearing all data and metadata.
	 * Aborts in-flight requests when `abortable: true`.
	 * Also bumps an internal generation token so that any non-abortable in-flight
	 * request (or a worker that ignores the abort signal) cannot overwrite the
	 * reset state after it resolves.
	 */
	reset: () => void;

	/**
	 * Clears only the `lastFetchError` and `lastFetchSilentError` fields
	 * without resetting other state.
	 */
	resetError: () => void;

	/**
	 * Returns the internal data store for direct manipulation.
	 * Use with caution: bypasses `dataFactory` and metadata tracking.
	 */
	getInternalDataStore: () => StoreLike<T | null>;

	/**
	 * The raw fetch worker function passed to createFetchStore.
	 */
	fetchWorker: (...args: A) => Promise<T>;

	/**
	 * Updates internal timestamps to trick `fetchOnce` into thinking data was just fetched.
	 * Optionally sets new data. Useful for external cache invalidation.
	 *
	 * Note: increments `successCounter` — consumers watching the counter should not
	 * assume every increment corresponds to a network success.
	 * @param data - Optional new data to set
	 */
	touch: (data?: T) => void;

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
 * @template T - The data type carried by "data" events
 * @param eventName - The type of event being emitted
 * @param eventData - The event payload (data chunk or error)
 */
export type FetchStreamEventEmitFn<T = unknown> = (
	eventName: FetchStreamEventName,
	eventData?: T | Error
) => void;

/**
 * FetchStreamStore interface for handling streaming data sources.
 * Useful for SSE, WebSocket, or any streaming data pattern.
 *
 * @template T - The data type stored in the stream store
 * @template A - The argument tuple accepted by the fetch-stream worker (after `emit`)
 */
export interface FetchStreamStore<T, A extends unknown[] = unknown[]>
	extends StoreReadable<FetchStreamStoreValue<T>> {
	/**
	 * Starts the stream and optionally restarts it after completion.
	 * @param args - Arguments passed to the stream worker
	 * @param recursiveDelayMs - Delay before restarting stream after "end" event (0 = no restart)
	 * @returns Cancel function to stop the stream
	 */
	fetchStream: (
		args?: A | unknown,
		recursiveDelayMs?: number | (() => number)
	) => () => void;

	/**
	 * The raw stream worker function passed to createFetchStreamStore.
	 */
	fetchStreamWorker: (
		emit: FetchStreamEventEmitFn<T>,
		...args: A
	) => (() => void) | void;

	/**
	 * Resets the store to its initial state, clearing all data and metadata.
	 * Also stops any currently running stream (calls the worker's cleanup function).
	 */
	reset: () => void;

	/**
	 * Clears only the `lastFetchError` field without resetting other state.
	 */
	resetError: () => void;

	/**
	 * Returns the internal data store for direct manipulation.
	 * Use with caution: bypasses `dataFactory`.
	 */
	getInternalDataStore: () => StoreLike<T | null>;
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
	/** Optional factory function to transform fetched data (useful for merge strategies) */
	dataFactory: DataFactory<T>;
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
	/** Optional factory function to transform streamed data (useful for merge strategies) */
	dataFactory: DataFactory<T>;
}
