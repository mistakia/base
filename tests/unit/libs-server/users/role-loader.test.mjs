import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import {
  load_role,
  load_all_roles,
  clear_role_cache
} from '#libs-server/users/role-loader.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import {
  register_user_base_directory,
  clear_registered_directories
} from '#libs-server/base-uri/base-directory-registry.mjs'

describe('role-loader', function () {
  this.timeout(10000)

  let temp_dir
  let role_dir

  beforeEach(async () => {
    // Create temp directory structure
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'role-loader-test-'))
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

  describe('load_role', () => {
    it('should load role by base_uri', async () => {
      const role_path = path.join(role_dir, 'admin.md')

      await write_entity_to_filesystem({
        absolute_path: role_path,
        entity_properties: {
          title: 'Admin',
          base_uri: 'user:role/admin.md',
          user_public_key:
            '0000000000000000000000000000000000000000000000000000000000000000',
          rules: [{ action: 'allow', pattern: '**/*' }]
        },
        entity_type: 'role',
        entity_content: '# Admin Role'
      })

      const result = await load_role({ base_uri: 'user:role/admin.md' })

      expect(result).to.not.be.null
      expect(result.title).to.equal('Admin')
      expect(result.rules).to.be.an('array')
      expect(result.rules).to.have.lengthOf(1)
      expect(result.rules[0].action).to.equal('allow')
      expect(result.rules[0].pattern).to.equal('**/*')
    })

    it('should return null for non-existent role', async () => {
      const result = await load_role({ base_uri: 'user:role/nonexistent.md' })
      expect(result).to.be.null
    })

    it('should return null when base_uri is null', async () => {
      const result = await load_role({ base_uri: null })
      expect(result).to.be.null
    })

    it('should load role with multiple rules', async () => {
      const role_path = path.join(role_dir, 'reader.md')

      await write_entity_to_filesystem({
        absolute_path: role_path,
        entity_properties: {
          title: 'Reader',
          base_uri: 'user:role/reader.md',
          user_public_key:
            '0000000000000000000000000000000000000000000000000000000000000000',
          rules: [
            { action: 'allow', pattern: 'user:task/**' },
            { action: 'deny', pattern: 'user:private/**', reason: 'private' },
            { action: 'allow', pattern: 'sys:system/**' }
          ]
        },
        entity_type: 'role',
        entity_content: '# Reader Role'
      })

      const result = await load_role({ base_uri: 'user:role/reader.md' })

      expect(result).to.not.be.null
      expect(result.rules).to.have.lengthOf(3)
      expect(result.rules[1].reason).to.equal('private')
    })

    it('should use cache on subsequent calls', async () => {
      const role_path = path.join(role_dir, 'cached.md')

      await write_entity_to_filesystem({
        absolute_path: role_path,
        entity_properties: {
          title: 'Cached',
          base_uri: 'user:role/cached.md',
          user_public_key:
            '0000000000000000000000000000000000000000000000000000000000000000',
          rules: [{ action: 'allow', pattern: '*' }]
        },
        entity_type: 'role',
        entity_content: '# Cached Role'
      })

      // First call
      const result1 = await load_role({ base_uri: 'user:role/cached.md' })
      expect(result1).to.not.be.null

      // Second call - should use cache
      const result2 = await load_role({ base_uri: 'user:role/cached.md' })
      expect(result2).to.not.be.null
      expect(result2.title).to.equal('Cached')
    })
  })

  describe('load_all_roles', () => {
    it('should load all role entities', async () => {
      const roles = [
        { name: 'admin', rules: [{ action: 'allow', pattern: '**/*' }] },
        {
          name: 'reader',
          rules: [{ action: 'allow', pattern: 'user:task/**' }]
        },
        { name: 'writer', rules: [{ action: 'allow', pattern: 'user:**' }] }
      ]

      for (const role of roles) {
        const role_path = path.join(role_dir, `${role.name}.md`)
        await write_entity_to_filesystem({
          absolute_path: role_path,
          entity_properties: {
            title: role.name,
            base_uri: `user:role/${role.name}.md`,
            user_public_key:
              '0000000000000000000000000000000000000000000000000000000000000000',
            rules: role.rules
          },
          entity_type: 'role',
          entity_content: `# ${role.name}`
        })
      }

      const result = await load_all_roles()

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(3)

      const titles = result.map((r) => r.title)
      expect(titles).to.include('admin')
      expect(titles).to.include('reader')
      expect(titles).to.include('writer')
    })

    it('should return empty array when no roles exist', async () => {
      const result = await load_all_roles()
      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(0)
    })

    it('should skip invalid role files', async () => {
      // Create valid role
      await write_entity_to_filesystem({
        absolute_path: path.join(role_dir, 'valid.md'),
        entity_properties: {
          title: 'valid',
          base_uri: 'user:role/valid.md',
          user_public_key:
            '0000000000000000000000000000000000000000000000000000000000000000',
          rules: [{ action: 'allow', pattern: '*' }]
        },
        entity_type: 'role',
        entity_content: '# Valid'
      })

      // Create invalid file (missing required rules)
      await write_entity_to_filesystem({
        absolute_path: path.join(role_dir, 'invalid.md'),
        entity_properties: {
          title: 'invalid',
          base_uri: 'user:role/invalid.md',
          user_public_key:
            '0000000000000000000000000000000000000000000000000000000000000000'
          // Missing rules
        },
        entity_type: 'role',
        entity_content: '# Invalid'
      })

      const result = await load_all_roles()

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(1)
      expect(result[0].title).to.equal('valid')
    })
  })

  describe('clear_role_cache', () => {
    it('should clear cache and reload from filesystem', async () => {
      const role_path = path.join(role_dir, 'cachetest.md')

      await write_entity_to_filesystem({
        absolute_path: role_path,
        entity_properties: {
          title: 'cachetest',
          base_uri: 'user:role/cachetest.md',
          user_public_key:
            '0000000000000000000000000000000000000000000000000000000000000000',
          rules: [{ action: 'allow', pattern: '*' }]
        },
        entity_type: 'role',
        entity_content: '# Cache Test'
      })

      // Load role (populates cache)
      const result1 = await load_role({ base_uri: 'user:role/cachetest.md' })
      expect(result1).to.not.be.null

      // Clear cache
      clear_role_cache()

      // Load again (should reload from filesystem)
      const result2 = await load_role({ base_uri: 'user:role/cachetest.md' })
      expect(result2).to.not.be.null
      expect(result2.title).to.equal('cachetest')
    })
  })
})
