/**
 * @fileoverview Unit tests for sync constants module
 */

import { expect } from 'chai'

import {
  filter_entity_files,
  ENTITY_DIRECTORIES
} from '#libs-server/embedded-database-index/sync/sync-constants.mjs'

describe('Sync Constants', () => {
  describe('ENTITY_DIRECTORIES', () => {
    it('should include expected entity directories', () => {
      expect(ENTITY_DIRECTORIES).to.be.an('array')
      expect(ENTITY_DIRECTORIES).to.include('task')
      expect(ENTITY_DIRECTORIES).to.include('tag')
      expect(ENTITY_DIRECTORIES).to.include('guideline')
      expect(ENTITY_DIRECTORIES).to.include('text')
      expect(ENTITY_DIRECTORIES).to.include('workflow')
      expect(ENTITY_DIRECTORIES).to.include('physical-item')
      expect(ENTITY_DIRECTORIES).to.include('physical-location')
    })

    it('should not include thread directory', () => {
      expect(ENTITY_DIRECTORIES).to.not.include('thread')
    })
  })

  describe('filter_entity_files', () => {
    it('should filter to only entity files', () => {
      const file_paths = [
        'task/my-task.md',
        'guideline/my-guideline.md',
        'thread/abc123/metadata.json',
        'README.md',
        'package.json'
      ]

      const result = filter_entity_files({
        file_paths,
        entity_directories: ENTITY_DIRECTORIES
      })

      expect(result).to.deep.equal([
        'task/my-task.md',
        'guideline/my-guideline.md'
      ])
    })

    it('should include nested entity files', () => {
      const file_paths = [
        'task/base/my-task.md',
        'task/github/org/repo/123.md',
        'guideline/nested/deep/guideline.md'
      ]

      const result = filter_entity_files({
        file_paths,
        entity_directories: ENTITY_DIRECTORIES
      })

      expect(result).to.have.lengthOf(3)
      expect(result).to.include('task/base/my-task.md')
      expect(result).to.include('task/github/org/repo/123.md')
      expect(result).to.include('guideline/nested/deep/guideline.md')
    })

    it('should exclude non-markdown files in entity directories', () => {
      const file_paths = [
        'task/my-task.md',
        'task/data.json',
        'guideline/style.css'
      ]

      const result = filter_entity_files({
        file_paths,
        entity_directories: ENTITY_DIRECTORIES
      })

      expect(result).to.deep.equal(['task/my-task.md'])
    })

    it('should return empty array for no matching files', () => {
      const file_paths = [
        'thread/abc123/metadata.json',
        'config/config.json',
        'README.md'
      ]

      const result = filter_entity_files({
        file_paths,
        entity_directories: ENTITY_DIRECTORIES
      })

      expect(result).to.deep.equal([])
    })

    it('should handle empty input', () => {
      const result = filter_entity_files({
        file_paths: [],
        entity_directories: ENTITY_DIRECTORIES
      })

      expect(result).to.deep.equal([])
    })

    it('should respect custom entity directories', () => {
      const file_paths = [
        'task/my-task.md',
        'custom/my-custom.md',
        'guideline/my-guideline.md'
      ]

      const result = filter_entity_files({
        file_paths,
        entity_directories: ['custom']
      })

      expect(result).to.deep.equal(['custom/my-custom.md'])
    })

    it('should handle all entity directory types', () => {
      const file_paths = [
        'task/a.md',
        'tag/b.md',
        'guideline/c.md',
        'text/d.md',
        'workflow/e.md',
        'physical-item/f.md',
        'physical-location/g.md'
      ]

      const result = filter_entity_files({
        file_paths,
        entity_directories: ENTITY_DIRECTORIES
      })

      expect(result).to.have.lengthOf(7)
    })
  })
})
