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

const DEFAULT_OPTIONS = {
	fetchOnceDefaultThresholdMs: 300_000, // 5 minutes
	dedupeInflight: false,
	abortable: false,
} satisfies Partial<FetchStoreOptions<unknown>>;

/**
 * Creates a reactive store for managing async fetch operations with built-in
 * state tracking for loading, errors, and success counts.
 *
 * @template T - The type of data the store will hold
 * @template A - The argument tuple accepted by the fetch worker
 * @param fetchWorker - Async function that performs the actual fetch operation.
 *   When `abortable: true`, receives an `AbortSignal` as the last argument.
 * @param initial - Initial data value (default: null)
 * @param options - Configuration options including optional `dataFactory`
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
export const createFetchStore = <T, A extends unknown[] = unknown[]>(
	fetchWorker: (...args: A) => Promise<T>,
	initial: T | null = null,
	options: Partial<FetchStoreOptions<T>> = {}
): FetchStore<T, A> => {
	const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
	const { fetchOnceDefaultThresholdMs, dedupeInflight, abortable } = mergedOptions;
	const dataFactory = options.dataFactory;

	// Factory for data transformation strategies (merge / deepmerge / set / ...)
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

	const { subscribe, get } = createDerivedStore(
		[_dataStore, _metaStore] as const,
		([data, meta]): FetchStoreValue<T> => ({ data, ...meta })
	);

	// Generation token — bumped on reset(). Any in-flight fetch whose
	// generation no longer matches discards its writes.
	let _generation = 0;

	// In-flight promise tracking (always populated, independent of dedupeInflight).
	// Used internally by fetchOnce/fetchOnceSilent to join an existing request.
	let _inflightPromise: Promise<T | null> | null = null;
	let _inflightSilentPromise: Promise<T | null> | null = null;

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

	const _isAbortError = (e: unknown): boolean =>
		e instanceof DOMException && e.name === "AbortError";

	const fetch = (...rest: A): Promise<T | null> => {
		if (dedupeInflight && _inflightPromise) return _inflightPromise;

		if (abortable) {
			if (_abortController) _abortController.abort();
			_abortController = new AbortController();
		}

		const myController = _abortController;
		const myGeneration = _generation;

		const doFetch = async (): Promise<T | null> => {
			_metaStore.set({
				..._metaStore.get(),
				isFetching: true,
				lastFetchStart: new Date(),
				lastFetchEnd: null,
				lastFetchError: null,
			});

			let error: Error | null = null;
			let data: T | undefined;

			try {
				const args = (
					abortable && myController ? [...rest, myController.signal] : rest
				) as A;
				data = await fetchWorker(...args);
			} catch (e) {
				if (_isAbortError(e)) {
					// Discard if store was reset during await.
					if (myGeneration !== _generation) return null;
					// Only clear isFetching if we're still the current request
					// (otherwise a newer fetch owns the meta).
					if (!abortable || myController === _abortController || _abortController === null) {
						_metaStore.set({
							..._metaStore.get(),
							isFetching: false,
							lastFetchEnd: new Date(),
						});
					}
					return null;
				}
				error = e instanceof Error ? e : new Error(String(e));
			}

			// Discard writes if reset happened during await.
			if (myGeneration !== _generation) return null;

			// If abortable and a newer fetch has superseded us, drop the write
			// entirely — the newer fetch will own data and meta.
			if (
				abortable &&
				myController !== _abortController &&
				_abortController !== null
			) {
				return null;
			}

			if (!error && data !== undefined) {
				_dataStore.set(_createData(data, _dataStore.get()));
			}

			const prev = _metaStore.get();
			_metaStore.set({
				...prev,
				isFetching: false,
				lastFetchEnd: new Date(),
				lastFetchError: error,
				successCounter: error ? prev.successCounter : prev.successCounter + 1,
			});

			return error ? null : _dataStore.get();
		};

		const p = doFetch().finally(() => {
			if (_inflightPromise === p) _inflightPromise = null;
			if (myController && myController === _abortController) {
				_abortController = null;
			}
		});

		_inflightPromise = p;
		return p;
	};

	// Similar to fetch, but does NOT touch `isFetching` — avoids loading-spinner
	// flicker for background refreshes. Still updates lastFetchStart,
	// lastFetchEnd, successCounter and lastFetchSilentError so that
	// fetchOnceSilent's threshold/cache logic works correctly.
	const fetchSilent = (...rest: A): Promise<T | null> => {
		if (dedupeInflight && _inflightSilentPromise) return _inflightSilentPromise;

		if (abortable) {
			if (_abortControllerSilent) _abortControllerSilent.abort();
			_abortControllerSilent = new AbortController();
		}

		const myController = _abortControllerSilent;
		const myGeneration = _generation;
		const startedAt = new Date();

		const doFetchSilent = async (): Promise<T | null> => {
			let error: Error | null = null;
			let data: T | undefined;

			try {
				const args = (
					abortable && myController ? [...rest, myController.signal] : rest
				) as A;
				data = await fetchWorker(...args);
			} catch (e) {
				if (_isAbortError(e)) {
					// Discard if reset happened during await.
					if (myGeneration !== _generation) return null;
					// Silent aborts do not touch meta at all — nothing to roll back.
					return null;
				}
				error = e instanceof Error ? e : new Error(String(e));
			}

			if (myGeneration !== _generation) return null;

			if (
				abortable &&
				myController !== _abortControllerSilent &&
				_abortControllerSilent !== null
			) {
				return null;
			}

			// Write data BEFORE meta so subscribers see the new data alongside the
			// new meta in the final notification.
			if (!error && data !== undefined) {
				_dataStore.set(_createData(data, _dataStore.get()));
			}

			const prev = _metaStore.get();
			_metaStore.set({
				...prev,
				lastFetchStart: startedAt,
				lastFetchEnd: new Date(),
				lastFetchSilentError: error,
				successCounter: error ? prev.successCounter : prev.successCounter + 1,
			});

			return error ? null : _dataStore.get();
		};

		const p = doFetchSilent().finally(() => {
			if (_inflightSilentPromise === p) _inflightSilentPromise = null;
			if (myController && myController === _abortControllerSilent) {
				_abortControllerSilent = null;
			}
		});

		_inflightSilentPromise = p;
		return p;
	};

	// Sets internal timestamps to now, tricking fetchOnce into thinking data was just fetched.
	// Useful for external cache invalidation. Increments successCounter as a side effect.
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

	const _normalizeArgs = (a: unknown): A =>
		(Array.isArray(a) ? a : [a]) as unknown as A;

	const _fetchOnce = async (
		isSilent: boolean,
		fetchArgs: unknown = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T | null> => {
		const args = _normalizeArgs(fetchArgs);

		// Always join any in-flight request (regardless of dedupeInflight).
		// Prevents concurrent fetchOnce calls from each firing a fetch.
		if (_inflightPromise) return await _inflightPromise;
		if (_inflightSilentPromise) return await _inflightSilentPromise;

		const { successCounter, lastFetchStart } = _metaStore.get();

		if (!successCounter) {
			return isSilent ? await fetchSilent(...args) : await fetch(...args);
		}

		if (
			thresholdMs &&
			lastFetchStart &&
			Date.now() - lastFetchStart.valueOf() > thresholdMs
		) {
			return isSilent ? await fetchSilent(...args) : await fetch(...args);
		}

		return _dataStore.get();
	};

	// Use falsy threshold (0) to skip threshold check
	const fetchOnce = async (
		fetchArgs: unknown = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T | null> => {
		return await _fetchOnce(false, fetchArgs, thresholdMs);
	};

	const fetchOnceSilent = async (
		fetchArgs: unknown = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T | null> => {
		return await _fetchOnce(true, fetchArgs, thresholdMs);
	};

	// Recursive polling (long/short polling depends on the server)
	const fetchRecursive = (
		fetchArgs: unknown = [],
		delayMs: number | (() => number) = 500,
		opts: { silent?: boolean } = {}
	): (() => void) => {
		const useSilent = opts.silent !== false;
		const runner = useSilent ? fetchSilent : fetch;

		let _timer: ReturnType<typeof setTimeout> | undefined;
		let _aborted = false;

		const _fetchRecursive = (args: unknown[]): void => {
			if (_aborted) return;
			runner(...(args as A)).then(() => {
				if (_aborted) return;
				const resolvedDelay = typeof delayMs === "function" ? delayMs() : delayMs;
				if (_timer) clearTimeout(_timer);
				if (resolvedDelay > 0) {
					_timer = setTimeout(() => {
						if (!_aborted) _fetchRecursive(args);
					}, resolvedDelay);
				}
			});
		};

		const normalized = _normalizeArgs(fetchArgs);
		_fetchRecursive(normalized);

		return () => {
			_aborted = true;
			if (_timer) clearTimeout(_timer);
		};
	};

	// Resets the store to initial state; useful for cache invalidation.
	// Bumps generation so any late-resolving fetch cannot overwrite reset state.
	const reset = (): void => {
		_generation++;
		abort();
		_dataStore.set(initial);
		_metaStore.set(_createMetaObj());
		_inflightPromise = null;
		_inflightSilentPromise = null;
		if (typeof mergedOptions.onReset === "function") mergedOptions.onReset();
	};

	const resetError = (): void => {
		_metaStore.update((old) => ({
			...old,
			lastFetchError: null,
			lastFetchSilentError: null,
		}));
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
