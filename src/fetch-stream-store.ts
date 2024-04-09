import {
	CreateStoreOptions,
	StoreLike,
	StoreReadable,
	createDerivedStore,
	createStore,
} from '@marianmeres/store';
import { DataFactory, FetchStoreValue } from './index.js';

const isFn = (v: any) => typeof v === 'function';

export interface FetchStreamStoreMeta {
	// "stream"
	isFetching: boolean;
	lastFetchStart: Date | null;
	lastFetchEnd: Date | null;
	lastFetchError: Error | null;
}

interface FetchStreamStoreOptions<T> extends CreateStoreOptions<T> {
	// still overridable on each call
	// fetchOnceDefaultThresholdMs: number;
}

type FetchStreamEventName = 'data' | 'error' | 'end';

type FetchStreamEventEmitFn = (
	eventName: FetchStreamEventName,
	eventData: any
) => () => void;

export interface FetchStreamStore<T, V> extends StoreReadable<T> {
	//
	fetchStream: (args?: any[], recursiveDelayMs?: number | (() => number)) => () => void;
	//
	fetchStreamWorker: (emit: FetchStreamEventEmitFn, ...args: any[]) => any;
	//
	reset: () => void;
	resetError: () => void;
	// for manual hackings
	getInternalDataStore: () => StoreLike<V>;
}

const DEFAULT_OPTIONS = {};

//
export const createFetchStreamStore = <T>(
	fetchStreamWorker: (...args: any[]) => () => void,
	initial: T | null = null,
	dataFactory: null | DataFactory<T> = null,
	options: Partial<FetchStreamStoreOptions<T>> = {}
) => {
	options = { ...DEFAULT_OPTIONS, ...(options || {}) };

	// always via factory, which keeps door open for various strategies (merge/deepmerge/set/...)
	const _createData = (data: any, old?: any): T =>
		isFn(dataFactory) ? dataFactory?.(data, old) : data;

	const _createMetaObj = (): FetchStreamStoreMeta => ({
		// "stream"
		isFetching: false,
		lastFetchStart: null,
		lastFetchEnd: null,
		lastFetchError: null,
	});

	const _dataStore = createStore<T>(_createData(initial), options);
	const _metaStore = createStore<FetchStreamStoreMeta>(_createMetaObj());

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

	const fetchStream = (
		fetchArgs: any[] = [],
		recursiveDelayMs: number | (() => number) = 0
	) => {
		let _timer: any;
		let _aborted = false;
		let _abortFn: any;

		// must be hoisted so the recursive calls are cancelled properly
		let _abort = () => {
			// prettier-ignore
			if (typeof _abortFn === 'function') {
				_abortFn();
			} else {
				console.warn('`abort` is a noop (the fetchStreamWorker did not return a function).');
			}

			if (_timer) clearTimeout(_timer);
			_aborted = true;
		};

		// inner worker (maybe recursive)
		const _fetchStream = (
			fetchArgs: any[] = [],
			recursiveDelayMs: number | (() => number) = 0
		) => {
			if (!Array.isArray(fetchArgs)) fetchArgs = [fetchArgs];
			const delay = isFn(recursiveDelayMs)
				? (recursiveDelayMs as any)()
				: recursiveDelayMs;

			_metaStore.update((m) => ({
				...m,
				isFetching: true,
				lastFetchStart: new Date(),
				lastFetchEnd: null,
				lastFetchError: null,
			}));

			try {
				_abortFn = fetchStreamWorker(
					(eventName: FetchStreamEventName, eventData: any) => {
						if (_metaStore.get().lastFetchError) {
							_metaStore.update((m) => ({ ...m, lastFetchError: null }));
						}
						//
						if (eventName === 'data') {
							_dataStore.set(_createData(eventData, _dataStore.get()));
						}
						//
						else if (eventName === 'error') {
							_metaStore.update((m) => ({ ...m, lastFetchError: eventData }));
						}
						//
						else if (eventName === 'end') {
							_metaStore.update((m) => ({
								...m,
								isFetching: false,
								lastFetchEnd: new Date(),
							}));

							// maybe recursive?
							if (delay > 0 && !_aborted) {
								if (_timer) clearTimeout(_timer);
								_timer = setTimeout(() => {
									if (!_aborted) {
										_abort = _fetchStream(fetchArgs, recursiveDelayMs);
									}
								}, delay);
							}
						}
					},
					...fetchArgs
				);
			} catch (e) {
				_metaStore.update((old) => ({ ...old, lastFetchError: e as any }));
			}

			return _abort;
		};

		return _fetchStream(fetchArgs, recursiveDelayMs);
	};

	const reset = () => {
		_dataStore.set(_createData(initial));
		_metaStore.set(_createMetaObj());
	};

	const resetError = () => _metaStore.update((old) => ({ ...old, lastFetchError: null }));

	return {
		subscribe,
		get,
		fetchStream,
		reset,
		resetError,
		getInternalDataStore: () => _dataStore,
		// expose raw worker as well
		fetchStreamWorker,
	};
};
