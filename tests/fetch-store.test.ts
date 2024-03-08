import path from 'node:path';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { createClog } from '@marianmeres/clog';
import { TestRunner } from '@marianmeres/test-runner';
import { createFetchStore } from '../src/index.js';

const clog = createClog(path.basename(fileURLToPath(import.meta.url)));
const suite = new TestRunner(path.basename(fileURLToPath(import.meta.url)));
const sleep = (ms: any) => new Promise((r) => setTimeout(r, ms));

suite.test('basic flow', async () => {
	const s = createFetchStore(async () => ({ foo: 'baz' }), { foo: 'bar' });
	// clog(s.get());

	assert(s.get().data.foo === 'bar');
	assert(s.get().lastFetchError === null);
	assert(s.get().lastFetchStart === null);
	assert(s.get().successCounter === 0);

	await s.fetch();

	// clog(s.get());
	assert(s.get().data.foo === 'baz');
	assert(s.get().lastFetchError === null);
	assert(s.get().lastFetchStart);
	assert(s.get().successCounter === 1);

	// unsub();
});

suite.test('error handling works', async () => {
	let i = 0;
	let e = 0;
	const s = createFetchStore(
		async () => {
			if (!i++) throw new Error();
			return true;
		},
		{ foo: 'bar' },
		null
	);

	const unsub = s.subscribe(({ lastFetchError }) => {
		if (lastFetchError) e++;
	});

	await s.fetch();

	assert(s.get().lastFetchError);
	assert(s.get().lastFetchStart);
	assert(s.get().successCounter === 0);

	await s.fetch();

	assert(s.get().lastFetchError === null);
	assert(s.get().lastFetchStart);
	assert(s.get().successCounter === 1);

	assert(e === 1);

	unsub();
});

suite.test('reset error test', async () => {
	const s = createFetchStore(async () => {
		throw new Error();
	});
	await s.fetch();
	assert(s.get().lastFetchError);
	s.resetError();
	assert(!s.get().lastFetchError);
});

suite.test('subscribe', async () => {
	let counter = 0;
	let result = 0;
	let isFetchingCounter = 0;

	const s = createFetchStore<{ counter: number }>(async () => ({ counter: ++counter }));

	const unsub = s.subscribe((v) => {
		result = v.data?.counter;
		isFetchingCounter += Number(v.isFetching);
	});

	await s.fetch();
	await s.fetch();
	await s.fetch();

	//
	assert(result === 3);
	assert(isFetchingCounter >= 3);

	unsub();
});

suite.test('subscribe & fetch silent', async () => {
	let counter = 0;
	let result = 0;
	let isFetchingCounter = 0;

	const s = createFetchStore<{ counter: number }>(async () => ({ counter: ++counter }));

	const unsub = s.subscribe((v) => {
		result = v.data?.counter;
		isFetchingCounter += Number(v.isFetching);
	});

	await s.fetchSilent();
	await s.fetchSilent();
	await s.fetchSilent();

	//
	assert(result === 3);
	assert(!isFetchingCounter);

	unsub();
});

suite.test('create data factory', async () => {
	let counter = 0;
	let result = 0;

	const s = createFetchStore<{ counter: number }>(
		async () => ({ counter: ++counter }),
		{ counter },
		(data, old) => ({ counter: data.counter * 1000 })
	);

	const unsub = s.subscribe((v) => {
		result = v.data?.counter;
	});

	await s.fetch();
	await s.fetch();
	await s.fetch();

	assert(result === 3000);
	assert(s.get().successCounter === 3);

	unsub();
});

suite.test('fetch once works', async () => {
	let counter = 0;
	let result = 0;

	const s = createFetchStore<{ counter: number }>(async () => ({ counter: ++counter }));

	const unsub = s.subscribe((v) => (result = v.data?.counter));

	await s.fetchOnce([null], 2);
	await s.fetchOnce([null], 2); // ignored
	await sleep(5);
	await s.fetchOnce([null], 2);
	await s.fetchOnce([null], 2); // ignored

	assert(result === 2);
	assert(s.get().successCounter === 2);

	unsub();
});

suite.test('internal data store hackings', async () => {
	const s = createFetchStore<any>(async () => ({ foo: 'bar' }));
	await s.fetch();
	assert(s.get().data.foo === 'bar');
	s.getInternalDataStore().set({ hey: 'ho' });
	assert(s.get().data.hey === 'ho');

	// reset test
	s.reset();
	assert(s.get().data === null);
	assert(s.get().successCounter === 0);
});

suite.test(
	'`hasChangedSinceLastFetch` - default shallow isEqual comparison',
	async () => {
		let val = { foo: 'bar' };
		const s = createFetchStore<any>(async () => val, val);

		await s.fetch();
		assert(s.get().data.foo === 'bar');
		// initial fetch has not changed, since we've provided initial value to factory
		assert(!s.get().hasChangedSinceLastFetch);

		// now second fetch must have also not changed
		await s.fetch();
		assert(s.get().data.foo === 'bar');
		assert(!s.get().hasChangedSinceLastFetch);

		// now we change the value instance, so the it must be reported as changed
		val = { ...val };
		await s.fetch();
		assert(s.get().data.foo === 'bar'); // altough bar has not changed
		assert(s.get().hasChangedSinceLastFetch);

		// now we change the foo value within the same instance, so it must not see the change
		val.foo = 'baz';
		await s.fetch();
		assert(s.get().data.foo === 'baz'); // altough bar is now baz
		assert(!s.get().hasChangedSinceLastFetch);
	}
);

suite.test('`hasChangedSinceLastFetch` - custom deep isEqual comparison', async () => {
	let val = { foo: 'bar' };
	const isEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b); // naive example
	const s = createFetchStore<any>(async () => val, val, null, { isEqual });

	await s.fetch();
	assert(s.get().data.foo === 'bar');
	// initial fetch has not changed, since we've provided initial value to factory
	assert(!s.get().hasChangedSinceLastFetch);

	// now second fetch must have also not changed
	await s.fetch();
	assert(s.get().data.foo === 'bar');
	assert(!s.get().hasChangedSinceLastFetch);

	// now we change the value instance, but it must NOT be reported as changed since
	// we're comparing just the serialized output
	val = { ...val };
	await s.fetch();
	assert(s.get().data.foo === 'bar');
	assert(!s.get().hasChangedSinceLastFetch);
});

export default suite;
