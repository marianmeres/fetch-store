import {
	createDerivedStore,
	createStore,
	CreateStoreOptions,
	StoreLike,
	StoreReadable,
} from '@marianmeres/store';

export interface FetchStoreMeta {
	// "normal"
	isFetching: boolean;
	lastFetchStart: Date | null;
	lastFetchEnd: Date | null;
	lastFetchError: Error | null;
	successCounter: number;
	// "silent"
	lastFetchSilentError: Error | null;
	// "stream"
	isStreaming: boolean;
	lastFetchStreamStart: Date | null;
	lastFetchStreamEnd: Date | null;
	lastFetchStreamError: Error | null;
}

export interface FetchStoreValue<T> extends FetchStoreMeta {
	data: T;
}

// type StreamEventHandler = (eventName: string, eventData: any) => void;

export interface FetchStore<T, V> extends StoreReadable<T> {
	fetch: (...args: any[]) => Promise<V | null>;
	fetchSilent: (...args: any[]) => Promise<V | null>;
	fetchOnce: (args?: any[], thresholdMs?: number) => Promise<V | null>;
	fetchRecursive: (args?: any[], delayMs?: number) => () => void;
	//
	reset: () => void;
	resetError: () => void;
	// for manual hackings
	getInternalDataStore: () => StoreLike<V>;
	fetchWorker: (...args: any[]) => Promise<any>;
	// experimental
	fetchStream: (args?: any[], recursiveDelayMs?: number) => Promise<() => void>;
}

interface FetchStoreOptions<T> extends CreateStoreOptions<T> {
	// still overridable on each call
	fetchOnceDefaultThresholdMs: number;
	//
	isEqual: (previous: T, current: T) => boolean;
}
const DEFAULT_OPTIONS: Partial<FetchStoreOptions<any>> = {
	// 5 min default
	fetchOnceDefaultThresholdMs: 300_000,
	// by default, we're just strict comparing the raw value, which may trigger false positives
	// use custom deep equal comparison fn (eg _.isEqual) if needed
	isEqual: (previous, current) => previous === current,
};

const isFn = (v: any) => typeof v === 'function';

type DataFactory<T> = (raw: any, old?: any) => T;

//
export const createFetchStore = <T>(
	fetchWorker: (...args: any[]) => Promise<any>,
	initial: T | null = null,
	dataFactory: null | DataFactory<T> = null,
	options: Partial<FetchStoreOptions<T>> = {}
): FetchStore<FetchStoreValue<T>, T> => {
	const { fetchOnceDefaultThresholdMs, isEqual } = {
		...DEFAULT_OPTIONS,
		...(options || {}),
	};

	// always via factory, which keeps door open for various strategies (merge/deepmerge/set/...)
	const _createData = (data: any, old?: any): T =>
		isFn(dataFactory) ? dataFactory?.(data, old) : data;

	const _createMetaObj = (): FetchStoreMeta => ({
		// "normal"
		isFetching: false,
		lastFetchStart: null,
		lastFetchEnd: null,
		lastFetchError: null,
		successCounter: 0,
		// "silent"
		lastFetchSilentError: null,
		// "stream"
		isStreaming: false,
		lastFetchStreamStart: null,
		lastFetchStreamEnd: null,
		lastFetchStreamError: null,
	});

	const _dataStore = createStore<T>(_createData(initial), options);
	const _metaStore = createStore<FetchStoreMeta>(_createMetaObj());

	const { subscribe, get } = createDerivedStore<FetchStoreValue<T>>(
		[_dataStore, _metaStore],
		([data, meta]) => ({ data, ...meta })
	);

	// In this fetch store case, we want at least one subscription to always exist,
	// because we want this ugly-non-store-like-practice to work (note no outer subscription):
	//     const s = createFetchStore(...)
	//     await s.fetch();
	//     s.get().data === 'something which fetchWorker returned'
	// But it still feels a bit hackish...
	subscribe(() => null);

	//
	const fetch = async (...rest: any[]): Promise<T | null> => {
		let meta = _metaStore.get();

		meta.isFetching = true;
		meta.lastFetchStart = new Date();
		meta.lastFetchEnd = null;
		meta.lastFetchError = null;

		_metaStore.set({ ...meta });

		try {
			_dataStore.set(_createData(await fetchWorker(...rest), _dataStore.get()));
			meta.successCounter++;
		} catch (e) {
			meta.lastFetchError = e as any;
		} finally {
			meta.isFetching = false;
			meta.lastFetchEnd = new Date();
		}

		_metaStore.set({ ...meta });

		// return fetched (or last) data (for non-subscribe consumption)
		return _metaStore.get().lastFetchError ? null : _dataStore.get();
	};

	// similar to fetch, except it does not touch meta.isFetching... so it allows data update
	// without fetching spinners (for example)
	const fetchSilent = async (...rest: any[]): Promise<T | null> => {
		let meta = _metaStore.get();
		let _metaChange = 0;
		if (meta.lastFetchSilentError) {
			_metaStore.set({ ...meta, lastFetchSilentError: null });
			_metaChange++;
		}
		try {
			_dataStore.set(_createData(await fetchWorker(...rest), _dataStore.get()));
		} catch (e) {
			meta.lastFetchSilentError = e as any;
			_metaChange++;
		}

		//
		if (_metaChange) _metaStore.set({ ...meta });

		// return fetched (or last) data (for non-subscribe consumption)
		return _metaStore.get().lastFetchSilentError ? null : _dataStore.get();
	};

	// use falsey threshold to skip
	const fetchOnce = async (
		fetchArgs: any[] = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T | null> => {
		const { successCounter, isFetching, lastFetchStart } = _metaStore.get();

		if (!Array.isArray(fetchArgs)) fetchArgs = [fetchArgs];

		if (!successCounter && !isFetching) {
			return await fetch(...fetchArgs);
		}

		// expired threshold?
		if (
			thresholdMs &&
			!isFetching &&
			lastFetchStart &&
			Date.now() - new Date(lastFetchStart).valueOf() > thresholdMs
		) {
			return await fetch(...fetchArgs);
		}

		return _dataStore.get();
	};

	// a.k.a. polling (if it's "long" or "short" depends on the server)
	// undefined | explicit false | timer id
	let _recTimer: any;
	const fetchRecursive = (fetchArgs: any[] = [], delayMs: number = 500) => {
		if (!Array.isArray(fetchArgs)) fetchArgs = [fetchArgs];
		// console.log('-- fetchRecursive --');

		fetchSilent(...fetchArgs).then(() => {
			// special case stop signal, quit asap
			if (_recTimer === false) {
				return (_recTimer = undefined);
			}

			// maybe not necessary, since we're already in the planned call, so there is nothing to clear...
			if (_recTimer) {
				clearTimeout(_recTimer);
				_recTimer = undefined;
			}

			//
			_recTimer = setTimeout(() => fetchRecursive(fetchArgs, delayMs), delayMs);
		});

		// return a "cancel" (or "stop") control fn
		return () => {
			// if we have a timer, clear it, and reset for future normal use
			if (_recTimer) {
				clearTimeout(_recTimer);
				_recTimer = undefined;
			}
			// if we dont we are most likely stopping immediately before the first fetch has finished
			// so set explicit false (as a special case signal) to prevent first recursion
			else {
				_recTimer = false;
			}
		};
	};

	// experimental, subject of change
	let _recStreamTimer: any;
	const fetchStream = async (fetchArgs: any[] = [], recursiveDelayMs: number = 0) => {
		if (!Array.isArray(fetchArgs)) fetchArgs = [fetchArgs];
		// console.log(`--- fetchStream ---`);
		_metaStore.update((m) => ({
			...m,
			isStreaming: true,
			lastFetchStreamStart: new Date(),
			lastFetchStreamEnd: null,
			lastFetchStreamError: null,
		}));

		let _abortFn: any;

		let _abort = () => {
			if (typeof _abortFn === 'function') {
				_abortFn();
			} else {
				console.warn(`This is a noop as the fetchWorker did not return a function.`);
			}
			if (_recStreamTimer) {
				clearTimeout(_recStreamTimer);
				_recStreamTimer = undefined;
			} else {
				_recStreamTimer = false;
			}
		};

		try {
			// for streaming, fetchWorker should return an abort fn
			_abortFn = await fetchWorker((eventName: string, eventData: any) => {
				eventName = `${eventName || ''}`.toLowerCase();
				// console.log(`   ---> ${eventName}`);

				if (_metaStore.get().lastFetchStreamError) {
					_metaStore.update((m) => ({ ...m, lastFetchStreamError: null }));
				}

				// explicitly whitelisting all 3 known and supported events:
				// "data", "error", "end"

				//
				if (eventName === 'data') {
					_dataStore.set(_createData(eventData, _dataStore.get()));
				}
				//
				else if (eventName === 'error') {
					_metaStore.update((m) => ({ ...m, lastFetchStreamError: eventData }));
				}
				//
				else if (eventName === 'end') {
					_metaStore.update((m) => ({
						...m,
						isStreaming: false,
						lastFetchStreamEnd: new Date(),
					}));

					// maybe recursive?
					if (recursiveDelayMs > 0) {
						if (_recStreamTimer === false) {
							return (_recStreamTimer = undefined);
						}
						if (_recStreamTimer) {
							clearTimeout(_recStreamTimer);
							_recStreamTimer = undefined;
						}
						_recStreamTimer = setTimeout(async () => {
							_abort = await fetchStream(fetchArgs, recursiveDelayMs);
						}, recursiveDelayMs);
					}
				}
			}, ...fetchArgs);
		} catch (e) {
			_metaStore.update((old) => ({ ...old, lastFetchStreamError: e as any }));
		}

		return _abort;
	};

	const reset = () => {
		_dataStore.set(_createData(initial));
		_metaStore.set(_createMetaObj());
	};

	const resetError = () => _metaStore.update((old) => ({ ...old, lastFetchError: null }));

	const fetchStore = {
		subscribe,
		get,
		fetch,
		fetchSilent,
		fetchOnce,
		fetchRecursive,
		fetchStream,
		reset,
		resetError,
		getInternalDataStore: () => _dataStore,
		// expose raw worker as well
		fetchWorker,
	};

	return fetchStore;
};
