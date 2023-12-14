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
    fetch: (...args: any[]) => Promise<V>;
    fetchSilent: (...args: any[]) => Promise<V>;
    fetchOnce: (args: any[], thresholdMs: number) => Promise<V>;
    reset: Function;
    resetError: Function;
    getInternalDataStore: () => StoreLike<V>;
}
interface FetchStoreOptions {
    logger: (...args: any[]) => void;
    fetchOnceDefaultThresholdMs: number;
    onError: (e: any) => void;
    onSilentError: (e: any) => void;
    afterCreate: (fetchStoreInstance: any) => void;
}
type DataFactory<T> = (raw: any, old?: any) => T;
export declare const createFetchStore: <T>(fetchWorker: (...args: any[]) => Promise<any>, initial?: T, dataFactory?: DataFactory<T>, options?: Partial<FetchStoreOptions>) => FetchStore<FetchStoreValue<T>, T>;
export {};
