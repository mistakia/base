import { expect } from 'chai'

import {
  sync_session_fallback_by_file,
  sync_session_fallback_by_glob
} from '#server/services/threads/job-worker.mjs'

describe('job-worker sync_session_fallback', function () {
  this.timeout(10000)

  describe('sync_session_fallback_by_file', () => {
    it('should be exported as a function', () => {
      expect(sync_session_fallback_by_file).to.be.a('function')
    })

    it('should handle missing session file gracefully', async () => {
      const job = {
        id: 'test-job-1',
        data: {
          session_id: 'nonexistent-session-id',
          working_directory: '/tmp/nonexistent-workdir',
          execution_mode: 'host',
          user_public_key: 'test-key'
        }
      }
      const source_overrides = { execution_mode: 'host' }

      // Should not throw - errors are caught internally
      await sync_session_fallback_by_file({
        job,
        source_overrides,
        session_id: job.data.session_id
      })
    })
  })

  describe('sync_session_fallback_by_glob', () => {
    it('should be exported as a function', () => {
      expect(sync_session_fallback_by_glob).to.be.a('function')
    })

    it('should handle nonexistent projects directory gracefully', async () => {
      const job = {
        id: 'test-job-2',
        data: {
          working_directory: '/tmp/nonexistent-glob-dir',
          execution_mode: 'host',
          user_public_key: 'test-key'
        }
      }
      const source_overrides = { execution_mode: 'host' }

      // Should not throw - errors are caught internally
      await sync_session_fallback_by_glob(job, source_overrides)
    })

    it('should handle container_user mode without username gracefully', async () => {
      const job = {
        id: 'test-job-3',
        data: {
          working_directory: '/tmp/test',
          execution_mode: 'container_user',
          username: undefined,
          user_public_key: 'test-key'
        }
      }
      const source_overrides = { execution_mode: 'container_user' }

      // Should not throw - errors are caught internally
      await sync_session_fallback_by_glob(job, source_overrides)
    })
  })
})
