import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import {
  load_identity_by_public_key,
  load_identity_by_username,
  load_all_identities,
  clear_identity_cache
} from '#libs-server/users/identity-loader.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import {
  register_user_base_directory,
  clear_registered_directories
} from '#libs-server/base-uri/base-directory-registry.mjs'

describe('identity-loader', function () {
  this.timeout(10000)

  let temp_dir
  let identity_dir

  beforeEach(async () => {
    // Create temp directory structure
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'identity-loader-test-'))
    identity_dir = path.join(temp_dir, 'identity')
    await fs.mkdir(identity_dir, { recursive: true })

    // Register temp directory as user base
    clear_registered_directories()
    register_user_base_directory(temp_dir)

    // Clear cache before each test
    clear_identity_cache()
  })

  afterEach(async () => {
    clear_identity_cache()
    clear_registered_directories()
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  describe('load_identity_by_public_key', () => {
    it('should load identity by public key', async () => {
      const public_key = 'abc123def456'
      const identity_path = path.join(identity_dir, 'testuser.md')

      await write_entity_to_filesystem({
        absolute_path: identity_path,
        entity_properties: {
          title: 'testuser',
          auth_public_key: public_key,
          username: 'testuser',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000',
          permissions: { create_threads: true }
        },
        entity_type: 'identity',
        entity_content: '# Test User'
      })

      const result = await load_identity_by_public_key({ public_key })

      expect(result).to.not.be.null
      expect(result.username).to.equal('testuser')
      expect(result.auth_public_key).to.equal(public_key)
      expect(result.permissions.create_threads).to.be.true
    })

    it('should return null for non-existent public key', async () => {
      const result = await load_identity_by_public_key({
        public_key: 'nonexistent'
      })
      expect(result).to.be.null
    })

    it('should return null when public_key is null', async () => {
      const result = await load_identity_by_public_key({ public_key: null })
      expect(result).to.be.null
    })

    it('should use cache on subsequent calls', async () => {
      const public_key = 'cached123'
      const identity_path = path.join(identity_dir, 'cacheduser.md')

      await write_entity_to_filesystem({
        absolute_path: identity_path,
        entity_properties: {
          title: 'cacheduser',
          auth_public_key: public_key,
          username: 'cacheduser',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
        },
        entity_type: 'identity',
        entity_content: '# Cached User'
      })

      // First call - should load from filesystem
      const result1 = await load_identity_by_public_key({ public_key })
      expect(result1).to.not.be.null

      // Second call - should use cache
      const result2 = await load_identity_by_public_key({ public_key })
      expect(result2).to.not.be.null
      expect(result2.username).to.equal('cacheduser')
    })
  })

  describe('load_identity_by_username', () => {
    it('should load identity by username', async () => {
      const identity_path = path.join(identity_dir, 'findme.md')

      await write_entity_to_filesystem({
        absolute_path: identity_path,
        entity_properties: {
          title: 'findme',
          auth_public_key: 'key123',
          username: 'findme',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000',
          permissions: { global_write: true }
        },
        entity_type: 'identity',
        entity_content: '# Find Me'
      })

      const result = await load_identity_by_username({ username: 'findme' })

      expect(result).to.not.be.null
      expect(result.username).to.equal('findme')
      expect(result.auth_public_key).to.equal('key123')
      expect(result.permissions.global_write).to.be.true
    })

    it('should return null for non-existent username', async () => {
      const result = await load_identity_by_username({
        username: 'nonexistent'
      })
      expect(result).to.be.null
    })

    it('should return null when username is null', async () => {
      const result = await load_identity_by_username({ username: null })
      expect(result).to.be.null
    })
  })

  describe('load_all_identities', () => {
    it('should load all identity entities', async () => {
      // Create multiple identities
      const identities = [
        { username: 'user1', auth_public_key: 'key1' },
        { username: 'user2', auth_public_key: 'key2' },
        { username: 'user3', auth_public_key: 'key3' }
      ]

      for (const identity of identities) {
        const identity_path = path.join(identity_dir, `${identity.username}.md`)
        await write_entity_to_filesystem({
          absolute_path: identity_path,
          entity_properties: {
            title: identity.username,
            auth_public_key: identity.auth_public_key,
            username: identity.username,
            user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
          },
          entity_type: 'identity',
          entity_content: `# ${identity.username}`
        })
      }

      const result = await load_all_identities()

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(3)

      const usernames = result.map((i) => i.username)
      expect(usernames).to.include('user1')
      expect(usernames).to.include('user2')
      expect(usernames).to.include('user3')
    })

    it('should return empty array when no identities exist', async () => {
      const result = await load_all_identities()
      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(0)
    })

    it('should skip invalid identity files', async () => {
      // Create valid identity
      await write_entity_to_filesystem({
        absolute_path: path.join(identity_dir, 'valid.md'),
        entity_properties: {
          title: 'valid',
          auth_public_key: 'validkey',
          username: 'valid',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
        },
        entity_type: 'identity',
        entity_content: '# Valid'
      })

      // Create invalid file (missing required fields)
      await write_entity_to_filesystem({
        absolute_path: path.join(identity_dir, 'invalid.md'),
        entity_properties: {
          title: 'invalid',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
          // Missing auth_public_key and username
        },
        entity_type: 'identity',
        entity_content: '# Invalid'
      })

      const result = await load_all_identities()

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(1)
      expect(result[0].username).to.equal('valid')
    })
  })

  describe('clear_identity_cache', () => {
    it('should clear cache and reload from filesystem', async () => {
      const identity_path = path.join(identity_dir, 'cachetest.md')

      // Create initial identity
      await write_entity_to_filesystem({
        absolute_path: identity_path,
        entity_properties: {
          title: 'cachetest',
          auth_public_key: 'cachekey',
          username: 'cachetest',
          user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
        },
        entity_type: 'identity',
        entity_content: '# Cache Test'
      })

      // Load identity (populates cache)
      const result1 = await load_identity_by_username({ username: 'cachetest' })
      expect(result1).to.not.be.null

      // Clear cache
      clear_identity_cache()

      // Load again (should reload from filesystem)
      const result2 = await load_identity_by_username({ username: 'cachetest' })
      expect(result2).to.not.be.null
      expect(result2.username).to.equal('cachetest')
    })
  })
})
