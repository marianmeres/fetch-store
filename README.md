# @marianmeres/fetch-store

[Store](https://github.com/marianmeres/store) utility for collecting results and meta info
of any type of async work. Typically used for http requests.

## Basic example

```javascript
// foo-store.js
const foo = createFetchStore(
    async () => {
         const r = await fetch('foo.json');
         if (!r.ok) throw new Error('Not OK!');
         return await r.json()
    }
);
```
```sveltehtml
<!--FooComponent.svelte-->
<script>
    onMount(foo.fetch)
</script>

{#if $foo.isFetching}
    <Spinner />
{:else if $foo.lastFetchError}
    <Error error={$foo.lastFetchError} />
{:else}
    <Foo foo={$foo.data} />
{/if}
```

## Api

```typescript
const store = createFetchStore<T>(
    // the async worker
    fetchWorker: (...args) => Promise<any>,
    // optional, initial `data` value of the store
    initial?: T = null,
    // optional, used to modify data returned by fetchWorker... (usefull for various
    // data update strategies, like merge/deepmerge/set etc)
    dataFactory?: (raw: any, old?: any) => T = null,
    // options (see source)
    options? = null
);

// subscription
store.subscribe((v) => {
    // main result
    // v.data: T;

    // meta
    // v.isFetching: boolean;
    // v.lastFetchStart: Date;
    // v.lastFetchEnd: Date;
    // v.lastFetchError: Date;
    // v.successCounter: number;
});

// instance api

// do the async work
store.fetch: (...args) => Promise<void>;

// do the async work, but do not update meta
store.fetchSilent: (...args) => Promise<void>;

// fetch only once (if within threshold since last)
store.fetchOnce: (args: any[], thresholdMs: number) => Promise<void>;

// to reset internal meta store
store.reset: Function;
store.resetError: Function;

// for manual hackings
store.getInternalDataStore();
```
