import { CreateStoreOptions, StoreLike, StoreReadable } from '@marianmeres/store';
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
    fetch: (...args: any[]) => Promise<V>;
    fetchSilent: (...args: any[]) => Promise<V>;
    fetchOnce: (args: any[], thresholdMs: number) => Promise<V>;
    reset: () => void;
    resetError: () => void;
    getInternalDataStore: () => StoreLike<V>;
}
interface FetchStoreOptions<T> extends CreateStoreOptions<T> {
    fetchOnceDefaultThresholdMs: number;
}
type DataFactory<T> = (raw: any, old?: any) => T;
export declare const createFetchStore: <T>(fetchWorker: (...args: any[]) => Promise<any>, initial?: T | null, dataFactory?: DataFactory<T> | null, options?: Partial<FetchStoreOptions<T>>) => FetchStore<FetchStoreValue<T>, T>;
export {};
