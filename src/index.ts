import {
	createDerivedStore,
	createStore,
	CreateStoreOptions,
	StoreLike,
	StoreReadable,
} from '@marianmeres/store';

// reexport streams
export { createFetchStreamStore } from './fetch-stream-store.js';

export interface FetchStoreMeta {
	// "normal"
	isFetching: boolean;
	lastFetchStart: Date | null;
	lastFetchEnd: Date | null;
	lastFetchError: Error | null;
	successCounter: number;
	// "silent"
	lastFetchSilentError: Error | null;
}

export interface FetchStoreValue<T> extends FetchStoreMeta {
	data: T;
}

export interface FetchStore<T, V> extends StoreReadable<T> {
	fetch: (...args: any[]) => Promise<V | null>;
	fetchSilent: (...args: any[]) => Promise<V | null>;
	fetchOnce: (args?: any[], thresholdMs?: number) => Promise<V | null>;
	fetchOnceSilent: (args?: any[], thresholdMs?: number) => Promise<V | null>;
	fetchRecursive: (args?: any[], delayMs?: number) => () => void;
	//
	reset: () => void;
	resetError: () => void;
	// for manual hackings
	getInternalDataStore: () => StoreLike<V>;
	fetchWorker: (...args: any[]) => Promise<any>;
	touch: (data?: V) => void;
}

interface FetchStoreOptions<T> extends CreateStoreOptions<T> {
	// still overridable on each call
	fetchOnceDefaultThresholdMs: number;
	onReset: () => void;
}
const DEFAULT_OPTIONS: Partial<FetchStoreOptions<any>> = {
	// 5 min default
	fetchOnceDefaultThresholdMs: 300_000,
};

const isFn = (v: any) => typeof v === 'function';

export type DataFactory<T> = (raw: any, old?: any) => T;

//
export const createFetchStore = <T>(
	fetchWorker: (...args: any[]) => Promise<any>,
	initial: T | null = null,
	dataFactory: null | DataFactory<T> = null,
	options: Partial<FetchStoreOptions<T>> = {}
): FetchStore<FetchStoreValue<T>, T> => {
	const { fetchOnceDefaultThresholdMs } = {
		...DEFAULT_OPTIONS,
		...(options || {}),
	};

	// always via factory, which keeps door open for various strategies (merge/deepmerge/set/...)
	const _createData = (data: any, old?: any): T =>
		isFn(dataFactory) ? (dataFactory as any)?.(data, old) : data;

	const _createMetaObj = (): FetchStoreMeta => ({
		// "normal"
		isFetching: false,
		lastFetchStart: null,
		lastFetchEnd: null,
		lastFetchError: null,
		successCounter: 0,
		// "silent"
		lastFetchSilentError: null,
	});

	const _dataStore = createStore<T>(_createData(initial), options);
	const _metaStore = createStore<FetchStoreMeta>(_createMetaObj());

	const { subscribe, get } = createDerivedStore<FetchStoreValue<T>>(
		[_dataStore, _metaStore],
		([data, meta]) => ({ data, ...meta })
	);

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

	/** Basically just setting the internal `lastXYZ` timestamps to now, so the fetchOnce
	 * will be tricked. Useful for cache-hackings from the outside*/
	const touch = (data?: T) => {
		if (data) {
			_dataStore.set(data);
		}
		let meta = _metaStore.get();
		const now = new Date();
		_metaStore.set({
			...meta,
			lastFetchStart: now,
			lastFetchEnd: now,
			successCounter: meta.successCounter + 1,
		});
	};

	const _fetchOnce = async (
		isSilent: boolean,
		fetchArgs: any[] = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T | null> => {
		const { successCounter, isFetching, lastFetchStart } = _metaStore.get();

		if (!Array.isArray(fetchArgs)) fetchArgs = [fetchArgs];

		if (!successCounter && !isFetching) {
			return isSilent ? await fetchSilent(...fetchArgs) : await fetch(...fetchArgs);
		}

		// expired threshold?
		if (
			thresholdMs &&
			!isFetching &&
			lastFetchStart &&
			Date.now() - new Date(lastFetchStart).valueOf() > thresholdMs
		) {
			return isSilent ? await fetchSilent(...fetchArgs) : await fetch(...fetchArgs);
		}

		return _dataStore.get();
	};

	// use falsey threshold to skip
	const fetchOnce = async (
		fetchArgs: any[] = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T | null> => {
		return await _fetchOnce(false, fetchArgs, thresholdMs);
	};

	const fetchOnceSilent = async (
		fetchArgs: any[] = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T | null> => {
		return await _fetchOnce(true, fetchArgs, thresholdMs);
	};

	// a.k.a. polling (if it's "long" or "short" depends on the server)
	// undefined | explicit false | timer id
	const fetchRecursive = (
		fetchArgs: any[] = [],
		delayMs: number | (() => number) = 500
	) => {
		let _timer: any;
		let _aborted = false;

		const _fetchRecursive = (
			fetchArgs: any[] = [],
			delayMs: number | (() => number) = 500
		) => {
			if (!Array.isArray(fetchArgs)) fetchArgs = [fetchArgs];
			const delay = isFn(delayMs) ? (delayMs as any)() : delayMs;
			// console.log('-- fetchRecursive --');

			fetchSilent(...fetchArgs).then(() => {
				if (_timer) clearTimeout(_timer);
				if (delay > 0 && !_aborted) {
					_timer = setTimeout(
						() => !_aborted && fetchRecursive(fetchArgs, delayMs),
						delay
					);
				}
			});

			// return a "cancel" (or "stop") control fn
			return () => {
				if (_timer) clearTimeout(_timer);
				_aborted = true;
			};
		};

		return _fetchRecursive(fetchArgs, delayMs);
	};

	const reset = () => {
		_dataStore.set(_createData(initial));
		_metaStore.set(_createMetaObj());
		if (typeof options.onReset === 'function') options.onReset();
	};

	const resetError = () => _metaStore.update((old) => ({ ...old, lastFetchError: null }));

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
		// expose raw worker as well
		fetchWorker,
	};
};
