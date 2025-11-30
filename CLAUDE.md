# Claude Code Context

This file provides context for Claude Code (Anthropic's CLI assistant) when working with this repository.

## Quick Start

Read [llm.txt](llm.txt) for comprehensive package documentation including:
- Package purpose and architecture
- Complete API reference (functions, types, methods)
- Usage patterns and examples
- Internal implementation details
- Testing and build commands

## Summary

`@marianmeres/fetch-store` is a reactive store for async fetch operations with:
- Svelte-compatible subscribe pattern
- Loading/error/success state tracking
- Silent fetching, caching, polling
- Request deduplication and abort support
- Streaming data sources (SSE, WebSocket)

## Key Files

- `src/mod.ts` - Main exports
- `src/types.ts` - Type definitions
- `src/fetch-store.ts` - FetchStore implementation
- `src/fetch-stream-store.ts` - FetchStreamStore implementation
- `tests/fetch-store.test.ts` - Test suite
