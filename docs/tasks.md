# Tasks

## Add a Method to FetchStore

### Steps

1. Add the method signature to `FetchStore<T, A>` in [src/types.ts](../src/types.ts). Document params + return with JSDoc.
2. Implement inside `createFetchStore` in [src/fetch-store.ts](../src/fetch-store.ts).
3. Export from the returned object at the bottom of `createFetchStore`.
4. Add a test in [tests/fetch-store.test.ts](../tests/fetch-store.test.ts) covering happy path + at least one edge case (abort-during, reset-during).
5. Update [API.md](../API.md) with the new method.
6. Add a bullet to [CHANGELOG.md](../CHANGELOG.md) under the next unreleased section.

### Checklist

- [ ] Post-await writes guarded by `_generation` token
- [ ] Superseded-request check if the new method is abortable
- [ ] `_inflightPromise` / `_inflightSilentPromise` updated if the method joins or produces one
- [ ] Test mirrors existing A-numbered regression pattern

## Fix a Meta Bug

### Steps

1. Write a failing test first — name it `A<next-number>` and place near related regressions.
2. Locate the meta-write site. Prefer reading `_metaStore.get()` once, spreading `...prev`, then writing back.
3. Verify the three guard clauses apply (generation, controller-is-current, `_aborted` for streams).
4. Add a CHANGELOG entry under "Bug fixes" with `(file — brief; test Aₙ.)` reference.

### Template for regression test

```ts
Deno.test("Aₙ — <description>", async () => {
    const s = createFetchStore<T>(/* smallest worker */);
    // ... action
    // ... assertion on meta after action
});
```

## Release

### Patch release (bug-fix only)

```bash
deno task rp
```

Runs `deno task release -y && deno task publish` — bumps patch, publishes to JSR and NPM.

### Minor release (new features, BC-safe behavior changes)

```bash
deno task rpm
```

### Pre-release checklist

- [ ] All tests green: `deno task test`
- [ ] [CHANGELOG.md](../CHANGELOG.md) "Unreleased" section reflects every behavior change
- [ ] [API.md](../API.md) matches current exports
- [ ] [README.md](../README.md) examples compile against current signatures
- [ ] Version in [deno.json](../deno.json) is ONLY bumped by the release script — do not edit manually

## Migrate a Breaking Change

### Steps

1. Add a migration note under "Breaking changes" in [CHANGELOG.md](../CHANGELOG.md) with before/after snippet.
2. If the change renames a type, keep the old name as a type alias with `@deprecated` JSDoc for at least one minor release.
3. Update [README.md](../README.md) usage examples.
4. Bump **minor** (or major if SemVer requires it — only if runtime behavior people depended on changes).
