import { expect } from 'chai'
import { mkdtemp, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  generate_volume_mounts,
  get_allowed_working_directories
} from '#libs-server/threads/volume-mount-generator.mjs'

const CONTAINER_USER_BASE_PATH = '/home/node/user-base'

describe('volume-mount-generator', () => {
  let tmp_dir
  let user_base_directory
  let user_data_directory

  before(async () => {
    tmp_dir = await mkdtemp(join(tmpdir(), 'volume-mount-test-'))
    user_base_directory = join(tmp_dir, 'user-base')
    user_data_directory = join(tmp_dir, 'user-data')

    // Create mock user-base structure with mountable directories
    await mkdir(join(user_base_directory, 'task'), { recursive: true })
    await mkdir(join(user_base_directory, 'text'), { recursive: true })
    await mkdir(join(user_base_directory, 'workflow'), { recursive: true })
    await mkdir(join(user_base_directory, 'data'), { recursive: true })

    // Create directories that should be blocked
    await mkdir(join(user_base_directory, 'config'), { recursive: true })
    await mkdir(join(user_base_directory, 'identity'), { recursive: true })
    await mkdir(join(user_base_directory, 'role'), { recursive: true })

    // Create user data directory
    await mkdir(join(user_data_directory, 'testuser', 'claude-home'), {
      recursive: true
    })
  })

  describe('generate_volume_mounts', () => {
    it('should generate mounts from thread_config.mounts', async () => {
      const thread_config = {
        mounts: [
          { source: 'task', mode: 'rw' },
          { source: 'text', mode: 'ro' }
        ]
      }

      const mounts = await generate_volume_mounts({
        username: 'testuser',
        thread_config,
        user_base_directory,
        user_data_directory,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      // Should include claude-home mount + 2 config mounts
      expect(mounts).to.have.lengthOf(3)

      const task_mount = mounts.find((m) => m.includes('/task:'))
      expect(task_mount).to.exist
      expect(task_mount).to.include(':cached')

      const text_mount = mounts.find((m) => m.includes('/text:'))
      expect(text_mount).to.exist
      expect(text_mount).to.include(':ro')
    })

    it('should always include claude-home volume mount', async () => {
      const thread_config = { mounts: [] }

      const mounts = await generate_volume_mounts({
        username: 'testuser',
        thread_config,
        user_base_directory,
        user_data_directory,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(mounts).to.have.lengthOf(1)
      expect(mounts[0]).to.include('claude-home')
      expect(mounts[0]).to.include('/home/node/.claude')
      expect(mounts[0]).to.include(':cached')
    })

    it('should reject mounts in never-mount safety list', async () => {
      const thread_config = {
        mounts: [
          { source: 'config', mode: 'ro' },
          { source: 'identity', mode: 'ro' },
          { source: 'role', mode: 'ro' },
          { source: 'task', mode: 'rw' }
        ]
      }

      const mounts = await generate_volume_mounts({
        username: 'testuser',
        thread_config,
        user_base_directory,
        user_data_directory,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      // Only claude-home + task should be mounted; config, identity, role rejected
      expect(mounts).to.have.lengthOf(2)

      const mount_string = mounts.join(' ')
      expect(mount_string).to.not.include('/config:')
      expect(mount_string).to.not.include('/identity:')
      expect(mount_string).to.not.include('/role:')
    })

    it('should reject subdirectories of never-mount directories', async () => {
      // Create a subdirectory of a never-mount dir
      await mkdir(join(user_base_directory, 'config', 'secrets'), {
        recursive: true
      })

      const thread_config = {
        mounts: [{ source: 'config/secrets', mode: 'ro' }]
      }

      const mounts = await generate_volume_mounts({
        username: 'testuser',
        thread_config,
        user_base_directory,
        user_data_directory,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      // Only claude-home mount; config/secrets should be rejected
      expect(mounts).to.have.lengthOf(1)
      expect(mounts[0]).to.include('claude-home')
    })

    it('should skip mounts where source path does not exist', async () => {
      const thread_config = {
        mounts: [
          { source: 'nonexistent-dir', mode: 'rw' },
          { source: 'task', mode: 'rw' }
        ]
      }

      const mounts = await generate_volume_mounts({
        username: 'testuser',
        thread_config,
        user_base_directory,
        user_data_directory,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      // claude-home + task only; nonexistent-dir skipped
      expect(mounts).to.have.lengthOf(2)
      const mount_string = mounts.join(' ')
      expect(mount_string).to.not.include('nonexistent-dir')
    })

    it('should use custom target path when provided', async () => {
      const thread_config = {
        mounts: [{ source: 'task', mode: 'rw', target: '/workspace/tasks' }]
      }

      const mounts = await generate_volume_mounts({
        username: 'testuser',
        thread_config,
        user_base_directory,
        user_data_directory,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      const task_mount = mounts.find((m) => m.includes('/task:'))
      expect(task_mount).to.exist
      expect(task_mount).to.include(':/workspace/tasks:')
    })

    it('should handle empty thread_config.mounts', async () => {
      const thread_config = {}

      const mounts = await generate_volume_mounts({
        username: 'testuser',
        thread_config,
        user_base_directory,
        user_data_directory,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(mounts).to.have.lengthOf(1)
      expect(mounts[0]).to.include('claude-home')
    })
  })

  describe('get_allowed_working_directories', () => {
    it('should derive directories from rw mounts only', () => {
      const thread_config = {
        mounts: [
          { source: 'task', mode: 'rw' },
          { source: 'text', mode: 'ro' },
          { source: 'workflow', mode: 'rw' }
        ]
      }

      const dirs = get_allowed_working_directories({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(dirs).to.have.lengthOf(2)
      expect(dirs).to.include(`${CONTAINER_USER_BASE_PATH}/task`)
      expect(dirs).to.include(`${CONTAINER_USER_BASE_PATH}/workflow`)
      expect(dirs).to.not.include(`${CONTAINER_USER_BASE_PATH}/text`)
    })

    it('should return empty array when no rw mounts exist', () => {
      const thread_config = {
        mounts: [
          { source: 'text', mode: 'ro' },
          { source: 'data', mode: 'ro' }
        ]
      }

      const dirs = get_allowed_working_directories({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(dirs).to.be.an('array')
      expect(dirs).to.have.lengthOf(0)
    })

    it('should return empty array when no mounts are configured', () => {
      const thread_config = {}

      const dirs = get_allowed_working_directories({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(dirs).to.be.an('array')
      expect(dirs).to.have.lengthOf(0)
    })

    it('should use custom target when provided in mount config', () => {
      const thread_config = {
        mounts: [{ source: 'task', mode: 'rw', target: '/workspace/tasks' }]
      }

      const dirs = get_allowed_working_directories({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(dirs).to.have.lengthOf(1)
      expect(dirs).to.include('/workspace/tasks')
    })

    it('should require container_user_base_path parameter', () => {
      const thread_config = {
        mounts: [{ source: 'task', mode: 'rw' }]
      }

      const dirs = get_allowed_working_directories({
        thread_config,
        container_user_base_path: '/mnt/user-base'
      })

      expect(dirs).to.have.lengthOf(1)
      expect(dirs[0]).to.equal('/mnt/user-base/task')
    })
  })
})
