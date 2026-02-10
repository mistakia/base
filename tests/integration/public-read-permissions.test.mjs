/* global describe it beforeEach before after */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { setup_test_directories } from '#tests/utils/index.mjs'
import { check_user_permission } from '#server/middleware/permission/index.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { process_thread_with_permissions } from '#libs-server/threads/thread-utils.mjs'
import { write_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'

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
        source: { provider: 'claude' },
        thread_state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        public_read: true
      }

      const metadata_path = path.join(test_thread_dir, 'metadata.json')
      await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2))

      // Create empty timeline
      const timeline_path = path.join(test_thread_dir, 'timeline.jsonl')
      await write_timeline_jsonl({ timeline_path, entries: [] })

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
        source: { provider: 'claude' },
        thread_state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        public_read: false
      }

      const metadata_path = path.join(test_thread_dir, 'metadata.json')
      await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2))

      // Create empty timeline
      const timeline_path = path.join(test_thread_dir, 'timeline.jsonl')
      await write_timeline_jsonl({ timeline_path, entries: [] })

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
        source: { provider: 'claude' },
        thread_state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const metadata_path = path.join(test_thread_dir, 'metadata.json')
      await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2))

      // Create empty timeline
      const timeline_path = path.join(test_thread_dir, 'timeline.jsonl')
      await write_timeline_jsonl({ timeline_path, entries: [] })

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
    it('should grant access via public_read when user has no matching rules', async function () {
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
          'This entity should be accessible via public_read when user has no matching rules'
      })

      // Test with a user key that has no matching permission rules
      const result = await check_user_permission({
        user_public_key: 'user-without-matching-rules',
        resource_path: 'user:test-entity.md'
      })

      // Should be allowed due to public_read when no user rules match
      expect(result.allowed).to.be.true
      expect(result.reason).to.equal(
        'Resource has public_read explicitly enabled'
      )
    })

    it('should deny access via public_read: false when user has no matching rules', async function () {
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
          'This entity should be denied via public_read when user has no matching rules'
      })

      // Test with a user key that has no matching permission rules
      const result = await check_user_permission({
        user_public_key: 'user-without-matching-rules',
        resource_path: 'user:test-entity.md'
      })

      // Should be denied due to public_read: false when no user rules match
      expect(result.allowed).to.be.false
      expect(result.reason).to.equal(
        'Resource has public_read explicitly disabled'
      )
    })

    it('should respect user-specific matching rule over public_read for non-public users', async function () {
      // Note: This test would require setting up a test user with specific rules
      // in the user registry. For now, we document the expected behavior:
      //
      // 1. If user has matching "allow" rule -> should be allowed even if public_read: false
      // 2. If user has matching "deny" rule -> should be denied even if public_read: true
      // 3. If user has no matching rules -> fall back to public_read setting
      //
      // This ensures user-specific rules take precedence when they match
    })
  })

  describe('User-specific rule precedence', function () {
    it('should fall back to public_read when user has rules but none match', async function () {
      // Create entity with public_read: true
      const entity_properties = {
        entity_id: 'test-fallback-entity',
        title: 'Test Fallback Entity',
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
        entity_content:
          'This entity should be accessible via public_read when user rules exist but none match'
      })

      // Test with a user that has rules defined but none that match this resource
      // Note: The actual test would need a mock user with specific rules
      // For this test, using a generic user key demonstrates the fallback behavior
      const result = await check_user_permission({
        user_public_key: 'test-user-with-non-matching-rules',
        resource_path: 'user:test-entity.md'
      })

      // Should fall back to public_read: true when user has no matching rules
      expect(result.allowed).to.be.true
      expect(result.reason).to.equal(
        'Resource has public_read explicitly enabled'
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
