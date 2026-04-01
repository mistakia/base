---
title: Testing Philosophy
type: guideline
description: >-
  Principles for writing tests that exercise real behavior over mocks, with infrastructure
  detection, conditional skipping, and parameter injection for testability
base_uri: sys:system/guideline/testing-philosophy.md
created_at: '2026-03-31T03:02:45.620Z'
entity_id: c161b08b-5db9-45fe-8522-af0bfa4c094b
globs:
  - tests/**/*.test.mjs
public_read: false
relations:
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
updated_at: '2026-03-31T03:02:45.620Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Testing Philosophy

## Test Real Behavior

Tests MUST exercise real code paths against real infrastructure whenever possible. Mocking (nock, sinon stubs, fake implementations) provides false confidence because it only verifies that the test author's assumptions match the code, not that the code actually works.

- **Prefer real dependencies**: If Redis, PostgreSQL, or an external service is available in the test environment, tests SHOULD use it directly
- **Detect and adapt**: When infrastructure may or may not be present, detect availability at test time and branch behavior accordingly rather than mocking the dependency
- **Conditional skip over fake pass**: When infrastructure is genuinely unavailable, use `this.skip()` to produce an honest pending result rather than mocking to produce a fake pass

## Infrastructure-Dependent Tests

Tests that require external infrastructure (databases, Redis, Docker, external services) MUST use `this.skip()` when the dependency is unavailable. The skip condition SHOULD be checked once in a `before()` hook, not repeated in every test.

When adding infrastructure config to `config-test.json` to enable skipped tests:

- Verify the tests exercise meaningful logic with the test config values
- Check that existing tests are not affected by the new config (functions reading global config may change behavior)
- Use the parameter injection pattern to let tests control config-dependent behavior

## Pending Test Hygiene

Every pending test in the suite MUST have a reachable code path where it runs. If a test is permanently skipped in every environment, it is dead code and SHOULD be removed or the test config SHOULD be updated to enable it.

Do not commit `describe.skip` blocks or `it()` calls with empty bodies as placeholders for future tests. Empty stubs inflate the pending count and provide no value. Write the test when the implementation exists.

## Middleware and Global State

Tests that import the production server inherit all middleware. Middleware using global state (rate limiters, caches) MUST be skipped or reset in test mode to prevent cross-test interference.

When a function reads from global config, prefer adding an optional parameter that defaults to the config value. This lets tests pass explicit values without modifying global state:

```javascript
// Testable: parameter injection with config default
export const generate_mounts = async ({ accounts_config = config.claude_accounts }) => { ... }

// Coupled to global state, requires config manipulation to test
export const generate_mounts = async () => { const accounts = config.claude_accounts; ... }
```

## Bun Runtime Considerations

Tests run under Bun (`bun node_modules/.bin/mocha`). Known differences from Node.js:

- **nock does not work** -- nock patches Node.js `http`/`https` modules, but Bun uses its own native `fetch`. HTTP mocking tests that use nock will silently fail (interceptors never match). Per the "Do Not Use Mocks" principle, prefer testing against real infrastructure over HTTP mocking.
- **HTTP test helper** -- API integration tests use `tests/utils/test-request.mjs`, a lightweight fetch-based helper that replaced chai-http (which had TLS incompatibilities with Bun). The helper starts the server on an ephemeral port per request.
- **`promisify` on Promise-returning functions** -- Modern packages (e.g., `glob`) return Promises natively. `promisify(fn)` on such functions hangs under Bun because the callback is never called. Use the async API directly.
- **Filesystem mtime granularity** -- Bun's I/O can be fast enough that sequential writes produce identical `mtimeMs` values. Tests relying on mtime changes for conflict detection need explicit `fs.utimes()` to force distinct timestamps.
