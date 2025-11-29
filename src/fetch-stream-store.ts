import { createDerivedStore, createStore } from "@marianmeres/store";

// Re-export types for backwards compatibility
export type {
	FetchStreamEventEmitFn,
	FetchStreamEventName,
	FetchStreamStore,
	FetchStreamStoreMeta,
	FetchStreamStoreOptions,
	FetchStreamStoreValue,
} from "./types.ts";

import type {
	FetchStreamEventName,
	FetchStreamStore,
	FetchStreamStoreMeta,
	FetchStreamStoreOptions,
	FetchStreamStoreValue,
} from "./types.ts";

const DEFAULT_OPTIONS: Partial<FetchStreamStoreOptions<unknown>> = {};

/**
 * Creates a reactive store for handling streaming data sources like SSE, WebSocket,
 * or any push-based data pattern.
 *
 * @template T - The type of data the store will hold
 * @param fetchStreamWorker - Worker function that receives an emit callback for sending events.
 *   The emit callback receives data of type T. Should return a cleanup/abort function, or void
 *   if no cleanup is needed.
 * @param initial - Initial data value (default: null)
 * @param options - Configuration options including optional dataFactory for merge strategies
 * @returns A FetchStreamStore instance with reactive subscription and stream control
 *
 * @example
 * ```ts
 * const sseStore = createFetchStreamStore<Message>((emit, url) => {
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
export const createFetchStreamStore = <T>(
	fetchStreamWorker: (
		emit: (eventName: FetchStreamEventName, eventData?: T | Error) => void,
		...args: unknown[]
	) => (() => void) | void,
	initial: T | null = null,
	options: Partial<FetchStreamStoreOptions<T>> = {}
): FetchStreamStore<T> => {
	const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
	const dataFactory = options.dataFactory;

	// Use factory for data transformation strategies (merge/deepmerge/set/...)
	const _createData = (data: T, old: T | null): T =>
		typeof dataFactory === "function" ? dataFactory(data, old ?? undefined) : data;

	const _createMetaObj = (): FetchStreamStoreMeta => ({
		isFetching: false,
		lastFetchStart: null,
		lastFetchEnd: null,
		lastFetchError: null,
	});

	const _dataStore = createStore<T | null>(initial);
	const _metaStore = createStore<FetchStreamStoreMeta>(_createMetaObj());

	const { subscribe, get } = createDerivedStore<FetchStreamStoreValue<T>>(
		[_dataStore, _metaStore],
		([data, meta]) => ({ data, ...meta })
	);

	const fetchStream = (
		fetchArgs: unknown[] = [],
		recursiveDelayMs: number | (() => number) = 0
	): (() => void) => {
		let _timer: ReturnType<typeof setTimeout> | undefined;
		let _aborted = false;
		let _abortFn: (() => void) | void;

		// Must be hoisted so recursive calls can be cancelled properly
		let _abort = (): void => {
			if (typeof _abortFn === "function") {
				_abortFn();
			} else {
				console.warn(
					"`abort` is a noop (the fetchStreamWorker did not return a function)."
				);
			}

			if (_timer) clearTimeout(_timer);
			_aborted = true;
		};

		// Inner worker (maybe recursive)
		const _fetchStream = (
			args: unknown[] = [],
			delayMs: number | (() => number) = 0
		): (() => void) => {
			const normalizedArgs = Array.isArray(args) ? args : [args];
			const delay = typeof delayMs === "function" ? delayMs() : delayMs;

			_metaStore.set({
				..._metaStore.get(),
				isFetching: true,
				lastFetchStart: new Date(),
				lastFetchEnd: null,
				lastFetchError: null,
			});

			try {
				_abortFn = fetchStreamWorker(
					(eventName: FetchStreamEventName, eventData?: T | Error): void => {
						if (_metaStore.get().lastFetchError) {
							_metaStore.set({ ..._metaStore.get(), lastFetchError: null });
						}

						if (eventName === "data" && eventData !== undefined && !(eventData instanceof Error)) {
							_dataStore.set(_createData(eventData, _dataStore.get()));
						} else if (eventName === "error") {
							const error =
								eventData instanceof Error
									? eventData
									: new Error(String(eventData));
							_metaStore.set({ ..._metaStore.get(), lastFetchError: error });
						} else if (eventName === "end") {
							_metaStore.set({
								..._metaStore.get(),
								isFetching: false,
								lastFetchEnd: new Date(),
							});

							// Maybe recursive?
							if ((delay as number) > 0 && !_aborted) {
								if (_timer) clearTimeout(_timer);
								_timer = setTimeout(() => {
									if (!_aborted) {
										_abort = _fetchStream(normalizedArgs, delayMs);
									}
								}, delay as number);
							}
						}
					},
					...normalizedArgs
				);
			} catch (e) {
				const error = e instanceof Error ? e : new Error(String(e));
				_metaStore.set({ ..._metaStore.get(), lastFetchError: error });
			}

			return _abort;
		};

		return _fetchStream(fetchArgs, recursiveDelayMs);
	};

	const reset = (): void => {
		_dataStore.set(initial);
		_metaStore.set(_createMetaObj());
		if (typeof mergedOptions.onReset === "function") mergedOptions.onReset();
	};

	const resetError = (): void => {
		_metaStore.update((old) => ({ ...old, lastFetchError: null }));
	};

	return {
		subscribe,
		get,
		fetchStream,
		reset,
		resetError,
		getInternalDataStore: () => _dataStore,
		// Expose raw worker as well
		fetchStreamWorker,
	};
};
