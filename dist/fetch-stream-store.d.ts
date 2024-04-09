import { CreateStoreOptions, StoreLike, StoreReadable } from '@marianmeres/store';
import { DataFactory, FetchStoreValue } from './index.js';
export interface FetchStreamStoreMeta {
    isFetching: boolean;
    lastFetchStart: Date | null;
    lastFetchEnd: Date | null;
    lastFetchError: Error | null;
}
interface FetchStreamStoreOptions<T> extends CreateStoreOptions<T> {
}
type FetchStreamEventName = 'data' | 'error' | 'end';
type FetchStreamEventEmitFn = (eventName: FetchStreamEventName, eventData: any) => () => void;
export interface FetchStreamStore<T, V> extends StoreReadable<T> {
    fetchStream: (args?: any[], recursiveDelayMs?: number | (() => number)) => () => void;
    fetchStreamWorker: (emit: FetchStreamEventEmitFn, ...args: any[]) => any;
    reset: () => void;
    resetError: () => void;
    getInternalDataStore: () => StoreLike<V>;
}
export declare const createFetchStreamStore: <T>(fetchStreamWorker: (...args: any[]) => () => void, initial?: T | null, dataFactory?: DataFactory<T> | null, options?: Partial<FetchStreamStoreOptions<T>>) => {
    subscribe: (cb: import("@marianmeres/store").Subscribe<FetchStoreValue<T>>) => import("@marianmeres/store").Unsubscribe;
    get: () => FetchStoreValue<T>;
    fetchStream: (fetchArgs?: any[], recursiveDelayMs?: number | (() => number)) => () => void;
    reset: () => void;
    resetError: () => void;
    getInternalDataStore: () => StoreLike<T>;
    fetchStreamWorker: (...args: any[]) => () => void;
};
export {};
