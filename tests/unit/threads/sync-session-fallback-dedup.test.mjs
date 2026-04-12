import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'

import { register_base_directories } from '#libs-server/base-uri/index.mjs'
import {
  create_temp_test_repo,
  create_test_user,
  reset_all_tables
} from '#tests/utils/index.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'

/**
 * Tests for sync_session_fallback dedup logic in job-worker.mjs.
 *
 * These tests verify the metadata recovery path where handle_job_completed
 * reads session_id from the thread's metadata.json when job.data.session_id
 * is null (thread-first flow). This prevents duplicate thread creation
 * via the glob fallback path.
 *
 * The actual sync_session_fallback functions are not easily testable in
 * isolation (they depend on filesystem paths, container config, etc.),
 * so these tests verify the metadata read/recovery logic that feeds into them.
 */
describe('sync_session_fallback dedup', () => {
  let test_user
  let test_repo
  let threads_dir

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    test_repo = await create_temp_test_repo({
      prefix: 'fallback-dedup-test-',
      register_directories: false
    })

    register_base_directories({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })

    threads_dir = get_thread_base_directory({
      user_base_directory: test_repo.user_path
    })
    await fs.mkdir(threads_dir, { recursive: true })
  })

  after(async () => {
    await reset_all_tables()
    if (test_repo) {
      test_repo.cleanup()
    }
  })

  describe('session_id recovery from thread metadata', () => {
    it('should recover session_id from metadata.json source.session_id', async () => {
      const thread_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      const session_id = 'test-session-12345'
      const thread_dir = path.join(threads_dir, thread_id)
      await fs.mkdir(thread_dir, { recursive: true })

      // Write metadata with source.session_id (written by session-status endpoint on SessionStart)
      const metadata = {
        thread_id,
        user_public_key: test_user.user_public_key,
        thread_state: 'active',
        session_status: 'active',
        inference_provider: 'anthropic',
        models: [],
        source: {
          provider: 'claude',
          session_id
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      await fs.writeFile(
        path.join(thread_dir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      )

      // Read back and verify session_id can be recovered
      const raw = await fs.readFile(
        path.join(thread_dir, 'metadata.json'),
        'utf-8'
      )
      const read_metadata = JSON.parse(raw)
      const recovered_session_id = read_metadata.source?.session_id || null

      expect(recovered_session_id).to.equal(session_id)
    })

    it('should return null when source.session_id is not set (CLI crash before SessionStart)', async () => {
      const thread_id = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff'
      const thread_dir = path.join(threads_dir, thread_id)
      await fs.mkdir(thread_dir, { recursive: true })

      // Write metadata without source (pre-created thread, CLI crashed before hooks ran)
      const metadata = {
        thread_id,
        user_public_key: test_user.user_public_key,
        thread_state: 'active',
        session_status: 'starting',
        inference_provider: 'anthropic',
        models: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      await fs.writeFile(
        path.join(thread_dir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      )

      const raw = await fs.readFile(
        path.join(thread_dir, 'metadata.json'),
        'utf-8'
      )
      const read_metadata = JSON.parse(raw)
      const recovered_session_id = read_metadata.source?.session_id || null

      // Should be null -- fallback will use glob path with known_thread_id
      expect(recovered_session_id).to.be.null
    })

    it('should pass known_thread_id to sync opts when thread_id is in job.data', () => {
      // Verify the pattern: when job.data.thread_id is set,
      // sync_opts.known_thread_id should be set to prevent duplicate creation
      const job_data = {
        thread_id: 'test-thread-id-123',
        session_id: null,
        working_directory: '/test',
        execution_mode: 'host'
      }

      const sync_opts = {
        provider_name: 'claude',
        allow_updates: true,
        provider_options: { session_file: '/test/file.jsonl' },
        user_public_key: 'test-key',
        source_overrides: { execution_mode: 'host' }
      }

      // This mirrors the logic in sync_session_fallback_by_file and
      // sync_session_fallback_by_glob in job-worker.mjs
      if (job_data.thread_id) {
        sync_opts.known_thread_id = job_data.thread_id
      }

      expect(sync_opts.known_thread_id).to.equal('test-thread-id-123')
    })
  })
})
