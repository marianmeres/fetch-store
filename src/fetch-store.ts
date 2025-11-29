import { createDerivedStore, createStore } from "@marianmeres/store";

// Re-export types for backwards compatibility
export type {
	DataFactory,
	FetchStore,
	FetchStoreMeta,
	FetchStoreOptions,
	FetchStoreValue,
} from "./types.ts";

// Re-export stream store for backwards compatibility
export { createFetchStreamStore } from "./fetch-stream-store.ts";

import type {
	FetchStore,
	FetchStoreMeta,
	FetchStoreOptions,
	FetchStoreValue,
} from "./types.ts";

const DEFAULT_OPTIONS: Partial<FetchStoreOptions<unknown>> = {
	fetchOnceDefaultThresholdMs: 300_000, // 5 minutes
	dedupeInflight: false,
	abortable: false,
};

/**
 * Creates a reactive store for managing async fetch operations with built-in
 * state tracking for loading, errors, and success counts.
 *
 * @template T - The type of data the store will hold
 * @param fetchWorker - Async function that performs the actual fetch operation.
 *   Must return data of type T. When `abortable: true`, receives AbortSignal as the last argument.
 * @param initial - Initial data value (default: null)
 * @param options - Configuration options including optional dataFactory for merge strategies
 * @returns A FetchStore instance with reactive subscription and fetch methods
 *
 * @example
 * ```ts
 * const userStore = createFetchStore(
 *   async (userId: string) => {
 *     const res = await fetch(`/api/users/${userId}`);
 *     return res.json() as Promise<User>;
 *   },
 *   null,
 *   { fetchOnceDefaultThresholdMs: 60000 }
 * );
 *
 * userStore.subscribe(({ data, isFetching, lastFetchError }) => {
 *   console.log({ data, isFetching, lastFetchError });
 * });
 *
 * await userStore.fetch("123");
 * ```
 */
export const createFetchStore = <T>(
	fetchWorker: (...args: unknown[]) => Promise<T>,
	initial: T | null = null,
	options: Partial<FetchStoreOptions<T>> = {}
): FetchStore<T> => {
	const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
	const { fetchOnceDefaultThresholdMs, dedupeInflight, abortable } = mergedOptions;
	const dataFactory = options.dataFactory;

	// Use factory for data transformation strategies (merge/deepmerge/set/...)
	const _createData = (data: T, old: T | null): T =>
		typeof dataFactory === "function" ? dataFactory(data, old ?? undefined) : data;

	const _createMetaObj = (): FetchStoreMeta => ({
		isFetching: false,
		lastFetchStart: null,
		lastFetchEnd: null,
		lastFetchError: null,
		successCounter: 0,
		lastFetchSilentError: null,
	});

	const _dataStore = createStore<T | null>(initial);
	const _metaStore = createStore<FetchStoreMeta>(_createMetaObj());

	const { subscribe, get } = createDerivedStore<FetchStoreValue<T>>(
		[_dataStore, _metaStore],
		([data, meta]) => ({ data, ...meta })
	);

	// In-flight promise for deduplication
	let _inflightPromise: Promise<T | null> | null = null;
	let _inflightSilentPromise: Promise<T | null> | null = null;

	// AbortController for cancellation
	let _abortController: AbortController | null = null;
	let _abortControllerSilent: AbortController | null = null;

	const abort = (): void => {
		if (_abortController) {
			_abortController.abort();
			_abortController = null;
		}
		if (_abortControllerSilent) {
			_abortControllerSilent.abort();
			_abortControllerSilent = null;
		}
	};

	const fetch = (...rest: unknown[]): Promise<T | null> => {
		// If deduplication is enabled and there's an in-flight request, return it
		if (dedupeInflight && _inflightPromise) {
			return _inflightPromise;
		}

		// If abortable, abort any previous request and create new controller
		if (abortable) {
			if (_abortController) {
				_abortController.abort();
			}
			_abortController = new AbortController();
		}

		const currentController = _abortController;

		const doFetch = async (): Promise<T | null> => {
			_metaStore.set({
				..._metaStore.get(),
				isFetching: true,
				lastFetchStart: new Date(),
				lastFetchEnd: null,
				lastFetchError: null,
			});

			let error: Error | null = null;
			let newSuccessCounter = _metaStore.get().successCounter;

			try {
				// Pass signal as the last argument if abortable
				const args = abortable && currentController
					? [...rest, currentController.signal]
					: rest;
				_dataStore.set(_createData(await fetchWorker(...args), _dataStore.get()));
				newSuccessCounter++;
			} catch (e) {
				// Don't treat abort as an error that should be stored
				if (e instanceof DOMException && e.name === "AbortError") {
					// Request was aborted, don't update meta
					return _dataStore.get();
				}
				error = e instanceof Error ? e : new Error(String(e));
			}

			_metaStore.set({
				..._metaStore.get(),
				isFetching: false,
				lastFetchEnd: new Date(),
				lastFetchError: error,
				successCounter: newSuccessCounter,
			});

			// Return fetched (or last) data (for non-subscribe consumption)
			return _metaStore.get().lastFetchError ? null : _dataStore.get();
		};

		if (dedupeInflight) {
			_inflightPromise = doFetch().finally(() => {
				_inflightPromise = null;
				if (currentController === _abortController) {
					_abortController = null;
				}
			});
			return _inflightPromise;
		}

		return doFetch().finally(() => {
			if (currentController === _abortController) {
				_abortController = null;
			}
		});
	};

	// Similar to fetch, but does not touch meta.isFetching, allowing data updates
	// without triggering loading spinners
	const fetchSilent = (...rest: unknown[]): Promise<T | null> => {
		// If deduplication is enabled and there's an in-flight request, return it
		if (dedupeInflight && _inflightSilentPromise) {
			return _inflightSilentPromise;
		}

		// If abortable, abort any previous silent request and create new controller
		if (abortable) {
			if (_abortControllerSilent) {
				_abortControllerSilent.abort();
			}
			_abortControllerSilent = new AbortController();
		}

		const currentController = _abortControllerSilent;

		const doFetchSilent = async (): Promise<T | null> => {
			const currentMeta = _metaStore.get();
			if (currentMeta.lastFetchSilentError) {
				_metaStore.set({ ...currentMeta, lastFetchSilentError: null });
			}

			let error: Error | null = null;
			try {
				// Pass signal as the last argument if abortable
				const args = abortable && currentController
					? [...rest, currentController.signal]
					: rest;
				_dataStore.set(_createData(await fetchWorker(...args), _dataStore.get()));
			} catch (e) {
				// Don't treat abort as an error that should be stored
				if (e instanceof DOMException && e.name === "AbortError") {
					return _dataStore.get();
				}
				error = e instanceof Error ? e : new Error(String(e));
			}

			if (error) {
				_metaStore.set({ ..._metaStore.get(), lastFetchSilentError: error });
			}

			// Return fetched (or last) data (for non-subscribe consumption)
			return _metaStore.get().lastFetchSilentError ? null : _dataStore.get();
		};

		if (dedupeInflight) {
			_inflightSilentPromise = doFetchSilent().finally(() => {
				_inflightSilentPromise = null;
				if (currentController === _abortControllerSilent) {
					_abortControllerSilent = null;
				}
			});
			return _inflightSilentPromise;
		}

		return doFetchSilent().finally(() => {
			if (currentController === _abortControllerSilent) {
				_abortControllerSilent = null;
			}
		});
	};

	// Sets internal timestamps to now, tricking fetchOnce into thinking data was just fetched.
	// Useful for external cache invalidation.
	const touch = (data?: T): void => {
		if (data !== undefined) {
			_dataStore.set(data);
		}
		const currentMeta = _metaStore.get();
		const now = new Date();
		_metaStore.set({
			...currentMeta,
			lastFetchStart: now,
			lastFetchEnd: now,
			successCounter: currentMeta.successCounter + 1,
		});
	};

	const _fetchOnce = async (
		isSilent: boolean,
		fetchArgs: unknown[] = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T | null> => {
		const { successCounter, isFetching, lastFetchStart } = _metaStore.get();

		const args = Array.isArray(fetchArgs) ? fetchArgs : [fetchArgs];

		if (!successCounter && !isFetching) {
			return isSilent ? await fetchSilent(...args) : await fetch(...args);
		}

		// Expired threshold?
		if (
			thresholdMs &&
			!isFetching &&
			lastFetchStart &&
			Date.now() - lastFetchStart.valueOf() > thresholdMs
		) {
			return isSilent ? await fetchSilent(...args) : await fetch(...args);
		}

		return _dataStore.get();
	};

	// Use falsy threshold (0) to skip threshold check
	const fetchOnce = async (
		fetchArgs: unknown[] = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T | null> => {
		return await _fetchOnce(false, fetchArgs, thresholdMs);
	};

	const fetchOnceSilent = async (
		fetchArgs: unknown[] = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T | null> => {
		return await _fetchOnce(true, fetchArgs, thresholdMs);
	};

	// Recursive polling (whether it's "long" or "short" polling depends on the server)
	const fetchRecursive = (
		fetchArgs: unknown[] = [],
		delayMs: number | (() => number) = 500
	): (() => void) => {
		let _timer: ReturnType<typeof setTimeout> | undefined;
		let _aborted = false;

		const _fetchRecursive = (
			args: unknown[] = [],
			delay: number | (() => number) = 500
		): (() => void) => {
			const normalizedArgs = Array.isArray(args) ? args : [args];
			const resolvedDelay = typeof delay === "function" ? delay() : delay;

			fetchSilent(...normalizedArgs).then(() => {
				if (_timer) clearTimeout(_timer);
				if (resolvedDelay > 0 && !_aborted) {
					_timer = setTimeout(
						() => !_aborted && _fetchRecursive(normalizedArgs, delay),
						resolvedDelay as number
					);
				}
			});

			// Return a "cancel" (or "stop") control fn
			return () => {
				if (_timer) clearTimeout(_timer);
				_aborted = true;
			};
		};

		return _fetchRecursive(fetchArgs, delayMs);
	};

	// Resets the store to initial state; useful for cache invalidation
	const reset = (): void => {
		abort();
		_dataStore.set(initial);
		_metaStore.set(_createMetaObj());
		_inflightPromise = null;
		_inflightSilentPromise = null;
		if (typeof mergedOptions.onReset === "function") mergedOptions.onReset();
	};

	const resetError = (): void => {
		_metaStore.update((old) => ({ ...old, lastFetchError: null }));
	};

	return {
		subscribe,
		get,
		fetch,
		fetchSilent,
		fetchOnce,
		fetchOnceSilent,
		fetchRecursive,
		reset,
		resetError,
		getInternalDataStore: () => _dataStore,
		touch,
		abort,
		// Expose raw worker as well
		fetchWorker,
	};
};
