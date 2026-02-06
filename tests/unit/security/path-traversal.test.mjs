import { expect } from 'chai'
import { create_base_uri_from_path } from '#libs-server/base-uri/index.mjs'

describe('Path Traversal Protection', () => {
  describe('create_base_uri_from_path', () => {
    const mockOptions = {
      system_base_directory: '/mock/system',
      user_base_directory: '/mock/user'
    }

    it('should reject path that matches prefix but is different directory', () => {
      // /mock/user2 should not match /mock/user
      expect(() =>
        create_base_uri_from_path('/mock/user2/task/file.md', mockOptions)
      ).to.throw(/Path outside managed repositories/)
    })

    it('should reject path with directory name collision', () => {
      // /mock/system-backup should not match /mock/system
      expect(() =>
        create_base_uri_from_path('/mock/system-backup/file.md', mockOptions)
      ).to.throw(/Path outside managed repositories/)
    })

    it('should allow exact base directory match', () => {
      const result = create_base_uri_from_path('/mock/user', mockOptions)
      expect(result).to.equal('user:')
    })

    it('should allow paths within base directory', () => {
      const result = create_base_uri_from_path(
        '/mock/user/task/my-task.md',
        mockOptions
      )
      expect(result).to.equal('user:task/my-task.md')
    })

    it('should handle system directory correctly', () => {
      const result = create_base_uri_from_path(
        '/mock/system/schema/task.md',
        mockOptions
      )
      expect(result).to.equal('sys:schema/task.md')
    })

    it('should reject system directory name collision', () => {
      // /mock/system123 should not match /mock/system
      expect(() =>
        create_base_uri_from_path('/mock/system123/file.md', mockOptions)
      ).to.throw(/Path outside managed repositories/)
    })
  })
})
