export type { DataFactory, FetchStore, FetchStoreMeta, FetchStoreOptions, FetchStoreValue, } from "./types.js";
export { createFetchStreamStore } from "./fetch-stream-store.js";
import type { DataFactory, FetchStore, FetchStoreOptions, FetchStoreValue } from "./types.js";
/**
 * Creates a reactive store for managing async fetch operations with built-in
 * state tracking for loading, errors, and success counts.
 *
 * @template T - The type of data the store will hold
 * @param fetchWorker - Async function that performs the actual fetch operation.
 *   When `abortable: true`, receives AbortSignal as the last argument.
 * @param initial - Initial data value (default: null)
 * @param dataFactory - Optional factory function to transform fetched data
 * @param options - Configuration options
 * @returns A FetchStore instance with reactive subscription and fetch methods
 *
 * @example
 * ```ts
 * const userStore = createFetchStore(
 *   async (userId) => fetch(`/api/users/${userId}`).then(r => r.json()),
 *   null,
 *   null,
 *   { fetchOnceDefaultThresholdMs: 60000 }
 * );
 *
 * userStore.subscribe(({ data, isFetching, lastFetchError }) => {
 *   console.log({ data, isFetching, lastFetchError });
 * });
 *
 * await userStore.fetch(123);
 * ```
 */
export declare const createFetchStore: <T>(fetchWorker: (...args: unknown[]) => Promise<unknown>, initial?: T | null, dataFactory?: DataFactory<T> | null, options?: Partial<FetchStoreOptions<T>>) => FetchStore<FetchStoreValue<T>, T>;
