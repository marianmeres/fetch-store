import { assert, assertEquals } from "@std/assert";
import {
	createFetchStore,
	createFetchStreamStore,
} from "../src/fetch-store.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test("basic flow", async () => {
	const s = createFetchStore(async () => ({ foo: "baz" }), { foo: "bar" });
	// clog(s.get());

	assertEquals(s.get().data?.foo, "bar");
	assertEquals(s.get().lastFetchError, null);
	assertEquals(s.get().lastFetchStart, null);
	assertEquals(s.get().successCounter, 0);

	await s.fetch();

	// clog(s.get());
	assertEquals(s.get().data?.foo, "baz");
	assertEquals(s.get().lastFetchError, null);
	assert(s.get().lastFetchStart);
	assertEquals(s.get().successCounter, 1);

	// unsub();
});

Deno.test("error handling works", async () => {
	let i = 0;
	let e = 0;
	const s = createFetchStore<{ foo: string } | boolean>(
		async () => {
			if (!i++) throw new Error();
			return true;
		},
		{ foo: "bar" }
	);

	const unsub = s.subscribe(({ lastFetchError }) => {
		if (lastFetchError) e++;
	});

	await s.fetch();

	assert(s.get().lastFetchError);
	assert(s.get().lastFetchStart);
	assertEquals(s.get().successCounter, 0);

	await s.fetch();

	assertEquals(s.get().lastFetchError, null);
	assert(s.get().lastFetchStart);
	assertEquals(s.get().successCounter, 1);

	assertEquals(e, 1);

	unsub();
});

Deno.test("reset error test", async () => {
	const s = createFetchStore(async () => {
		throw new Error();
	});
	await s.fetch();
	assert(s.get().lastFetchError);
	s.resetError();
	assertEquals(s.get().lastFetchError, null);
});

Deno.test("subscribe", async () => {
	let counter = 0;
	let result = 0;
	let isFetchingCounter = 0;

	const s = createFetchStore<{ counter: number }>(async () => ({
		counter: ++counter,
	}));

	const unsub = s.subscribe((v) => {
		result = v.data?.counter ?? 0;
		isFetchingCounter += Number(v.isFetching);
	});

	await s.fetch();
	await s.fetch();
	await s.fetch();

	//
	assertEquals(result, 3);
	assert(isFetchingCounter >= 3);

	unsub();
});

Deno.test("subscribe & fetch silent", async () => {
	let counter = 0;
	let result = 0;
	let isFetchingCounter = 0;

	const s = createFetchStore<{ counter: number }>(async () => ({
		counter: ++counter,
	}));

	const unsub = s.subscribe((v) => {
		result = v.data?.counter ?? 0;
		isFetchingCounter += Number(v.isFetching);
	});

	await s.fetchSilent();
	await s.fetchSilent();
	await s.fetchSilent();

	//
	assertEquals(result, 3);
	assertEquals(isFetchingCounter, 0);

	unsub();
});

Deno.test("create data factory", async () => {
	let counter = 0;
	let result = 0;

	const s = createFetchStore<{ counter: number }>(
		async () => ({ counter: ++counter }),
		{ counter },
		{ dataFactory: (data, _old) => ({ counter: data.counter * 1000 }) }
	);

	const unsub = s.subscribe((v) => {
		result = v.data?.counter ?? 0;
	});

	await s.fetch();
	await s.fetch();
	await s.fetch();

	assertEquals(result, 3000);
	assertEquals(s.get().successCounter, 3);

	unsub();
});

Deno.test("fetch once works", async () => {
	let counter = 0;
	let result = 0;

	const s = createFetchStore<{ counter: number }>(async () => ({
		counter: ++counter,
	}));

	const unsub = s.subscribe((v) => (result = v.data?.counter ?? 0));

	await s.fetchOnce([null], 2);
	await s.fetchOnce([null], 2); // ignored
	await sleep(5);
	await s.fetchOnce([null], 2);
	await s.fetchOnce([null], 2); // ignored

	assertEquals(result, 2);
	assertEquals(counter, 2);
	assertEquals(s.get().successCounter, 2);

	await sleep(10);

	// now hack the internal timer, so it thinks it just fetched
	s.touch();

	// these must be no-op
	await s.fetchOnce([null], 5);
	await s.fetchOnce([null], 5);
	await s.fetchOnce([null], 5);

	// these stay unchanged
	assertEquals(result, 2);
	assertEquals(counter, 2);

	// only successCounter is increased (the touch increases it)
	assertEquals(s.get().successCounter, 3);

	// now again, slightly different
	await sleep(6); // reset
	s.getInternalDataStore().set({ counter: 123 });
	assertEquals(s.get().data?.counter, 123);

	// now fetchingOnce will resume the counter (the 123 is trashed)
	await s.fetchOnce([null], 5);
	assertEquals(s.get().data?.counter, 3);

	// but not if we do the same with touch...
	await sleep(6); // reset
	s.touch({ counter: 123 }); // by touching the internal clock we trick the fetchOnce below
	await s.fetchOnce([null], 5);
	assertEquals(s.get().data?.counter, 123); // THIS IS THE THING: counter IS NOT 3 as above

	unsub();
});

Deno.test("internal data store hackings", async () => {
	const s = createFetchStore<any>(async () => ({ foo: "bar" }));
	await s.fetch();
	assertEquals(s.get().data.foo, "bar");
	s.getInternalDataStore().set({ hey: "ho" });
	assertEquals(s.get().data.hey, "ho");

	// reset test
	s.reset();
	assertEquals(s.get().data, null);
	assertEquals(s.get().successCounter, 0);
});

Deno.test(
	{
		name: "fetchRecursive basic flow works",
		sanitizeResources: false,
		sanitizeOps: false,
	},
	async () => {
		let _counter = 0;
		const s = createFetchStore(async () => ++_counter);

		const _log: any[] = [];
		const unsub = s.subscribe((o) => o.data && _log.push(o));

		const stop = s.fetchRecursive([], 50);

		await sleep(130);
		stop();
		unsub();
		// clog(_log);

		// first poll | second poll | third poll
		//      sleep      |  sleep      |  stop
		assert(_log.length >= 2 && _log.length <= 4, `expected 2-4 logs, got ${_log.length}`);
	}
);

Deno.test(
	{
		name: "fetchRecursive immediate stop",
		sanitizeResources: false,
		sanitizeOps: false,
	},
	async () => {
		let _counter = 0;
		const s = createFetchStore(async () => ++_counter);

		const _log: any[] = [];
		const unsub = s.subscribe((o) => o.data && _log.push(o));

		const stop = s.fetchRecursive([], 100);

		stop();
		unsub();

		// clog(_log);
		assertEquals(_log.length, 0);
	}
);

Deno.test(
	{ name: "fetchStream", sanitizeResources: false, sanitizeOps: false },
	async () => {
		let _aborted = false;
		let _counter = 0;
		const s = createFetchStreamStore((emit, _fetchArgs) => {
			let _times = 3;
			(async () => {
				while (--_times) {
					if (_aborted) break;
					await sleep(50);
					if (_aborted) break;
					emit("data", ++_counter);
				}
				emit("end");
			})();

			return () => (_aborted = true);
		});

		const _log: any[] = [];
		const unsub = s.subscribe((o) => _log.push(o));

		const stop = s.fetchStream();

		await sleep(120);

		// clog(_log);
		stop();
		unsub();

		assert(_aborted);

		// 1 initial, 1 meta stream start, 2 data emits, 1 meta stream end
		assertEquals(_log.length, 5);

		//
		assert(_log.at(-1).lastFetchEnd - _log.at(-1).lastFetchStart >= 100); // 2 * 50
	}
);

Deno.test(
	{
		name: "fetchStream recursive",
		sanitizeResources: false,
		sanitizeOps: false,
	},
	async () => {
		let _aborted = false;
		let _counter = 0;

		const s = createFetchStreamStore((emit, _fetchArgs) => {
			let _times = 3;
			(async () => {
				while (--_times) {
					await sleep(10);
					if (_aborted) break;
					emit("data", ++_counter);
					// clog(_counter);
				}
				emit("end");
				// clog('end', Date.now());
			})();
			return () => (_aborted = true);
		});

		const _log: Record<string, number[]> = {};
		const unsub = s.subscribe((o) => {
			// clog(o);
			if (o.isFetching && o.lastFetchStart && o.data) {
				const id = o.lastFetchStart.valueOf();
				_log[id] ??= [];
				_log[id].push(o.data as number);
			}
		});

		const stop = s.fetchStream([], 10);

		// set some more than 3 x 2 x 10
		await sleep(200);
		// clog(_slept);

		stop();
		unsub();
		// clog(_log);

		const startTimestamps = Object.keys(_log).sort();
		assert(startTimestamps.length > 3);

		// check first 3
		assertEquals(_log[startTimestamps[0]].join(), "1,2");
		// here, the first "2" is a consequence of derivation from two stores ("meta" and "data")
		// where if meta is updated the derived value is still triggered
		assertEquals(_log[startTimestamps[1]].join(), "2,3,4");
		assertEquals(_log[startTimestamps[2]].join(), "4,5,6");
		// ...
	}
);

Deno.test(
	{
		name: "dedupeInflight returns same promise for concurrent calls",
		sanitizeResources: false,
		sanitizeOps: false,
	},
	async () => {
		let fetchCount = 0;
		const s = createFetchStore(
			async () => {
				fetchCount++;
				await sleep(50);
				return { value: fetchCount };
			},
			null,
			{ dedupeInflight: true }
		);

		// Start multiple fetches concurrently
		const p1 = s.fetch();
		const p2 = s.fetch();
		const p3 = s.fetch();

		// All promises should be the same instance
		assert(p1 === p2, "p1 and p2 should be the same promise");
		assert(p2 === p3, "p2 and p3 should be the same promise");

		await Promise.all([p1, p2, p3]);

		// Only one actual fetch should have occurred
		assertEquals(fetchCount, 1);
		assertEquals(s.get().successCounter, 1);
	}
);

Deno.test("dedupeInflight allows new fetch after previous completes", async () => {
	let fetchCount = 0;
	const s = createFetchStore(
		async () => {
			fetchCount++;
			await sleep(10);
			return { value: fetchCount };
		},
		null,
		{ dedupeInflight: true }
	);

	await s.fetch();
	assertEquals(fetchCount, 1);

	await s.fetch();
	assertEquals(fetchCount, 2);

	assertEquals(s.get().successCounter, 2);
});

Deno.test("dedupeInflight works for fetchSilent", async () => {
	let fetchCount = 0;
	const s = createFetchStore(
		async () => {
			fetchCount++;
			await sleep(50);
			return { value: fetchCount };
		},
		null,
		{ dedupeInflight: true }
	);

	const p1 = s.fetchSilent();
	const p2 = s.fetchSilent();

	assert(p1 === p2, "silent promises should be deduplicated");

	await Promise.all([p1, p2]);
	assertEquals(fetchCount, 1);
});

Deno.test("abortable passes signal to worker", async () => {
	let receivedSignal: AbortSignal | null = null;

	const s = createFetchStore(
		async (...args: unknown[]) => {
			receivedSignal = args[0] as AbortSignal;
			await sleep(10);
			return { done: true };
		},
		null,
		{ abortable: true }
	);

	await s.fetch();

	assert(receivedSignal !== null, "signal should be passed to worker");
	assert((receivedSignal as AbortSignal) instanceof AbortSignal, "should be an AbortSignal");
});

Deno.test("abortable aborts previous request on new fetch", async () => {
	const signals: AbortSignal[] = [];

	const s = createFetchStore(
		async (...args: unknown[]) => {
			const signal = args[0] as AbortSignal;
			signals.push(signal);
			await sleep(100);
			return { done: true };
		},
		null,
		{ abortable: true }
	);

	// Start first fetch (will be aborted)
	const p1 = s.fetch();

	// Wait a bit, then start second fetch (aborts first)
	await sleep(20);
	const p2 = s.fetch();

	// Wait for both to settle
	await Promise.allSettled([p1, p2]);

	// First signal should be aborted
	assert(signals[0].aborted, "first request should be aborted");
	// Second should complete (not aborted)
	assertEquals(signals[1].aborted, false);
});

Deno.test("manual abort() cancels in-flight request", async () => {
	let signalRef: AbortSignal | null = null;

	const s = createFetchStore(
		async (...args: unknown[]) => {
			signalRef = args[0] as AbortSignal;
			await sleep(100);
			return { done: true };
		},
		null,
		{ abortable: true }
	);

	const fetchPromise = s.fetch();

	await sleep(10);
	s.abort();

	await fetchPromise;

	assert(signalRef !== null, "signal should be set");
	assert((signalRef as AbortSignal).aborted, "signal should be aborted after manual abort()");
});

Deno.test("aborted request does not update lastFetchError", async () => {
	const s = createFetchStore(
		async (...args: unknown[]) => {
			const signal = args[0] as AbortSignal;
			await sleep(100);
			signal.throwIfAborted();
			return { done: true };
		},
		null,
		{ abortable: true }
	);

	const p1 = s.fetch();
	await sleep(10);
	s.abort();

	await p1;

	// Abort errors should not be stored
	assertEquals(s.get().lastFetchError, null);
});

Deno.test(
	{
		name: "reset clears inflight promises and aborts",
		sanitizeResources: false,
		sanitizeOps: false,
	},
	async () => {
		let signalRef: AbortSignal | null = null;

		const s = createFetchStore(
			async (...args: unknown[]) => {
				signalRef = args[0] as AbortSignal;
				await sleep(100);
				return { done: true };
			},
			null,
			{ abortable: true, dedupeInflight: true }
		);

		s.fetch();
		await sleep(10);

		s.reset();

		assert(signalRef !== null, "signal should be set");
		assert((signalRef as AbortSignal).aborted, "reset should abort in-flight request");
		assertEquals(s.get().data, null);
		assertEquals(s.get().successCounter, 0);
	}
);
