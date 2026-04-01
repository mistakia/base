# Tests Directory

This directory contains the test suite for the Base system.

## Test Framework

- **Framework**: Mocha 10.x with Chai assertion library
- **Pattern**: All test files use `.test.mjs` extension (ES modules)
- **Assertions**: Use Chai's `expect` style

## Running Tests

```bash
# Run all tests
yarn test:all

# Run specific test suites
yarn test:unit          # Unit tests only
yarn test:integration   # Integration tests only
yarn test:api          # API endpoint tests
yarn test:git          # Git operations tests
yarn test:sync         # Synchronization tests
yarn test:threads      # Thread system tests
yarn test:markdown     # Markdown processing tests
yarn test:embedded-db  # Embedded database tests
yarn test:mcp          # MCP server tests

# Run a single test file
yarn test:file ./tests/unit/path/to/test.mjs

# Run tests matching a pattern
yarn test -- --grep "test name"

# Run with minimal output (more token efficient)
yarn test:all --reporter min
```

## Directory Structure

```
tests/
  unit/                    # Unit tests - isolated function testing
    activity/             # Activity score calculations
    active-sessions/      # Session management
    base-uri/             # URI resolution and registry
    components/           # React component unit tests
    embedded-database-index/  # DuckDB index tests
    entity/               # Entity CRUD operations
      filesystem/         # Filesystem storage
      git/                # Git storage
    filesystem/           # Low-level filesystem operations
    git/                  # Git operations
    guideline/            # Guideline loading
    inference-providers/  # LLM provider interfaces
    integrations/         # External system integrations
      claude/             # Claude session processing
      github/             # GitHub integration
      thread/             # Thread data processing
    libs-server/          # Server library functions
    libs-shared/          # Shared library functions
    markdown/             # Markdown processing
    metadata/             # Metadata extraction
    prompts/              # Prompt generation
    repository/           # Repository management
    sync/                 # Data synchronization
    threads/              # Thread creation/management
    tools/                # Tool registry
    utils/                # Utility functions
    workflow/             # Workflow loading
  integration/            # Integration tests - multi-component testing
    api/                  # API endpoint tests
    claude/               # Claude integration tests
    embedded-database-index/  # Full index tests
    file/                 # File operation tests
    github/               # GitHub webhook tests
    mcp/                  # MCP server tests
    metadata/             # Metadata analysis tests
    thread/               # Thread storage tests
  fixtures/               # Test data and mock files
  utils/                  # Test utility functions
  validation/             # Schema validation tests
```

## Writing Tests

### Standard Test Structure

```javascript
import { expect } from 'chai'
// Import functions under test
import { my_function } from '#libs-server/path/to/module.mjs'

describe('Module Name', function () {
  // Optional: increase timeout for slow operations
  this.timeout(10000)

  // Setup/teardown
  before(async function () {
    // Run once before all tests in this describe block
  })

  after(async function () {
    // Run once after all tests
  })

  beforeEach(async function () {
    // Run before each test
  })

  afterEach(async function () {
    // Run after each test
  })

  describe('function_name', () => {
    it('should do expected behavior', async () => {
      const result = await my_function(input)
      expect(result).to.equal(expected)
    })

    it('should handle edge case', async () => {
      expect(() => my_function(bad_input)).to.throw('error message')
    })
  })
})
```

### Chai Assertion Patterns

```javascript
// Equality
expect(value).to.equal(expected)
expect(value).to.deep.equal({ key: 'value' })
expect(value).to.be.null
expect(value).to.be.undefined
expect(value).to.be.true
expect(value).to.be.false

// Type checking
expect(value).to.be.a('string')
expect(value).to.be.an('object')
expect(value).to.be.an('array')

// Object properties
expect(obj).to.have.property('key')
expect(obj).to.have.property('key', 'value')
expect(obj).to.include({ key: 'value' })

// Arrays
expect(array).to.have.lengthOf(3)
expect(array).to.include('item')
expect(array).to.be.empty

// Errors
expect(() => fn()).to.throw()
expect(() => fn()).to.throw('message')
expect(() => fn()).to.throw(ErrorType)

// Async
await expect(asyncFn()).to.be.rejectedWith('message')
```

### Test Utilities

Common utilities in `tests/utils/`:

- `test-request.mjs` - Fetch-based HTTP test helper for API integration tests (`request(server).get('/api/foo').set('Authorization', 'Bearer x').query({ q: 'bar' })`)
- `create-temp-test-repo.mjs` - Create temporary git repositories for testing
- `create-test-user.mjs` - Generate test user with public key
- Additional helpers for specific test scenarios

### Import Aliases

Use the project's import aliases for cleaner imports:

```javascript
import { function_name } from '#libs-server/module.mjs'
import { shared_function } from '#libs-shared/module.mjs'
import test_util from '#tests/utils/test-util.mjs'
```

## Environment Variables

Tests automatically set:

- `NODE_ENV=test`
- `CONFIG_ENCRYPTION_KEY` - Test encryption key
- `TEST=all` - Full test mode flag

Debug output can be enabled with:

```bash
DEBUG='module:*' bun run test:unit
```

## Testing Philosophy

See [[sys:system/guideline/testing-philosophy.md]] for the full testing philosophy covering real behavior over mocks, infrastructure detection, conditional skipping, pending test hygiene, and parameter injection for testability.

## Conventions

1. **One describe block per module** - Group related tests under a single top-level `describe`
2. **Descriptive test names** - Use `should...` pattern for test descriptions
3. **Clean up resources** - Use `after`/`afterEach` hooks to clean up temp files, repos, etc.
4. **Isolate tests** - Tests should not depend on each other's state
5. **Use fixtures** - Place reusable test data in `tests/fixtures/`
6. **Async/await** - Prefer async/await over callbacks or raw promises
