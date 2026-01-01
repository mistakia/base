import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { resolve_tag_shorthand } from '#libs-server/tag/filesystem/resolve-tag-shorthand.mjs'
import {
  add_tags_to_entity,
  remove_tags_from_entity
} from '#libs-server/tag/filesystem/manage-entity-tags.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

describe('Tag Management Functions', () => {
  let temp_dir

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tag-management-test-'))
  })

  afterEach(async () => {
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  describe('resolve_tag_shorthand', () => {
    it('should convert shorthand tags to base-uri format', () => {
      const result = resolve_tag_shorthand('javascript')
      expect(result).to.deep.equal(['user:tag/javascript.md'])
    })

    it('should handle comma-separated multiple tags', () => {
      const result = resolve_tag_shorthand('javascript, python, react')
      expect(result).to.deep.equal([
        'user:tag/javascript.md',
        'user:tag/python.md',
        'user:tag/react.md'
      ])
    })

    it('should pass through full base-uri format', () => {
      const result = resolve_tag_shorthand('user:tag/custom-tag.md')
      expect(result).to.deep.equal(['user:tag/custom-tag.md'])
    })

    it('should handle mixed shorthand and full format', () => {
      const result = resolve_tag_shorthand(
        'javascript, user:tag/custom.md, python'
      )
      expect(result).to.deep.equal([
        'user:tag/javascript.md',
        'user:tag/custom.md',
        'user:tag/python.md'
      ])
    })

    it('should throw error for empty input', () => {
      expect(() => resolve_tag_shorthand('')).to.throw(
        'Tag input must be a non-empty string'
      )
    })

    it('should throw error for null input', () => {
      expect(() => resolve_tag_shorthand(null)).to.throw(
        'Tag input must be a non-empty string'
      )
    })
  })

  describe('add_tags_to_entity', () => {
    it('should add tags to entity with no existing tags', async () => {
      const absolute_path = path.join(temp_dir, 'test-entity.md')
      const entity_properties = {
        title: 'Test Entity',
        description: 'Test description',
        user_public_key: 'abc123'
      }

      await write_entity_to_filesystem({
        absolute_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'Test content'
      })

      const result = await add_tags_to_entity({
        absolute_path,
        tags_to_add: ['user:tag/javascript.md', 'user:tag/python.md']
      })

      expect(result.success).to.be.true
      expect(result.added_tags).to.deep.equal([
        'user:tag/javascript.md',
        'user:tag/python.md'
      ])
      expect(result.skipped_tags).to.deep.equal([])
      expect(result.total_tags).to.equal(2)
    })

    it('should add tags to entity with existing tags', async () => {
      const absolute_path = path.join(temp_dir, 'test-entity.md')
      const entity_properties = {
        title: 'Test Entity',
        description: 'Test description',
        user_public_key: 'abc123',
        tags: ['user:tag/existing.md']
      }

      await write_entity_to_filesystem({
        absolute_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'Test content'
      })

      const result = await add_tags_to_entity({
        absolute_path,
        tags_to_add: ['user:tag/javascript.md', 'user:tag/existing.md']
      })

      expect(result.success).to.be.true
      expect(result.added_tags).to.deep.equal(['user:tag/javascript.md'])
      expect(result.skipped_tags).to.deep.equal(['user:tag/existing.md'])
      expect(result.total_tags).to.equal(2)
    })

    it('should handle adding tags that already exist on entity', async () => {
      const absolute_path = path.join(temp_dir, 'test-entity.md')
      const entity_properties = {
        title: 'Test Entity',
        user_public_key: 'abc123',
        tags: ['user:tag/javascript.md']
      }

      await write_entity_to_filesystem({
        absolute_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'Test content'
      })

      const result = await add_tags_to_entity({
        absolute_path,
        tags_to_add: ['user:tag/javascript.md']
      })

      expect(result.success).to.be.true
      expect(result.added_tags).to.deep.equal([])
      expect(result.skipped_tags).to.deep.equal(['user:tag/javascript.md'])
      expect(result.total_tags).to.equal(1)
    })

    it('should deduplicate tags within input array', async () => {
      const absolute_path = path.join(temp_dir, 'test-entity.md')
      const entity_properties = {
        title: 'Test Entity',
        user_public_key: 'abc123'
      }

      await write_entity_to_filesystem({
        absolute_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'Test content'
      })

      const result = await add_tags_to_entity({
        absolute_path,
        tags_to_add: [
          'user:tag/javascript.md',
          'user:tag/javascript.md',
          'user:tag/python.md'
        ]
      })

      expect(result.success).to.be.true
      expect(result.added_tags).to.deep.equal([
        'user:tag/javascript.md',
        'user:tag/python.md'
      ])
      expect(result.skipped_tags).to.deep.equal([])
      expect(result.total_tags).to.equal(2)
    })

    it('should handle non-existent file', async () => {
      const result = await add_tags_to_entity({
        absolute_path: '/non/existent/path.md',
        tags_to_add: ['user:tag/test.md']
      })

      expect(result.success).to.be.false
      expect(result.error).to.include('Failed to read entity')
    })

    it('should validate required parameters', async () => {
      const result = await add_tags_to_entity({
        absolute_path: null,
        tags_to_add: ['user:tag/test.md']
      })

      expect(result.success).to.be.false
      expect(result.error).to.equal('Absolute path is required')
    })
  })

  describe('remove_tags_from_entity', () => {
    it('should remove tags from entity', async () => {
      const absolute_path = path.join(temp_dir, 'test-entity.md')
      const entity_properties = {
        title: 'Test Entity',
        user_public_key: 'abc123',
        tags: [
          'user:tag/javascript.md',
          'user:tag/python.md',
          'user:tag/react.md'
        ]
      }

      await write_entity_to_filesystem({
        absolute_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'Test content'
      })

      const result = await remove_tags_from_entity({
        absolute_path,
        tags_to_remove: ['user:tag/javascript.md', 'user:tag/python.md']
      })

      expect(result.success).to.be.true
      expect(result.removed_tags).to.deep.equal([
        'user:tag/javascript.md',
        'user:tag/python.md'
      ])
      expect(result.not_found_tags).to.deep.equal([])
      expect(result.total_tags).to.equal(1)
    })

    it('should handle removing non-existent tags', async () => {
      const absolute_path = path.join(temp_dir, 'test-entity.md')
      const entity_properties = {
        title: 'Test Entity',
        user_public_key: 'abc123',
        tags: ['user:tag/javascript.md']
      }

      await write_entity_to_filesystem({
        absolute_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'Test content'
      })

      const result = await remove_tags_from_entity({
        absolute_path,
        tags_to_remove: ['user:tag/python.md', 'user:tag/react.md']
      })

      expect(result.success).to.be.true
      expect(result.removed_tags).to.deep.equal([])
      expect(result.not_found_tags).to.deep.equal([
        'user:tag/python.md',
        'user:tag/react.md'
      ])
      expect(result.total_tags).to.equal(1)
    })

    it('should handle entity with no tags', async () => {
      const absolute_path = path.join(temp_dir, 'test-entity.md')
      const entity_properties = {
        title: 'Test Entity',
        user_public_key: 'abc123'
      }

      await write_entity_to_filesystem({
        absolute_path,
        entity_properties,
        entity_type: 'test',
        entity_content: 'Test content'
      })

      const result = await remove_tags_from_entity({
        absolute_path,
        tags_to_remove: ['user:tag/javascript.md']
      })

      expect(result.success).to.be.true
      expect(result.removed_tags).to.deep.equal([])
      expect(result.not_found_tags).to.deep.equal(['user:tag/javascript.md'])
      expect(result.total_tags).to.equal(0)
    })

    it('should validate required parameters', async () => {
      const result = await remove_tags_from_entity({
        absolute_path: null,
        tags_to_remove: ['user:tag/test.md']
      })

      expect(result.success).to.be.false
      expect(result.error).to.equal('Absolute path is required')
    })
  })
})
