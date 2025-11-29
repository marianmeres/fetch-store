import { createDerivedStore, createStore } from "@marianmeres/store";
// Re-export stream store for backwards compatibility
export { createFetchStreamStore } from "./fetch-stream-store.js";
const DEFAULT_OPTIONS = {
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
export const createFetchStore = (fetchWorker, initial = null, dataFactory = null, options = {}) => {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const { fetchOnceDefaultThresholdMs, dedupeInflight, abortable } = mergedOptions;
    // Always use factory to allow various data transformation strategies (merge/deepmerge/set/...)
    const _createData = (data, old) => typeof dataFactory === "function" ? dataFactory(data, old) : data;
    const _createMetaObj = () => ({
        isFetching: false,
        lastFetchStart: null,
        lastFetchEnd: null,
        lastFetchError: null,
        successCounter: 0,
        lastFetchSilentError: null,
    });
    const _dataStore = createStore(_createData(initial), options);
    const _metaStore = createStore(_createMetaObj());
    const { subscribe, get } = createDerivedStore([_dataStore, _metaStore], ([data, meta]) => ({ data, ...meta }));
    // In-flight promise for deduplication
    let _inflightPromise = null;
    let _inflightSilentPromise = null;
    // AbortController for cancellation
    let _abortController = null;
    let _abortControllerSilent = null;
    const abort = () => {
        if (_abortController) {
            _abortController.abort();
            _abortController = null;
        }
        if (_abortControllerSilent) {
            _abortControllerSilent.abort();
            _abortControllerSilent = null;
        }
    };
    const fetch = (...rest) => {
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
        const doFetch = async () => {
            _metaStore.set({
                ..._metaStore.get(),
                isFetching: true,
                lastFetchStart: new Date(),
                lastFetchEnd: null,
                lastFetchError: null,
            });
            let error = null;
            let newSuccessCounter = _metaStore.get().successCounter;
            try {
                // Pass signal as the last argument if abortable
                const args = abortable && currentController
                    ? [...rest, currentController.signal]
                    : rest;
                _dataStore.set(_createData(await fetchWorker(...args), _dataStore.get()));
                newSuccessCounter++;
            }
            catch (e) {
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
    const fetchSilent = (...rest) => {
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
        const doFetchSilent = async () => {
            const currentMeta = _metaStore.get();
            if (currentMeta.lastFetchSilentError) {
                _metaStore.set({ ...currentMeta, lastFetchSilentError: null });
            }
            let error = null;
            try {
                // Pass signal as the last argument if abortable
                const args = abortable && currentController
                    ? [...rest, currentController.signal]
                    : rest;
                _dataStore.set(_createData(await fetchWorker(...args), _dataStore.get()));
            }
            catch (e) {
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
    const touch = (data) => {
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
    const _fetchOnce = async (isSilent, fetchArgs = [], thresholdMs = fetchOnceDefaultThresholdMs) => {
        const { successCounter, isFetching, lastFetchStart } = _metaStore.get();
        const args = Array.isArray(fetchArgs) ? fetchArgs : [fetchArgs];
        if (!successCounter && !isFetching) {
            return isSilent ? await fetchSilent(...args) : await fetch(...args);
        }
        // Expired threshold?
        if (thresholdMs &&
            !isFetching &&
            lastFetchStart &&
            Date.now() - lastFetchStart.valueOf() > thresholdMs) {
            return isSilent ? await fetchSilent(...args) : await fetch(...args);
        }
        return _dataStore.get();
    };
    // Use falsy threshold (0) to skip threshold check
    const fetchOnce = async (fetchArgs = [], thresholdMs = fetchOnceDefaultThresholdMs) => {
        return await _fetchOnce(false, fetchArgs, thresholdMs);
    };
    const fetchOnceSilent = async (fetchArgs = [], thresholdMs = fetchOnceDefaultThresholdMs) => {
        return await _fetchOnce(true, fetchArgs, thresholdMs);
    };
    // Recursive polling (whether it's "long" or "short" polling depends on the server)
    const fetchRecursive = (fetchArgs = [], delayMs = 500) => {
        let _timer;
        let _aborted = false;
        const _fetchRecursive = (args = [], delay = 500) => {
            const normalizedArgs = Array.isArray(args) ? args : [args];
            const resolvedDelay = typeof delay === "function" ? delay() : delay;
            fetchSilent(...normalizedArgs).then(() => {
                if (_timer)
                    clearTimeout(_timer);
                if (resolvedDelay > 0 && !_aborted) {
                    _timer = setTimeout(() => !_aborted && _fetchRecursive(normalizedArgs, delay), resolvedDelay);
                }
            });
            // Return a "cancel" (or "stop") control fn
            return () => {
                if (_timer)
                    clearTimeout(_timer);
                _aborted = true;
            };
        };
        return _fetchRecursive(fetchArgs, delayMs);
    };
    // Resets the store to initial state; useful for cache invalidation
    const reset = () => {
        abort();
        _dataStore.set(_createData(initial));
        _metaStore.set(_createMetaObj());
        _inflightPromise = null;
        _inflightSilentPromise = null;
        if (typeof mergedOptions.onReset === "function")
            mergedOptions.onReset();
    };
    const resetError = () => {
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
