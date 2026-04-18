/**
 * @fileoverview Regression tests for thread user_public_key filtering.
 *
 * Verifies that the user_public_key filter is correctly forwarded through
 * the embedded-index-manager query abstraction layer, preventing the
 * regression where all users' threads were returned.
 */

import { expect } from 'chai'
import { request } from '#tests/utils/test-request.mjs'

import server from '#server'
import {
  create_test_user,
  create_test_thread,
  create_temp_test_repo,
  reset_all_tables
} from '#tests/utils/index.mjs'
import {
  initialize_sqlite_client,
  close_sqlite_connection
} from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'
import { create_sqlite_schema } from '#libs-server/embedded-database-index/sqlite/sqlite-schema-definitions.mjs'
import { execute_sqlite_run } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

describe('Thread user_public_key filter', () => {
  let user_a
  let user_b
  let test_directories

  before(async () => {
    await reset_all_tables()
    await close_sqlite_connection()
    await initialize_sqlite_client({ in_memory: true })
    await create_sqlite_schema()
    user_a = await create_test_user()
    user_b = await create_test_user()
  })

  after(async () => {
    await close_sqlite_connection()
    await reset_all_tables()
  })

  beforeEach(async () => {
    await execute_sqlite_run({ query: 'DELETE FROM threads' })
    const test_repo = await create_temp_test_repo({
      prefix: 'thread-user-filter-',
      register_directories: true
    })
    test_directories = {
      system_path: test_repo.system_path,
      user_path: test_repo.user_path,
      cleanup: test_repo.cleanup
    }
  })

  afterEach(async () => {
    if (test_directories) {
      test_directories.cleanup()
    }
  })

  describe('GET /api/threads with user_public_key', () => {
    beforeEach(async () => {
      // Create threads for user A
      await create_test_thread({
        user_public_key: user_a.user_public_key,
        title: 'User A Thread 1',
        test_directories
      })
      await create_test_thread({
        user_public_key: user_a.user_public_key,
        title: 'User A Thread 2',
        test_directories
      })

      // Create thread for user B
      await create_test_thread({
        user_public_key: user_b.user_public_key,
        title: 'User B Thread 1',
        test_directories
      })
    })

    it('should return only threads for the specified user', async () => {
      const response = await request(server)
        .get('/api/threads')
        .query({
          user_public_key: user_a.user_public_key
        })
        .set('Authorization', `Bearer ${user_a.token}`)

      expect(response.status).to.equal(200)
      expect(response.body).to.be.an('array')

      // All returned threads should belong to user A
      for (const thread of response.body) {
        if (thread.user_public_key) {
          expect(thread.user_public_key).to.equal(user_a.user_public_key)
        }
      }
    })

    it('should not leak threads from other users', async () => {
      const response = await request(server)
        .get('/api/threads')
        .query({
          user_public_key: user_b.user_public_key
        })
        .set('Authorization', `Bearer ${user_b.token}`)

      expect(response.status).to.equal(200)
      expect(response.body).to.be.an('array')

      // Should not contain any of user A's threads
      const thread_titles = response.body.map((t) => t.title)
      expect(thread_titles).to.not.include('User A Thread 1')
      expect(thread_titles).to.not.include('User A Thread 2')
    })
  })
})
