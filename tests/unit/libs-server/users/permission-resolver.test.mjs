import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import {
  resolve_user_rules,
  get_identity_permissions,
  convert_identity_to_user
} from '#libs-server/users/permission-resolver.mjs'
import { clear_role_cache } from '#libs-server/users/role-loader.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import {
  register_user_base_directory,
  clear_registered_directories
} from '#libs-server/base-uri/base-directory-registry.mjs'

describe('permission-resolver', function () {
  this.timeout(10000)

  let temp_dir
  let role_dir

  beforeEach(async () => {
    // Create temp directory structure
    temp_dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'permission-resolver-test-')
    )
    role_dir = path.join(temp_dir, 'role')
    await fs.mkdir(role_dir, { recursive: true })

    // Register temp directory as user base
    clear_registered_directories()
    register_user_base_directory(temp_dir)

    // Clear cache before each test
    clear_role_cache()
  })

  afterEach(async () => {
    clear_role_cache()
    clear_registered_directories()
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  describe('resolve_user_rules', () => {
    it('should return empty array for null identity', async () => {
      const result = await resolve_user_rules({ identity: null })
      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(0)
    })

    it('should return user-specific rules', async () => {
      const identity = {
        username: 'testuser',
        base_uri: 'user:identity/testuser.md',
        rules: [
          { action: 'allow', pattern: 'user:task/**' },
          { action: 'deny', pattern: 'user:private/**' }
        ]
      }

      const result = await resolve_user_rules({ identity })

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(2)
      expect(result[0].action).to.equal('allow')
      expect(result[0].pattern).to.equal('user:task/**')
      expect(result[0].source).to.equal('identity')
      expect(result[1].action).to.equal('deny')
      expect(result[1].source).to.equal('identity')
    })

    it('should load and include role rules', async () => {
      // Create role
      await write_entity_to_filesystem({
        absolute_path: path.join(role_dir, 'reader.md'),
        entity_properties: {
          title: 'Reader',
          base_uri: 'user:role/reader.md',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000',
          rules: [
            { action: 'allow', pattern: 'sys:system/**' },
            { action: 'allow', pattern: 'user:workflow/**' }
          ]
        },
        entity_type: 'role',
        entity_content: '# Reader'
      })

      const identity = {
        username: 'testuser',
        base_uri: 'user:identity/testuser.md',
        relations: ['has_role [[user:role/reader.md]]']
      }

      const result = await resolve_user_rules({ identity })

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(2)
      expect(result[0].source).to.equal('role')
      expect(result[0].source_uri).to.equal('user:role/reader.md')
    })

    it('should merge user rules with role rules in correct order', async () => {
      // Create role
      await write_entity_to_filesystem({
        absolute_path: path.join(role_dir, 'basic.md'),
        entity_properties: {
          title: 'Basic',
          base_uri: 'user:role/basic.md',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000',
          rules: [{ action: 'allow', pattern: 'sys:system/**' }]
        },
        entity_type: 'role',
        entity_content: '# Basic'
      })

      const identity = {
        username: 'testuser',
        base_uri: 'user:identity/testuser.md',
        rules: [{ action: 'allow', pattern: 'user:task/**' }],
        relations: ['has_role [[user:role/basic.md]]']
      }

      const result = await resolve_user_rules({ identity })

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(2)

      // User rules should come first
      expect(result[0].source).to.equal('identity')
      expect(result[0].pattern).to.equal('user:task/**')

      // Role rules should come after
      expect(result[1].source).to.equal('role')
      expect(result[1].pattern).to.equal('sys:system/**')
    })

    it('should handle multiple roles in relation order', async () => {
      // Create roles
      await write_entity_to_filesystem({
        absolute_path: path.join(role_dir, 'role1.md'),
        entity_properties: {
          title: 'Role1',
          base_uri: 'user:role/role1.md',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000',
          rules: [{ action: 'allow', pattern: 'pattern1' }]
        },
        entity_type: 'role',
        entity_content: '# Role1'
      })

      await write_entity_to_filesystem({
        absolute_path: path.join(role_dir, 'role2.md'),
        entity_properties: {
          title: 'Role2',
          base_uri: 'user:role/role2.md',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000',
          rules: [{ action: 'allow', pattern: 'pattern2' }]
        },
        entity_type: 'role',
        entity_content: '# Role2'
      })

      const identity = {
        username: 'testuser',
        base_uri: 'user:identity/testuser.md',
        relations: [
          'has_role [[user:role/role1.md]]',
          'has_role [[user:role/role2.md]]'
        ]
      }

      const result = await resolve_user_rules({ identity })

      expect(result).to.have.lengthOf(2)
      // Roles should be in relation order
      expect(result[0].pattern).to.equal('pattern1')
      expect(result[1].pattern).to.equal('pattern2')
    })

    it('should handle non-existent roles gracefully', async () => {
      const identity = {
        username: 'testuser',
        base_uri: 'user:identity/testuser.md',
        rules: [{ action: 'allow', pattern: 'user:task/**' }],
        relations: ['has_role [[user:role/nonexistent.md]]']
      }

      const result = await resolve_user_rules({ identity })

      // Should still return user rules even if role doesn't exist
      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(1)
      expect(result[0].pattern).to.equal('user:task/**')
    })
  })

  describe('get_identity_permissions', () => {
    it('should return default permissions for null identity', () => {
      const result = get_identity_permissions({ identity: null })

      expect(result.create_threads).to.be.false
      expect(result.global_write).to.be.false
    })

    it('should return permissions from identity', () => {
      const identity = {
        username: 'testuser',
        permissions: {
          create_threads: true,
          global_write: true
        }
      }

      const result = get_identity_permissions({ identity })

      expect(result.create_threads).to.be.true
      expect(result.global_write).to.be.true
    })

    it('should handle missing permissions object', () => {
      const identity = {
        username: 'testuser'
      }

      const result = get_identity_permissions({ identity })

      expect(result.create_threads).to.be.false
      expect(result.global_write).to.be.false
    })

    it('should handle partial permissions', () => {
      const identity = {
        username: 'testuser',
        permissions: {
          create_threads: true
          // global_write not set
        }
      }

      const result = get_identity_permissions({ identity })

      expect(result.create_threads).to.be.true
      expect(result.global_write).to.be.false
    })
  })

  describe('convert_identity_to_user', () => {
    it('should return null for null identity', async () => {
      const result = await convert_identity_to_user({ identity: null })
      expect(result).to.be.null
    })

    it('should convert identity to user object', async () => {
      const identity = {
        username: 'testuser',
        base_uri: 'user:identity/testuser.md',
        created_at: '2025-01-01T00:00:00.000Z',
        permissions: {
          create_threads: true,
          global_write: false
        },
        rules: [{ action: 'allow', pattern: 'user:task/**' }]
      }

      const result = await convert_identity_to_user({ identity })

      expect(result).to.not.be.null
      expect(result.username).to.equal('testuser')
      expect(result.created_at).to.equal('2025-01-01T00:00:00.000Z')
      expect(result.permissions.create_threads).to.be.true
      expect(result.permissions.global_write).to.be.false
      expect(result.permissions.rules).to.be.an('array')
      expect(result.permissions.rules).to.have.lengthOf(1)
    })

    it('should include resolved role rules in user object', async () => {
      // Create role
      await write_entity_to_filesystem({
        absolute_path: path.join(role_dir, 'testrole.md'),
        entity_properties: {
          title: 'TestRole',
          base_uri: 'user:role/testrole.md',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000',
          rules: [{ action: 'allow', pattern: 'sys:system/**' }]
        },
        entity_type: 'role',
        entity_content: '# TestRole'
      })

      const identity = {
        username: 'testuser',
        base_uri: 'user:identity/testuser.md',
        created_at: '2025-01-01T00:00:00.000Z',
        relations: ['has_role [[user:role/testrole.md]]']
      }

      const result = await convert_identity_to_user({ identity })

      expect(result.permissions.rules).to.have.lengthOf(1)
      expect(result.permissions.rules[0].source).to.equal('role')
    })
  })
})
