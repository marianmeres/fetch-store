import {
	createDerivedStore,
	createStore,
	StoreLike,
	StoreReadable,
} from '@marianmeres/store';

export interface FetchStoreMeta {
	isFetching: boolean;
	lastFetchStart: Date;
	lastFetchEnd: Date;
	lastFetchError: Date;
	successCounter: number;
}

export interface FetchStoreValue<T> extends FetchStoreMeta {
	data: T;
}

export interface FetchStore<T, V> extends StoreReadable<T> {
	fetch: (...args) => Promise<V>;
	fetchSilent: (...args) => Promise<V>;
	fetchOnce: (args: any[], thresholdMs: number) => Promise<V>;
	reset: Function;
	resetError: Function;
	// for manual hackings
	getInternalDataStore: () => StoreLike<V>;
}

interface FetchStoreOptions {
	logger: (...args) => void;
	// still overridable on each call
	fetchOnceDefaultThresholdMs: number;
	// central error notifier feature
	onError: (e) => void;
	onSilentError: (e) => void;
	// deprecated
	afterCreate: (fetchStoreInstance) => void;
}
const DEFAULT_OPTIONS: Partial<FetchStoreOptions> = {
	// 5 min default
	fetchOnceDefaultThresholdMs: 300_000,
};

const isFn = (v) => typeof v === 'function';

type DataFactory<T> = (raw: any, old?: any) => T;

//
export const createFetchStore = <T>(
	fetchWorker: (...args) => Promise<any>,
	initial: T = null,
	dataFactory: null | DataFactory<T> = null,
	options: Partial<FetchStoreOptions> = null
): FetchStore<FetchStoreValue<T>, T> => {
	const { logger, onError, onSilentError, afterCreate, fetchOnceDefaultThresholdMs } = {
		...DEFAULT_OPTIONS,
		...(options || {}),
	};

	const _log = (...a) => (isFn(logger) ? logger.apply(null, a) : undefined);

	// always via factory, which keeps door open for various strategies (merge/deepmerge/set/...)
	const _createData = (data, old?): T =>
		isFn(dataFactory) ? dataFactory(data, old) : data;

	const _createMetaObj = (): FetchStoreMeta => ({
		isFetching: false,
		lastFetchStart: null,
		lastFetchEnd: null,
		lastFetchError: null,
		successCounter: 0,
	});

	const _dataStore = createStore<T>(_createData(initial));
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

	const fetch = async (...rest): Promise<T> => {
		let data = _dataStore.get();
		let meta = _metaStore.get();

		const lastFetchStart = new Date();
		let lastFetchError = null;

		_metaStore.set({
			...meta,
			isFetching: true,
			lastFetchStart,
			lastFetchEnd: null,
			lastFetchError,
		});

		try {
			data = _createData(await fetchWorker(...rest), data);
			meta.successCounter++;
		} catch (e) {
			lastFetchError = e;
		}

		_dataStore.set(data);
		_metaStore.set({
			...meta,
			isFetching: false,
			lastFetchStart,
			lastFetchEnd: new Date(),
			lastFetchError,
		});

		if (lastFetchError && isFn(onError)) onError(lastFetchError);

		// return fetched content as well...
		return data;
	};

	// similar to fetch, except it does not touch meta... so it allows data update
	// without fetching spinners (for example)
	const fetchSilent = async (...rest): Promise<T> => {
		try {
			let data = _createData(await fetchWorker(...rest), _dataStore.get());
			_dataStore.set(data);
			return data;
		} catch (e) {
			_log('silent fetch error', e);
			if (isFn(onSilentError)) onSilentError(e);
		}
	};

	// use falsey threshold to skip
	const fetchOnce = async (
		fetchArgs: any[] = [],
		thresholdMs = fetchOnceDefaultThresholdMs
	): Promise<T> => {
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

	// deprecated
	if (isFn(afterCreate)) {
		console.warn('`afterCreate` option is deprecated and will be removed');
		afterCreate(fetchStore);
	}

	return fetchStore;
};
