import { createDerivedStore, createStore } from "@marianmeres/store";
const DEFAULT_OPTIONS = {};
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
export const createFetchStreamStore = (fetchStreamWorker, initial = null, dataFactory = null, options = {}) => {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    // Always use factory to allow various data transformation strategies (merge/deepmerge/set/...)
    const _createData = (data, old) => typeof dataFactory === "function" ? dataFactory(data, old) : data;
    const _createMetaObj = () => ({
        isFetching: false,
        lastFetchStart: null,
        lastFetchEnd: null,
        lastFetchError: null,
    });
    const _dataStore = createStore(_createData(initial), options);
    const _metaStore = createStore(_createMetaObj());
    const { subscribe, get } = createDerivedStore([_dataStore, _metaStore], ([data, meta]) => ({ data, ...meta }));
    const fetchStream = (fetchArgs = [], recursiveDelayMs = 0) => {
        let _timer;
        let _aborted = false;
        let _abortFn;
        // Must be hoisted so recursive calls can be cancelled properly
        let _abort = () => {
            if (typeof _abortFn === "function") {
                _abortFn();
            }
            else {
                console.warn("`abort` is a noop (the fetchStreamWorker did not return a function).");
            }
            if (_timer)
                clearTimeout(_timer);
            _aborted = true;
        };
        // Inner worker (maybe recursive)
        const _fetchStream = (args = [], delayMs = 0) => {
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
                _abortFn = fetchStreamWorker((eventName, eventData) => {
                    if (_metaStore.get().lastFetchError) {
                        _metaStore.set({ ..._metaStore.get(), lastFetchError: null });
                    }
                    if (eventName === "data") {
                        _dataStore.set(_createData(eventData, _dataStore.get()));
                    }
                    else if (eventName === "error") {
                        const error = eventData instanceof Error
                            ? eventData
                            : new Error(String(eventData));
                        _metaStore.set({ ..._metaStore.get(), lastFetchError: error });
                    }
                    else if (eventName === "end") {
                        _metaStore.set({
                            ..._metaStore.get(),
                            isFetching: false,
                            lastFetchEnd: new Date(),
                        });
                        // Maybe recursive?
                        if (delay > 0 && !_aborted) {
                            if (_timer)
                                clearTimeout(_timer);
                            _timer = setTimeout(() => {
                                if (!_aborted) {
                                    _abort = _fetchStream(normalizedArgs, delayMs);
                                }
                            }, delay);
                        }
                    }
                }, ...normalizedArgs);
            }
            catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                _metaStore.set({ ..._metaStore.get(), lastFetchError: error });
            }
            return _abort;
        };
        return _fetchStream(fetchArgs, recursiveDelayMs);
    };
    const reset = () => {
        _dataStore.set(_createData(initial));
        _metaStore.set(_createMetaObj());
        if (typeof mergedOptions.onReset === "function")
            mergedOptions.onReset();
    };
    const resetError = () => {
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
