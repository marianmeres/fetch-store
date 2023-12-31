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
	fetchOnce: (args: any[], thresholdMs: number) => Promise<V | null>;
	reset: () => void;
	resetError: () => void;
	// for manual hackings
	getInternalDataStore: () => StoreLike<V>;
}

interface FetchStoreOptions<T> extends CreateStoreOptions<T> {
	// still overridable on each call
	fetchOnceDefaultThresholdMs: number;
}
const DEFAULT_OPTIONS: Partial<FetchStoreOptions<any>> = {
	// 5 min default
	fetchOnceDefaultThresholdMs: 300_000,
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
	const { fetchOnceDefaultThresholdMs } = {
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

	// similar to fetch, except it does not touch meta... so it allows data update
	// without fetching spinners (for example)
	const fetchSilent = async (...rest: any[]): Promise<T | null> => {
		let meta = _metaStore.get();
		if (meta.lastFetchSilentError) {
			_metaStore.set({ ...meta, lastFetchSilentError: null });
		}
		try {
			_dataStore.set(_createData(await fetchWorker(...rest), _dataStore.get()));
		} catch (e) {
			_metaStore.set({ ...meta, lastFetchSilentError: e as any });
		}

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
		reset,
		resetError,
		getInternalDataStore: () => _dataStore,
	};

	return fetchStore;
};
