import { CreateStoreOptions, StoreLike, StoreReadable } from '@marianmeres/store';
export { createFetchStreamStore } from './fetch-stream-store.js';
export interface FetchStoreMeta {
    isFetching: boolean;
    lastFetchStart: Date | null;
    lastFetchEnd: Date | null;
    lastFetchError: Error | null;
    successCounter: number;
    lastFetchSilentError: Error | null;
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
    getInternalDataStore: () => StoreLike<V>;
    fetchWorker: (...args: any[]) => Promise<any>;
}
interface FetchStoreOptions<T> extends CreateStoreOptions<T> {
    fetchOnceDefaultThresholdMs: number;
}
export type DataFactory<T> = (raw: any, old?: any) => T;
export declare const createFetchStore: <T>(fetchWorker: (...args: any[]) => Promise<any>, initial?: T | null, dataFactory?: DataFactory<T> | null, options?: Partial<FetchStoreOptions<T>>) => FetchStore<FetchStoreValue<T>, T>;
