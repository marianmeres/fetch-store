import { createClog } from '@marianmeres/clog';
import { TestRunner } from '@marianmeres/test-runner';
import { strict as assert } from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

suite.test('fetchRecursive basic flow works', async () => {
	let _counter = 0;
	const s = createFetchStore(async () => ++_counter);

	let _log: any[] = [];
	const unsub = s.subscribe((o) => o.data && _log.push(o));

	const stop = s.fetchRecursive([], 50);

	await sleep(110);
	stop();
	unsub();
	// clog(_log);

	// first (the initial subscribe)
	// second poll | third poll
	//       sleep     |  stop
	assert(_log.length === 3);
});

suite.test('fetchRecursive immediate stop', async () => {
	let _counter = 0;
	const s = createFetchStore(async () => ++_counter);

	let _log: any[] = [];
	const unsub = s.subscribe((o) => o.data && _log.push(o));

	const stop = s.fetchRecursive([], 100);

	stop();
	unsub();

	// clog(_log);
	assert(!_log.length);
});

suite.test('fetchStream', async () => {
	let _aborted = false;
	let _counter = 0;
	const s = createFetchStore(async (emit) => {
		// e.g. do http stream request
		// on incoming chunks call:
		await sleep(100);
		emit('data', ++_counter);
		await sleep(100);
		emit('data', ++_counter);
		// ...
		await sleep(100);
		emit('end');

		return () => (_aborted = true);
	});

	let _log: any[] = [];
	const unsub = s.subscribe((o) => _log.push(o));

	const stop = await s.fetchStream([]);

	await sleep(350);

	// clog(_log);
	stop();
	unsub();

	assert(_aborted);

	// 1 initial, 1 meta stream start, 2 data emits, 1 meta stream end
	assert(_log.length === 5);

	assert(_log.at(-1).lastFetchStreamEnd - _log.at(-1).lastFetchStreamStart >= 300);
});

suite.test('fetchStream recursive', async () => {
	let _aborted = false;
	let _counter = 0;
	const s = createFetchStore(async (emit) => {
		await sleep(50);
		try {
			emit('data', ++_counter);
			emit('data', ++_counter);
			// throw new Error('sdf');
			emit('end');
		} catch (e) {
			emit('error', e);
		}

		return () => (_aborted = true);
	});

	let _log: any = {};
	const unsub = s.subscribe((o) => {
		if (o.isStreaming && o.data) {
			// _log.push(o);
			let id = `${o.lastFetchStreamStart?.valueOf()}`;
			_log[id] ??= [];
			_log[id].push(o.data);
		}
	});

	const stop = await s.fetchStream([], 50);

	await sleep(120);

	stop();
	unsub();
	// clog(_log);

	const startTimestamps = Object.keys(_log).sort();
	assert(startTimestamps.length === 2);

	assert(_log[startTimestamps[0]].join() === '1,2');

	// here, the first "2" is a consequence of derivation from two stores ("meta" and "data")
	// where if meta is updated the derived value is still triggered
	assert(_log[startTimestamps[1]].join() === '2,3,4');
});

export default suite;
