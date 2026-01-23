import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import {
  get_recent_entity_files,
  is_recent_files_enabled,
  get_recent_files_config
} from '#libs-server/search/recent-files.mjs'
import { DEFAULT_CONFIG, clear_config_cache } from '#libs-server/search/search-config.mjs'

describe('Recent Files Scanner', function () {
  this.timeout(10000)

  let temp_dir
  let original_user_base_directory

  beforeEach(async () => {
    // Store original config
    original_user_base_directory = process.env.USER_BASE_DIRECTORY

    // Create temporary directory structure
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'recent-files-test-'))

    // Set up test directories
    const directories = ['task', 'workflow', 'guideline', 'text', 'tag']
    for (const dir of directories) {
      await fs.mkdir(path.join(temp_dir, dir), { recursive: true })
    }

    // Set env variable for tests
    process.env.USER_BASE_DIRECTORY = temp_dir

    // Clear config cache before each test
    clear_config_cache()
  })

  afterEach(async () => {
    // Restore original config
    if (original_user_base_directory) {
      process.env.USER_BASE_DIRECTORY = original_user_base_directory
    } else {
      delete process.env.USER_BASE_DIRECTORY
    }

    // Clean up temp directory
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }

    // Clear config cache
    clear_config_cache()
  })

  describe('get_recent_entity_files', () => {
    it('should return empty array when no files exist', async () => {
      const result = await get_recent_entity_files({
        user_base_directory: temp_dir
      })
      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(0)
    })

    it('should find recently modified markdown files', async () => {
      // Create a recent file
      const file_path = path.join(temp_dir, 'task', 'test-task.md')
      await fs.writeFile(file_path, '# Test Task\n\nContent here.')

      const result = await get_recent_entity_files({
        user_base_directory: temp_dir
      })

      expect(result).to.have.lengthOf(1)
      expect(result[0].relative_path).to.equal('task/test-task.md')
      expect(result[0].absolute_path).to.equal(file_path)
      expect(result[0].entity_type).to.equal('task')
      expect(result[0].mtime).to.be.an.instanceof(Date)
    })

    it('should filter out files older than the time window', async () => {
      // Create a file
      const file_path = path.join(temp_dir, 'task', 'old-task.md')
      await fs.writeFile(file_path, '# Old Task')

      // Set mtime to 72 hours ago (outside default 48 hour window)
      const old_time = new Date(Date.now() - 72 * 60 * 60 * 1000)
      await fs.utimes(file_path, old_time, old_time)

      const result = await get_recent_entity_files({
        user_base_directory: temp_dir
      })

      expect(result).to.have.lengthOf(0)
    })

    it('should sort files by modification time (most recent first)', async () => {
      // Create files with different mtimes
      const file1 = path.join(temp_dir, 'task', 'task-1.md')
      const file2 = path.join(temp_dir, 'task', 'task-2.md')
      const file3 = path.join(temp_dir, 'task', 'task-3.md')

      await fs.writeFile(file1, '# Task 1')
      await fs.writeFile(file2, '# Task 2')
      await fs.writeFile(file3, '# Task 3')

      // Set different mtimes (all within window)
      const now = Date.now()
      await fs.utimes(file1, new Date(now - 1000), new Date(now - 1000))
      await fs.utimes(file2, new Date(now - 3000), new Date(now - 3000))
      await fs.utimes(file3, new Date(now - 2000), new Date(now - 2000))

      const result = await get_recent_entity_files({
        user_base_directory: temp_dir
      })

      expect(result).to.have.lengthOf(3)
      expect(result[0].relative_path).to.equal('task/task-1.md')
      expect(result[1].relative_path).to.equal('task/task-3.md')
      expect(result[2].relative_path).to.equal('task/task-2.md')
    })

    it('should respect the limit parameter', async () => {
      // Create multiple files
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(
          path.join(temp_dir, 'task', `task-${i}.md`),
          `# Task ${i}`
        )
      }

      const result = await get_recent_entity_files({
        user_base_directory: temp_dir,
        limit: 3
      })

      expect(result).to.have.lengthOf(3)
    })

    it('should respect the hours parameter', async () => {
      // Create files with different ages
      const recent_file = path.join(temp_dir, 'task', 'recent.md')
      const old_file = path.join(temp_dir, 'task', 'old.md')

      await fs.writeFile(recent_file, '# Recent')
      await fs.writeFile(old_file, '# Old')

      // Set old file to 12 hours ago
      const old_time = new Date(Date.now() - 12 * 60 * 60 * 1000)
      await fs.utimes(old_file, old_time, old_time)

      // Search with 6 hour window
      const result = await get_recent_entity_files({
        user_base_directory: temp_dir,
        hours: 6
      })

      expect(result).to.have.lengthOf(1)
      expect(result[0].relative_path).to.equal('task/recent.md')
    })

    it('should only scan specified directories', async () => {
      // Create file in task directory
      await fs.writeFile(path.join(temp_dir, 'task', 'task.md'), '# Task')

      // Create file in other directory (should be ignored)
      await fs.mkdir(path.join(temp_dir, 'other'))
      await fs.writeFile(path.join(temp_dir, 'other', 'other.md'), '# Other')

      const result = await get_recent_entity_files({
        user_base_directory: temp_dir,
        directories: ['task']
      })

      expect(result).to.have.lengthOf(1)
      expect(result[0].relative_path).to.equal('task/task.md')
    })

    it('should scan subdirectories recursively', async () => {
      // Create nested directory structure
      await fs.mkdir(path.join(temp_dir, 'task', 'project'), {
        recursive: true
      })
      await fs.writeFile(
        path.join(temp_dir, 'task', 'project', 'nested-task.md'),
        '# Nested Task'
      )

      const result = await get_recent_entity_files({
        user_base_directory: temp_dir
      })

      expect(result).to.have.lengthOf(1)
      expect(result[0].relative_path).to.equal('task/project/nested-task.md')
    })

    it('should ignore non-markdown files', async () => {
      await fs.writeFile(path.join(temp_dir, 'task', 'task.md'), '# Task')
      await fs.writeFile(path.join(temp_dir, 'task', 'task.txt'), 'Text file')
      await fs.writeFile(path.join(temp_dir, 'task', 'task.json'), '{}')

      const result = await get_recent_entity_files({
        user_base_directory: temp_dir
      })

      expect(result).to.have.lengthOf(1)
      expect(result[0].relative_path).to.equal('task/task.md')
    })

    it('should handle missing directories gracefully', async () => {
      // Remove one of the directories
      await fs.rmdir(path.join(temp_dir, 'tag'))

      // Should not throw, just skip the missing directory
      const result = await get_recent_entity_files({
        user_base_directory: temp_dir
      })
      expect(result).to.be.an('array')
    })

    it('should detect entity type from directory path', async () => {
      await fs.writeFile(path.join(temp_dir, 'task', 'task.md'), '# Task')
      await fs.writeFile(
        path.join(temp_dir, 'workflow', 'workflow.md'),
        '# Workflow'
      )
      await fs.writeFile(
        path.join(temp_dir, 'guideline', 'guideline.md'),
        '# Guideline'
      )

      const result = await get_recent_entity_files({
        user_base_directory: temp_dir
      })

      const entity_types = result.map((f) => f.entity_type)
      expect(entity_types).to.include('task')
      expect(entity_types).to.include('workflow')
      expect(entity_types).to.include('guideline')
    })
  })

  describe('is_recent_files_enabled', () => {
    it('should return true by default', async () => {
      const enabled = await is_recent_files_enabled()
      expect(enabled).to.be.true
    })
  })

  describe('get_recent_files_config', () => {
    it('should return default configuration', async () => {
      const config = await get_recent_files_config()

      expect(config).to.deep.include({
        enabled: true,
        hours: 48,
        limit: 50
      })
      expect(config.directories).to.include('task')
      expect(config.directories).to.include('workflow')
    })
  })

  describe('DEFAULT_CONFIG.recent_files', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_CONFIG.recent_files.enabled).to.be.true
      expect(DEFAULT_CONFIG.recent_files.hours).to.equal(48)
      expect(DEFAULT_CONFIG.recent_files.limit).to.equal(50)
      expect(DEFAULT_CONFIG.recent_files.directories).to.deep.equal([
        'task',
        'workflow',
        'guideline',
        'text',
        'tag'
      ])
    })
  })
})
