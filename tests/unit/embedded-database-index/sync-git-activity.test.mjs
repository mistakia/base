/* global describe, it */

import { expect } from 'chai'

/**
 * Unit tests for sync-git-activity module.
 *
 * Note: The main sync functions (sync_git_activity_incremental,
 * backfill_git_activity_from_scratch) require real SQLite and git repos.
 * Full integration tests are in tests/integration/embedded-database-index/.
 *
 * These unit tests verify module loading and basic contracts.
 */

describe('sync-git-activity', () => {
  it('should load module successfully with valid config', async () => {
    // Module loading validates config.user_base_directory
    const module =
      await import('#libs-server/embedded-database-index/sync/sync-git-activity.mjs')
    expect(module).to.have.property('sync_git_activity_incremental')
    expect(module).to.have.property('backfill_git_activity_from_scratch')
  })
})

describe('sqlite-activity-queries', () => {
  it('should load module successfully', async () => {
    const module =
      await import('#libs-server/embedded-database-index/sqlite/sqlite-activity-queries.mjs')
    expect(module).to.have.property('query_git_activity_daily')
    expect(module).to.have.property('upsert_git_activity_daily')
    expect(module).to.have.property('query_thread_activity_aggregated')
    expect(module).to.have.property('query_tasks_from_entities')
  })
})
