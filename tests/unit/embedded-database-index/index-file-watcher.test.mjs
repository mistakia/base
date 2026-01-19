/**
 * @fileoverview Unit tests for index file watcher helper functions
 */

import { expect } from 'chai'

import {
  ENTITY_DIRECTORIES,
  extract_entity_type_from_path
} from '#libs-server/embedded-database-index/sync/index-file-watcher.mjs'

describe('Index File Watcher', () => {
  describe('ENTITY_DIRECTORIES', () => {
    it('should include all expected directories', () => {
      expect(ENTITY_DIRECTORIES).to.be.an('array')
      expect(ENTITY_DIRECTORIES).to.include('task')
      expect(ENTITY_DIRECTORIES).to.include('tag')
      expect(ENTITY_DIRECTORIES).to.include('guideline')
      expect(ENTITY_DIRECTORIES).to.include('text')
      expect(ENTITY_DIRECTORIES).to.include('workflow')
      expect(ENTITY_DIRECTORIES).to.include('physical-item')
      expect(ENTITY_DIRECTORIES).to.include('physical-location')
    })
  })

  describe('extract_entity_type_from_path', () => {
    it('should extract entity type from relative path', () => {
      expect(extract_entity_type_from_path('task/my-task.md')).to.equal('task')
      expect(extract_entity_type_from_path('tag/my-tag.md')).to.equal('tag')
      expect(
        extract_entity_type_from_path('guideline/my-guideline.md')
      ).to.equal('guideline')
    })

    it('should extract entity type from nested path', () => {
      expect(
        extract_entity_type_from_path('task/base/nested/deep.md')
      ).to.equal('task')
      expect(
        extract_entity_type_from_path('workflow/system/workflow.md')
      ).to.equal('workflow')
    })

    it('should return null for non-entity directories', () => {
      expect(extract_entity_type_from_path('thread/abc123/metadata.json')).to.be
        .null
      expect(extract_entity_type_from_path('config/config.json')).to.be.null
      expect(extract_entity_type_from_path('README.md')).to.be.null
    })

    it('should handle physical-item and physical-location', () => {
      expect(extract_entity_type_from_path('physical-item/item.md')).to.equal(
        'physical-item'
      )
      expect(
        extract_entity_type_from_path('physical-location/location.md')
      ).to.equal('physical-location')
    })
  })
})
