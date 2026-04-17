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

const DEFAULT_OPTIONS = {} satisfies Partial<FetchStreamStoreOptions<unknown>>;

/**
 * Creates a reactive store for handling streaming data sources like SSE, WebSocket,
 * or any push-based data pattern.
 *
 * @template T - The type of data the store will hold
 * @template A - The argument tuple accepted by the stream worker (after `emit`)
 * @param fetchStreamWorker - Worker function that receives an emit callback for sending events.
 *   The emit callback receives data of type T or Error. Should return a cleanup/abort function,
 *   or void if no cleanup is needed.
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
 *   return () => { eventSource.close(); emit("end"); };
 * });
 *
 * const stop = sseStore.fetchStream(["/api/events"]);
 * // Later: stop() to close the connection
 * ```
 */
export const createFetchStreamStore = <T, A extends unknown[] = unknown[]>(
	fetchStreamWorker: (
		emit: (eventName: FetchStreamEventName, eventData?: T | Error) => void,
		...args: A
	) => (() => void) | void,
	initial: T | null = null,
	options: Partial<FetchStreamStoreOptions<T>> = {}
): FetchStreamStore<T, A> => {
	const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
	const dataFactory = options.dataFactory;

	// Factory for data transformation strategies (merge / deepmerge / set / ...)
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

	const { subscribe, get } = createDerivedStore(
		[_dataStore, _metaStore] as const,
		([data, meta]): FetchStreamStoreValue<T> => ({ data, ...meta })
	);

	// Tracks the cancel fn of the currently running stream so reset() can stop it.
	let _currentCancel: (() => void) | null = null;

	const fetchStream = (
		fetchArgs: unknown = [],
		recursiveDelayMs: number | (() => number) = 0
	): (() => void) => {
		let _timer: ReturnType<typeof setTimeout> | undefined;
		let _aborted = false;
		let _abortFn: (() => void) | void;

		const cancel = (): void => {
			if (_aborted) return;
			_aborted = true;
			if (_timer) clearTimeout(_timer);
			if (typeof _abortFn === "function") {
				try {
					_abortFn();
				} catch {
					// cleanup should not throw, but guard anyway
				}
			}
			if (_currentCancel === cancel) _currentCancel = null;
		};

		const normalizedArgs = (
			Array.isArray(fetchArgs) ? fetchArgs : [fetchArgs]
		) as A;

		const runOnce = (): void => {
			if (_aborted) return;

			_metaStore.set({
				..._metaStore.get(),
				isFetching: true,
				lastFetchStart: new Date(),
				lastFetchEnd: null,
				lastFetchError: null,
			});

			try {
				_abortFn = fetchStreamWorker(
					(
						eventName: FetchStreamEventName,
						eventData?: T | Error
					): void => {
						// Ignore any events after cancellation.
						if (_aborted) return;

						if (
							eventName === "data" &&
							eventData !== undefined &&
							!(eventData instanceof Error)
						) {
							// A data event implicitly clears a prior error.
							if (_metaStore.get().lastFetchError) {
								_metaStore.set({
									..._metaStore.get(),
									lastFetchError: null,
								});
							}
							_dataStore.set(
								_createData(eventData as T, _dataStore.get())
							);
						} else if (eventName === "error") {
							const error =
								eventData instanceof Error
									? eventData
									: new Error(String(eventData));
							_metaStore.set({
								..._metaStore.get(),
								lastFetchError: error,
							});
						} else if (eventName === "end") {
							_metaStore.set({
								..._metaStore.get(),
								isFetching: false,
								lastFetchEnd: new Date(),
							});

							const delay =
								typeof recursiveDelayMs === "function"
									? recursiveDelayMs()
									: recursiveDelayMs;

							if (delay > 0 && !_aborted) {
								if (_timer) clearTimeout(_timer);
								_timer = setTimeout(() => {
									if (!_aborted) runOnce();
								}, delay);
							}
						}
					},
					...normalizedArgs
				);
			} catch (e) {
				// Worker threw synchronously — reset isFetching and store the error.
				const error = e instanceof Error ? e : new Error(String(e));
				_metaStore.set({
					..._metaStore.get(),
					isFetching: false,
					lastFetchEnd: new Date(),
					lastFetchError: error,
				});
			}
		};

		// If a previous stream was still running, cancel it before starting a new one.
		if (_currentCancel) _currentCancel();
		_currentCancel = cancel;

		runOnce();
		return cancel;
	};

	const reset = (): void => {
		// Stop any running stream (calls the worker's cleanup function).
		if (_currentCancel) {
			const c = _currentCancel;
			_currentCancel = null;
			c();
		}
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
