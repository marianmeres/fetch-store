import { CreateStoreOptions, StoreLike, StoreReadable } from '@marianmeres/store';
export interface FetchStoreMeta {
    isFetching: boolean;
    lastFetchStart: Date | null;
    lastFetchEnd: Date | null;
    lastFetchError: Error | null;
    successCounter: number;
    lastFetchSilentError: Error | null;
    isStreaming: boolean;
    lastFetchStreamStart: Date | null;
    lastFetchStreamEnd: Date | null;
    lastFetchStreamError: Error | null;
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
    fetchStream: (args?: any[], recursiveDelayMs?: number) => Promise<() => void>;
}
interface FetchStoreOptions<T> extends CreateStoreOptions<T> {
    fetchOnceDefaultThresholdMs: number;
    isEqual: (previous: T, current: T) => boolean;
}
type DataFactory<T> = (raw: any, old?: any) => T;
export declare const createFetchStore: <T>(fetchWorker: (...args: any[]) => Promise<any>, initial?: T | null, dataFactory?: DataFactory<T> | null, options?: Partial<FetchStoreOptions<T>>) => FetchStore<FetchStoreValue<T>, T>;
export {};
