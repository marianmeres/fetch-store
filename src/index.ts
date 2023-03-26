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
	fetch: (...args) => Promise<void>;
	fetchSilent: (...args) => Promise<void>;
	fetchOnce: (args: any[], thresholdMs: number) => Promise<void>;
	reset: Function;
	resetError: Function;
	// for manual hackings
	getInternalDataStore: () => StoreLike<V>;
}

interface FetchStoreConfig {
	logger: (...args) => void;
	afterCreate: (fetchStoreInstance) => void;
	// still overridable on each call
	fetchSilentDefaultThresholdMs: number;
	// central error notifier feature
	onError: (e) => void;
	onSilentError: (e) => void;
}
const DEFAULT_CONFIG: Partial<FetchStoreConfig> = {
	// 5 min default
	fetchSilentDefaultThresholdMs: 300_000,
};

const isFn = (v) => typeof v === 'function';

export const createFetchStore = <T>(
	fetchWorker: (...args) => Promise<any>,
	initial: T = null,
	dataFactory: (raw: any, old?: any) => T = null,
	config: Partial<FetchStoreConfig> = null
): FetchStore<FetchStoreValue<T>, T> => {
	const { logger, onError, onSilentError, afterCreate, fetchSilentDefaultThresholdMs } = {
		...DEFAULT_CONFIG,
		...(config || {}),
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
	// 		const s = createFetchStore(...)
	// 		await s.fetch();
	// 		s.get().data === 'something which fetchWorker returned'
	// But it still feels a bit hackish...
	subscribe(() => null);

	const fetch = async (...rest) => {
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
	};

	// similar to fetch, except it does not touch meta... so it allows data update
	// without fetching spinners (for example)
	const fetchSilent = async (...rest) => {
		try {
			_dataStore.set(_createData(await fetchWorker(...rest), _dataStore.get()));
		} catch (e) {
			_log('silent fetch error', e);
			if (isFn(onSilentError)) onSilentError(e);
		}
	};

	// use falsey threshold to skip
	const fetchOnce = async (
		fetchArgs: any[] = [],
		thresholdMs = fetchSilentDefaultThresholdMs
	) => {
		const { successCounter, isFetching, lastFetchStart } = _metaStore.get();

		if (!Array.isArray(fetchArgs)) fetchArgs = [fetchArgs];

		if (!successCounter && !isFetching) {
			return await fetch(...fetchArgs);
		}

		// exired threshold?
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

	if (isFn(afterCreate)) afterCreate(fetchStore);

	return fetchStore;
};
