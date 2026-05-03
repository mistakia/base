---
title: Writing Software Tests
type: guideline
description: Guidelines for writing effective and maintainable tests across unit, integration, and E2E levels
base_uri: sys:system/guideline/write-software-tests.md
created_at: '2025-05-27T18:10:20.240Z'
entity_id: 1eaa2062-7bfb-4f05-a2da-7e358210e995
globs:
  - tests/**/*
observations:
  - '[principle] Avoiding stubbing creates more reliable tests #reliability'
  - '[strategy] Proper test structure improves readability and maintainability #structure'
  - '[standard] Consistent database management ensures test isolation #isolation'
public_read: true
updated_at: '2026-01-05T19:25:11.815Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:32:11.391Z'
---

# Writing Software Tests

## Current Testing Approach

The codebase currently uses the following testing structure and tools:

- **Testing Framework**: Mocha with Chai assertions and fetch-based test helper (`tests/utils/test-request.mjs`) for API testing
- **Test Types**:
  - Unit tests (`tests/unit/`): Test individual functions and components in isolation
  - Integration tests (`tests/integration/`): Test API endpoints and interactions between components
  - E2E tests (`tests/e2e/`): End-to-end test scenarios (currently empty)
- **Utilities**:
  - Database reset (`reset-all-tables.mjs`)
  - Test user creation (`create-test-user.mjs`)
  - Custom setup scripts

## Guidelines

1. **Do Not Use Mocks or Stubs**
   - Always write tests that interact with real implementations
   - Use the actual database with proper setup/teardown instead of in-memory or fake databases
   - For external services that cannot be directly tested (third-party APIs, etc.), create test doubles that simulate the real behavior rather than using mocks/stubs

2. **Test Structure**
   - Group tests logically with descriptive `describe` blocks
   - Write clear test case descriptions using `it` statements
   - Keep tests focused on a single unit of functionality
   - Follow the Arrange-Act-Assert pattern in test cases

3. **Database Management**
   - Use the `reset_all_tables` utility between test suites
   - Ensure each test starts with a known database state
   - Clean up created data after tests complete

4. **Test Data**
   - Use fixtures for complex test data
   - Generate random test data when uniqueness is required
   - Keep test data minimal and focused on the test case
   - For code that parses or normalizes an external format, derive fixtures from real captured external data, never from the implementation's own output. Implementation-derived fixtures will pass even when the parser is wrong about the format.

5. **Assertions**
   - Use specific assertions rather than generic ones (`.equal` instead of `.ok`)
   - Check for specific properties and values in API responses
   - Include meaningful error messages with assertions

6. **API Testing**
   - Test all API endpoints and their success/error cases
   - Validate response status codes, headers, and payload
   - Test authentication and authorization scenarios

7. **Maintainability**
   - Keep tests focused and concise
   - Extract common setup into before/beforeEach hooks
   - Use test utilities for repetitive tasks
   - Avoid test interdependence (tests should run in any order)

8. **Performance**
   - Group related tests to minimize setup/teardown overhead
   - Optimize database operations in tests
   - Consider using parallel test execution when appropriate

9. **Coverage**
   - Aim for high test coverage but prioritize critical paths
   - Test edge cases and error conditions
   - Include regression tests for fixed bugs

10. **Continuous Integration**
    - Ensure all tests pass before merging code
    - Monitor test execution time to prevent test suite slowdown
    - Review test results regularly to address flaky tests

By following these guidelines, we ensure our test suite remains effective, maintainable, and provides confidence in our codebase.
