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

		// Count one entry per actual fetch (silent fetches now bump successCounter,
		// so we dedupe subscriber fires via the counter rather than raw notifications).
		const _log: any[] = [];
		let _lastSuccess = 0;
		const unsub = s.subscribe((o) => {
			if (o.data && o.successCounter !== _lastSuccess) {
				_lastSuccess = o.successCounter;
				_log.push(o);
			}
		});

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

// ---- A1: aborted fetch must reset isFetching ----

Deno.test(
	{ name: "A1: manual abort clears isFetching", sanitizeResources: false, sanitizeOps: false },
	async () => {
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

	const p = s.fetch();
	await sleep(10);
	assert(s.get().isFetching, "isFetching should be true mid-flight");

	s.abort();
	await p;

	assertEquals(s.get().isFetching, false, "isFetching must be cleared after abort");
	assertEquals(s.get().lastFetchError, null, "abort should not set lastFetchError");
	assert(s.get().lastFetchEnd !== null, "lastFetchEnd must be set after abort");
	}
);

// ---- A2: fetchSilent updates timestamps + successCounter so fetchOnceSilent caches ----

Deno.test("A2: fetchSilent advances lastFetchStart and successCounter", async () => {
	let calls = 0;
	const s = createFetchStore(async () => {
		calls++;
		return { v: calls };
	});

	await s.fetchSilent();

	assert(s.get().lastFetchStart !== null, "silent fetch sets lastFetchStart");
	assert(s.get().lastFetchEnd !== null, "silent fetch sets lastFetchEnd");
	assertEquals(s.get().successCounter, 1, "silent fetch bumps successCounter");
	// isFetching must remain false — the whole point of "silent"
	assertEquals(s.get().isFetching, false);
});

Deno.test("A2: fetchOnceSilent caches within threshold", async () => {
	let calls = 0;
	const s = createFetchStore(async () => ({ v: ++calls }));

	await s.fetchOnceSilent([], 300_000);
	await s.fetchOnceSilent([], 300_000);
	await s.fetchOnceSilent([], 300_000);

	assertEquals(calls, 1, "threshold must prevent re-fetch");
	assertEquals(s.get().successCounter, 1);
});

Deno.test("A2: fetchOnceSilent refetches after threshold expires", async () => {
	let calls = 0;
	const s = createFetchStore(async () => ({ v: ++calls }));

	await s.fetchOnceSilent([], 2);
	await sleep(5);
	await s.fetchOnceSilent([], 2);

	assertEquals(calls, 2);
});

// ---- A3: FetchStreamStore.reset must stop the running stream ----

Deno.test(
	{ name: "A3: stream reset stops the worker", sanitizeResources: false, sanitizeOps: false },
	async () => {
		let _stopped = false;
		const s = createFetchStreamStore((emit) => {
			(async () => {
				// never emits "end"
				while (!_stopped) {
					await sleep(20);
					if (!_stopped) emit("data", Math.random());
				}
			})();
			return () => {
				_stopped = true;
			};
		});

		s.fetchStream();
		await sleep(50);

		assert(!_stopped, "stream should still be running");

		s.reset();

		assert(_stopped, "reset() must invoke the worker cleanup function");
		assertEquals(s.get().data, null);
		assertEquals(s.get().isFetching, false);
	}
);

// ---- A4: emit("end") must not wipe a prior error ----

Deno.test(
	{ name: "A4: error then end preserves lastFetchError", sanitizeResources: false, sanitizeOps: false },
	async () => {
		const s = createFetchStreamStore((emit) => {
			(async () => {
				await sleep(5);
				emit("error", new Error("boom"));
				emit("end");
			})();
			return () => {};
		});

		const stop = s.fetchStream();
		await sleep(30);
		stop();

		assert(s.get().lastFetchError, "lastFetchError must survive a following end event");
		assertEquals(s.get().lastFetchError?.message, "boom");
		assertEquals(s.get().isFetching, false);
	}
);

// ---- A5: stream worker that throws synchronously must not leave isFetching stuck ----

Deno.test("A5: synchronous worker throw resets isFetching", () => {
	const s = createFetchStreamStore(() => {
		throw new Error("sync fail");
	});

	s.fetchStream();

	assertEquals(s.get().isFetching, false, "sync throw must reset isFetching");
	assert(s.get().lastFetchError, "sync throw must be captured as error");
	assertEquals(s.get().lastFetchError?.message, "sync fail");
});

// ---- A6: reset during a non-abortable in-flight fetch must not be overwritten ----

Deno.test(
	{ name: "A6: reset wins over a late non-abortable response", sanitizeResources: false, sanitizeOps: false },
	async () => {
		const s = createFetchStore(async () => {
			await sleep(50);
			return { v: 42 };
		});

		const p = s.fetch();
		await sleep(10);
		s.reset();

		await p;

		assertEquals(s.get().data, null, "reset state must not be overwritten by late response");
		assertEquals(s.get().successCounter, 0);
		assertEquals(s.get().isFetching, false);
	}
);

// ---- A7: fetchOnce must join an in-flight request instead of returning stale data ----

Deno.test(
	{ name: "A7: fetchOnce joins in-flight fetch", sanitizeResources: false, sanitizeOps: false },
	async () => {
		let calls = 0;
		const s = createFetchStore(async () => {
			calls++;
			await sleep(50);
			return { v: calls };
		});

		const p1 = s.fetch();
		await sleep(5);
		// At this point isFetching=true and data is still null.
		// Old behavior returned null immediately. New behavior must join p1.
		const p2 = s.fetchOnce();

		const [r1, r2] = await Promise.all([p1, p2]);

		assertEquals(calls, 1, "only one fetch should have run");
		assertEquals((r1 as any).v, 1);
		assertEquals((r2 as any).v, 1);
	}
);

// ---- C3: concurrent fetchOnce calls must dedupe to a single fetch ----

Deno.test("C3: concurrent fetchOnce on a cold store dedupes", async () => {
	let calls = 0;
	const s = createFetchStore(async () => {
		calls++;
		await sleep(20);
		return { v: calls };
	});

	const [a, b, c] = await Promise.all([
		s.fetchOnce(),
		s.fetchOnce(),
		s.fetchOnce(),
	]);

	assertEquals(calls, 1, "cold concurrent fetchOnce must dedupe");
	assertEquals((a as any).v, 1);
	assertEquals((b as any).v, 1);
	assertEquals((c as any).v, 1);
});

// ---- C6: stream worker emits after stop() are ignored ----

Deno.test(
	{ name: "C6: emit after stop() is ignored", sanitizeResources: false, sanitizeOps: false },
	async () => {
		let rogueEmit: ((name: any, data?: any) => void) | null = null;

		const s = createFetchStreamStore((emit) => {
			rogueEmit = emit;
			return () => {};
		});

		const stop = s.fetchStream();
		stop();

		// Simulate an ill-behaved worker that keeps emitting after cancel.
		rogueEmit!("data", { leak: true });
		rogueEmit!("error", new Error("ignored"));

		assertEquals(s.get().data, null, "post-stop data emit must be ignored");
		assertEquals(s.get().lastFetchError, null, "post-stop error emit must be ignored");
	}
);

// ---- Argument-type inference (B2) ----

Deno.test("B2: worker argument types are inferred on fetch/fetchSilent", async () => {
	const s = createFetchStore(async (id: string, n: number) => ({ id, n }));

	// If the generic A did not propagate, these calls would still typecheck as
	// `unknown[]` — but compile-time checking at least ensures the inferred
	// arity matches. Runtime behavior is the real assertion here.
	const r = await s.fetch("abc", 7);
	assertEquals(r?.id, "abc");
	assertEquals(r?.n, 7);

	const r2 = await s.fetchSilent("xyz", 2);
	assertEquals(r2?.id, "xyz");
});

// ---- Recursive polling can now use non-silent fetch (C5) ----

Deno.test(
	{ name: "C5: fetchRecursive with silent:false flips isFetching", sanitizeResources: false, sanitizeOps: false },
	async () => {
		let flips = 0;
		const s = createFetchStore(async () => {
			await sleep(10);
			return { v: 1 };
		});

		const unsub = s.subscribe((v) => {
			if (v.isFetching) flips++;
		});

		const stop = s.fetchRecursive([], 30, { silent: false });
		await sleep(80);
		stop();
		unsub();

		assert(flips >= 2, `expected visible isFetching flips, got ${flips}`);
	}
);
