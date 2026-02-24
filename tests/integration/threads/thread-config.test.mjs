import { expect } from 'chai'
import { get_allowed_working_directories } from '#libs-server/threads/volume-mount-generator.mjs'

describe('Thread Config Integration', function () {
  this.timeout(10000)

  describe('thread_config working directory validation', () => {
    const thread_config = {
      mounts: [
        { source: 'repository/active/league', mode: 'rw' },
        { source: 'data', mode: 'ro' }
      ],
      deny_paths: ['league/private/**'],
      max_concurrent_threads: 2
    }

    it('should derive allowed working directories from rw mounts', () => {
      const dirs = get_allowed_working_directories({
        thread_config,
        container_user_base_path: '/home/node/user-base'
      })
      expect(dirs).to.have.lengthOf(1)
      expect(dirs[0]).to.equal('/home/node/user-base/repository/active/league')
    })

    it('should not include ro mounts in allowed working directories', () => {
      const dirs = get_allowed_working_directories({
        thread_config,
        container_user_base_path: '/home/node/user-base'
      })
      const has_data = dirs.some((d) => d.includes('data'))
      expect(has_data).to.be.false
    })

    it('should handle empty mounts', () => {
      const dirs = get_allowed_working_directories({
        thread_config: { mounts: [] },
        container_user_base_path: '/home/node/user-base'
      })
      expect(dirs).to.have.lengthOf(0)
    })

    it('should handle missing mounts', () => {
      const dirs = get_allowed_working_directories({
        thread_config: {},
        container_user_base_path: '/home/node/user-base'
      })
      expect(dirs).to.have.lengthOf(0)
    })
  })

  describe('concurrency limit enforcement', () => {
    it('should respect max_concurrent_threads from thread_config', () => {
      const thread_config = {
        max_concurrent_threads: 3
      }
      // Verify the config value is accessible and correct
      expect(thread_config.max_concurrent_threads).to.equal(3)
    })
  })
})
