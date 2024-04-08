import {
	createDerivedStore,
	createStore,
	CreateStoreOptions,
	StoreLike,
	StoreReadable,
} from '@marianmeres/store';

export interface FetchStoreMeta {
	isFetching: boolean;
	lastFetchStart: Date | null;
	lastFetchEnd: Date | null;
	lastFetchError: Error | null;
	lastFetchSilentError: Error | null;
	successCounter: number;
}

export interface FetchStoreValue<T> extends FetchStoreMeta {
	data: T;
}

export interface FetchStore<T, V> extends StoreReadable<T> {
	fetch: (...args: any[]) => Promise<V | null>;
	fetchSilent: (...args: any[]) => Promise<V | null>;
	fetchOnce: (args?: any[], thresholdMs?: number) => Promise<V | null>;
	fetchRecursive: (args?: any[], delayMs?: number) => () => void;
	reset: () => void;
	resetError: () => void;
	// for manual hackings
	getInternalDataStore: () => StoreLike<V>;
	fetchWorker: (...args: any[]) => Promise<any>;
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
		isFetching: false,
		lastFetchStart: null,
		lastFetchEnd: null,
		lastFetchError: null,
		lastFetchSilentError: null,
		successCounter: 0,
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
	let _timer: any;
	const fetchRecursive = (fetchArgs: any[] = [], delayMs: number = 500) => {
		if (!Array.isArray(fetchArgs)) fetchArgs = [fetchArgs];
		// console.log('-- fetchRecursive --');

		fetchSilent(...fetchArgs).then(() => {
			// special case stop signal, quit asap
			if (_timer === false) {
				return (_timer = undefined);
			}

			// maybe not necessary, since we're already in the planned call, so there is nothing to clear...
			if (_timer) {
				clearTimeout(_timer);
				_timer = undefined;
			}

			//
			_timer = setTimeout(() => fetchRecursive(fetchArgs, delayMs), delayMs);
		});

		// return a "cancel" (or "stop") control fn
		return () => {
			// if we have a timer, clear it, and reset for future normal use
			if (_timer) {
				clearTimeout(_timer);
				_timer = undefined;
			}
			// if we dont we are most likely stopping immediately before the first fetch has finished
			// so set explicit false (as a special case signal) to prevent first recursion
			else {
				_timer = false;
			}
		};
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
		reset,
		resetError,
		getInternalDataStore: () => _dataStore,
		// expose raw worker as well
		fetchWorker,
	};

	return fetchStore;
};
