export type { FetchStreamEventEmitFn, FetchStreamEventName, FetchStreamStore, FetchStreamStoreMeta, FetchStreamStoreOptions, FetchStreamStoreValue, } from "./types.js";
import type { DataFactory, FetchStreamEventName, FetchStreamStore, FetchStreamStoreOptions, FetchStreamStoreValue } from "./types.js";
/**
 * Creates a reactive store for handling streaming data sources like SSE, WebSocket,
 * or any push-based data pattern.
 *
 * @template T - The type of data the store will hold
 * @param fetchStreamWorker - Worker function that receives an emit callback for sending events.
 *   Should return a cleanup/abort function, or void if no cleanup is needed.
 * @param initial - Initial data value (default: null)
 * @param dataFactory - Optional factory function to transform received data
 * @param options - Configuration options
 * @returns A FetchStreamStore instance with reactive subscription and stream control
 *
 * @example
 * ```ts
 * const sseStore = createFetchStreamStore((emit, url) => {
 *   const eventSource = new EventSource(url);
 *   eventSource.onmessage = (e) => emit("data", JSON.parse(e.data));
 *   eventSource.onerror = (e) => emit("error", e);
 *   return () => eventSource.close();
 * });
 *
 * const stop = sseStore.fetchStream(["/api/events"]);
 * // Later: stop() to close the connection
 * ```
 */
export declare const createFetchStreamStore: <T>(fetchStreamWorker: (emit: (eventName: FetchStreamEventName, eventData?: unknown) => void, ...args: unknown[]) => (() => void) | void, initial?: T | null, dataFactory?: DataFactory<T> | null, options?: Partial<FetchStreamStoreOptions<T>>) => FetchStreamStore<FetchStreamStoreValue<T>, T>;
