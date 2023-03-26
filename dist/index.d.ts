import { StoreLike, StoreReadable } from '@marianmeres/store';
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
    fetch: (...args: any[]) => Promise<void>;
    fetchSilent: (...args: any[]) => Promise<void>;
    fetchOnce: (args: any[], thresholdMs: number) => Promise<void>;
    reset: Function;
    resetError: Function;
    getInternalDataStore: () => StoreLike<V>;
}
interface FetchStoreOptions {
    logger: (...args: any[]) => void;
    afterCreate: (fetchStoreInstance: any) => void;
    fetchSilentDefaultThresholdMs: number;
    onError: (e: any) => void;
    onSilentError: (e: any) => void;
}
export declare const createFetchStore: <T>(fetchWorker: (...args: any[]) => Promise<any>, initial?: T, dataFactory?: (raw: any, old?: any) => T, options?: Partial<FetchStoreOptions>) => FetchStore<FetchStoreValue<T>, T>;
export {};
