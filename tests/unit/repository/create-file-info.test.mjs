import { expect } from 'chai'
import { create_file_info } from '#libs-server/repository/create-file-info.mjs'
import { setup_test_directories } from '#tests/utils/setup-test-directories.mjs'

describe('create_file_info', () => {
  let test_dirs

  beforeEach(async () => {
    // Setup test directories with registry
    test_dirs = setup_test_directories()
  })

  afterEach(async () => {
    // Clean up test directories
    if (test_dirs) {
      test_dirs.cleanup()
    }
  })

  describe('base_uri generation', () => {
    it('should create sys: URI for system repository files', () => {
      const file_info = create_file_info({
        repo_path: test_dirs.system_path,
        relative_path: 'schema/task.md',
        absolute_path: `${test_dirs.system_path}/schema/task.md`
      })

      expect(file_info.base_uri).to.equal('sys:schema/task.md')
    })

    it('should create user: URI for user repository files', () => {
      const file_info = create_file_info({
        repo_path: test_dirs.user_path,
        relative_path: 'task/my-task.md',
        absolute_path: `${test_dirs.user_path}/task/my-task.md`
      })

      expect(file_info.base_uri).to.equal('user:task/my-task.md')
    })

    it('should handle nested paths correctly', () => {
      const file_info = create_file_info({
        repo_path: test_dirs.system_path,
        relative_path: 'system/workflow/test-workflow.md',
        absolute_path: `${test_dirs.system_path}/system/workflow/test-workflow.md`
      })

      expect(file_info.base_uri).to.equal(
        'sys:system/workflow/test-workflow.md'
      )
    })

    it('should handle paths with leading/trailing slashes', () => {
      const file_info = create_file_info({
        repo_path: test_dirs.user_path,
        relative_path: '/task/my-task.md/',
        absolute_path: `${test_dirs.user_path}/task/my-task.md`
      })

      expect(file_info.base_uri).to.equal('user:task/my-task.md')
    })
  })

  describe('file info properties', () => {
    it('should include all required properties', () => {
      const file_info = create_file_info({
        repo_path: test_dirs.system_path,
        relative_path: 'schema/task.md',
        absolute_path: `${test_dirs.system_path}/schema/task.md`
      })

      expect(file_info).to.have.property('repo_path', test_dirs.system_path)
      expect(file_info).to.have.property('git_relative_path', 'schema/task.md')
      expect(file_info).to.have.property(
        'absolute_path',
        `${test_dirs.system_path}/schema/task.md`
      )
      expect(file_info).to.have.property('base_uri', 'sys:schema/task.md')
    })

    it('should preserve extra properties passed in', () => {
      const file_info = create_file_info({
        repo_path: test_dirs.system_path,
        relative_path: 'schema/task.md',
        absolute_path: `${test_dirs.system_path}/schema/task.md`,
        git_sha: 'abc123',
        branch: 'main',
        custom_property: 'test_value'
      })

      expect(file_info).to.have.property('git_sha', 'abc123')
      expect(file_info).to.have.property('branch', 'main')
      expect(file_info).to.have.property('custom_property', 'test_value')
    })

    it('should work with user repository', () => {
      const file_info = create_file_info({
        repo_path: test_dirs.user_path,
        relative_path: 'text/notes.md',
        absolute_path: `${test_dirs.user_path}/text/notes.md`
      })

      expect(file_info.base_uri).to.equal('user:text/notes.md')
    })
  })

  describe('error handling', () => {
    it('should throw error for paths outside registered repositories', () => {
      expect(() => {
        create_file_info({
          repo_path: '/some/external/path',
          relative_path: 'file.md',
          absolute_path: '/some/external/path/file.md'
        })
      }).to.throw('Path outside managed repositories not supported')
    })
  })
})
