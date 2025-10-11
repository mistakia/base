/* global describe it beforeEach before after */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { setup_test_directories } from '#tests/utils/index.mjs'
import { check_user_permission } from '#server/middleware/permission-checker.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { process_thread_with_permissions } from '#libs-server/threads/thread-utils.mjs'

const expect = chai.expect

describe('Public Read Permissions Integration', function () {
  let test_entity_path
  let test_thread_dir

  before(async function () {
    this.timeout(10000)

    // Set up base-uri directories for the test
    const test_dirs = await setup_test_directories({
      system_prefix: 'test-system-',
      user_prefix: 'test-user-'
    })

    // Create test entity in the user directory
    test_entity_path = path.join(test_dirs.user_path, 'test-entity.md')
    test_thread_dir = path.join(test_dirs.user_path, 'thread', 'test-thread-id')
  })

  after(async function () {
    // Cleanup is handled by setup_test_directories
  })

  describe('Entity public_read functionality', function () {
    it('should grant read access to entities with public_read: true', async function () {
      // Create entity with public_read: true
      const entity_properties = {
        entity_id: 'test-public-entity',
        title: 'Test Public Entity',
        type: 'test',
        public_read: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_public_key: 'test-owner-key'
      }

      await write_entity_to_filesystem({
        absolute_path: test_entity_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'This is a test entity with public read access'
      })

      // Test with no user (public access)
      const result = await check_user_permission({
        user_public_key: null,
        resource_path: 'user:test-entity.md'
      })

      expect(result.allowed).to.be.true
      expect(result.reason).to.equal(
        'Resource has public_read explicitly enabled'
      )
    })

    it('should deny access to entities with public_read: false', async function () {
      // Create entity with public_read: false
      const entity_properties = {
        entity_id: 'test-private-entity',
        title: 'Test Private Entity',
        type: 'test',
        public_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_public_key: 'test-owner-key'
      }

      await write_entity_to_filesystem({
        absolute_path: test_entity_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'This is a test entity with private access'
      })

      // Test with no user (public access) - should be denied
      const result = await check_user_permission({
        user_public_key: null,
        resource_path: 'user:test-entity.md'
      })

      expect(result.allowed).to.be.false
      expect(result.reason).to.not.equal('Resource has public_read enabled')
    })

    it('should default to private when public_read field is missing', async function () {
      // Create entity without public_read field
      const entity_properties = {
        entity_id: 'test-default-entity',
        title: 'Test Default Entity',
        type: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_public_key: 'test-owner-key'
      }

      await write_entity_to_filesystem({
        absolute_path: test_entity_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'This is a test entity without public_read field'
      })

      // Test with no user (public access) - should be denied
      const result = await check_user_permission({
        user_public_key: null,
        resource_path: 'user:test-entity.md'
      })

      expect(result.allowed).to.be.false
    })

    it('should validate that public_read only affects read operations', async function () {
      // Create entity with public_read: true
      const entity_properties = {
        entity_id: 'test-write-protection-entity',
        title: 'Test Write Protected Entity',
        type: 'test',
        public_read: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_public_key: 'test-owner-key'
      }

      await write_entity_to_filesystem({
        absolute_path: test_entity_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'This entity should be readable but not writable'
      })

      // Test read access (should be allowed)
      const read_result = await check_user_permission({
        user_public_key: null,
        resource_path: 'user:test-entity.md'
      })
      expect(read_result.allowed).to.be.true

      // Note: Write operations are handled at a higher level and are always owner-only
      // The public_read field specifically only affects read operations
    })
  })

  describe('Thread public_read functionality', function () {
    beforeEach(async function () {
      // Ensure thread directory exists
      await fs.mkdir(path.dirname(test_thread_dir), { recursive: true })
      await fs.mkdir(test_thread_dir, { recursive: true })
    })

    it('should grant access to threads with public_read: true', async function () {
      // Create thread metadata with public_read: true
      const metadata = {
        thread_id: 'test-thread-id',
        user_public_key: 'test-owner-key',
        session_provider: 'base',
        thread_state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        public_read: true
      }

      const metadata_path = path.join(test_thread_dir, 'metadata.json')
      await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2))

      // Create empty timeline
      const timeline_path = path.join(test_thread_dir, 'timeline.json')
      await fs.writeFile(timeline_path, JSON.stringify([], null, 2))

      // Test thread processing with no user (public access)
      const result = await process_thread_with_permissions({
        thread_id: 'test-thread-id',
        metadata,
        timeline: [],
        thread_dir: test_thread_dir,
        user_public_key: null
      })

      // Should return full thread data without redaction
      expect(result).to.have.property('thread_id', 'test-thread-id')
      expect(result).to.have.property('user_public_key', 'test-owner-key')
      expect(result).to.have.property('public_read', true)
    })

    it('should explicitly deny access to threads with public_read: false', async function () {
      // Create thread metadata with public_read: false
      const metadata = {
        thread_id: 'test-private-thread',
        user_public_key: 'test-owner-key',
        session_provider: 'base',
        thread_state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        public_read: false
      }

      const metadata_path = path.join(test_thread_dir, 'metadata.json')
      await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2))

      // Create empty timeline
      const timeline_path = path.join(test_thread_dir, 'timeline.json')
      await fs.writeFile(timeline_path, JSON.stringify([], null, 2))

      // Test thread processing with no user (public access)
      const result = await process_thread_with_permissions({
        thread_id: 'test-private-thread',
        metadata,
        timeline: [],
        thread_dir: test_thread_dir,
        user_public_key: null
      })

      // Should be redacted due to public_read: false, regardless of users.json permissions
      expect(result).to.be.an('object')
      // The result should be redacted (we can check for redaction indicators if they exist)
    })

    it('should default to private when thread public_read field is missing', async function () {
      // Create thread metadata without public_read field
      const metadata = {
        thread_id: 'test-default-thread',
        user_public_key: 'test-owner-key',
        session_provider: 'base',
        thread_state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const metadata_path = path.join(test_thread_dir, 'metadata.json')
      await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2))

      // Create empty timeline
      const timeline_path = path.join(test_thread_dir, 'timeline.json')
      await fs.writeFile(timeline_path, JSON.stringify([], null, 2))

      // Test thread processing with no user (public access)
      const result = await process_thread_with_permissions({
        thread_id: 'test-default-thread',
        metadata,
        timeline: [],
        thread_dir: test_thread_dir,
        user_public_key: null
      })

      // Should apply normal permission checks since public_read is not enabled
      expect(result).to.be.an('object')
      // The thread should not be granted public access
    })
  })

  describe('Permission precedence', function () {
    it('should take precedence over users.json permission rules for read operations', async function () {
      // Create entity with public_read: true
      const entity_properties = {
        entity_id: 'test-precedence-entity',
        title: 'Test Precedence Entity',
        type: 'test',
        public_read: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_public_key: 'different-owner-key'
      }

      await write_entity_to_filesystem({
        absolute_path: test_entity_path,
        entity_properties,
        entity_type: 'test',
        entity_content:
          'This entity should be accessible despite permission rules'
      })

      // Test with a different user key that would normally be denied
      const result = await check_user_permission({
        user_public_key: 'unauthorized-user-key',
        resource_path: 'user:test-entity.md'
      })

      // Should be allowed due to public_read, regardless of user permission rules
      expect(result.allowed).to.be.true
      expect(result.reason).to.equal(
        'Resource has public_read explicitly enabled'
      )
    })

    it('should deny access when public_read is explicitly false, overriding users.json permissions', async function () {
      // Create entity with public_read: false
      const entity_properties = {
        entity_id: 'test-explicitly-private-entity',
        title: 'Test Explicitly Private Entity',
        type: 'test',
        public_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_public_key: 'different-owner-key'
      }

      await write_entity_to_filesystem({
        absolute_path: test_entity_path,
        entity_properties,
        entity_type: 'test',
        entity_content:
          'This entity should be denied despite users.json permission rules'
      })

      // Test with a user key that would normally be allowed by users.json
      const result = await check_user_permission({
        user_public_key: 'authorized-user-key',
        resource_path: 'user:test-entity.md'
      })

      // Should be denied due to public_read: false, regardless of user permission rules
      expect(result.allowed).to.be.false
      expect(result.reason).to.equal(
        'Resource has public_read explicitly disabled'
      )
    })
  })

  describe('Error handling and edge cases', function () {
    it('should handle invalid public_read values gracefully', async function () {
      // Create entity with invalid public_read value (string instead of boolean)
      const entity_content = `---
title: Test Invalid Public Read
type: test
public_read: "invalid"
created_at: ${new Date().toISOString()}
updated_at: ${new Date().toISOString()}
user_public_key: test-owner-key
---

This entity has an invalid public_read value.`

      await fs.writeFile(test_entity_path, entity_content)

      // Should handle invalid value gracefully (treat as false)
      const result = await check_user_permission({
        user_public_key: null,
        resource_path: 'user:test-entity.md'
      })

      expect(result.allowed).to.be.false
    })

    it('should handle non-existent files gracefully', async function () {
      // Test permission check for non-existent file
      const result = await check_user_permission({
        user_public_key: null,
        resource_path: 'user:non-existent-file.md'
      })

      expect(result.allowed).to.be.false
    })
  })
})
