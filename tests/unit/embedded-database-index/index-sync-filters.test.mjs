/**
 * @fileoverview Unit tests for index sync filters module
 */

import { expect } from 'chai'

import {
  filter_entity_files,
  ENTITY_DIRECTORIES,
  DEFAULT_SUBMODULE_EXCLUSION_PREFIXES
} from '#libs-server/embedded-database-index/sync/index-sync-filters.mjs'

describe('Index Sync Filters', () => {
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

    describe('submodule exclusion', () => {
      it('should exclude files from custom submodule prefixes', () => {
        const file_paths = [
          'text/my-text.md',
          'text/some-submodule/nested/doc.md',
          'text/normal-text/doc.md'
        ]

        const result = filter_entity_files({
          file_paths,
          entity_directories: ENTITY_DIRECTORIES,
          submodule_exclusions: ['text/some-submodule/']
        })

        expect(result).to.deep.equal([
          'text/my-text.md',
          'text/normal-text/doc.md'
        ])
      })

      it('should exclude files from import-history submodule', () => {
        const file_paths = [
          'task/my-task.md',
          'import-history/claude/session-1.md',
          'import-history/data.md'
        ]

        const result = filter_entity_files({
          file_paths,
          entity_directories: ['task', 'import-history']
        })

        expect(result).to.deep.equal(['task/my-task.md'])
      })

      it('should exclude files from repository/active submodules', () => {
        const file_paths = [
          'task/my-task.md',
          'repository/active/base/CLAUDE.md',
          'repository/active/league/task/something.md'
        ]

        const result = filter_entity_files({
          file_paths,
          entity_directories: ['task', 'repository/active']
        })

        expect(result).to.deep.equal(['task/my-task.md'])
      })

      it('should not exclude files from repository/archive', () => {
        const file_paths = [
          'text/my-doc.md',
          'repository/archive/vscode/docs/readme.md'
        ]

        const result = filter_entity_files({
          file_paths,
          entity_directories: ['text', 'repository/archive']
        })

        expect(result).to.deep.equal([
          'text/my-doc.md',
          'repository/archive/vscode/docs/readme.md'
        ])
      })

      it('should allow custom submodule exclusions', () => {
        const file_paths = ['text/my-doc.md', 'text/custom-submodule/doc.md']

        const result = filter_entity_files({
          file_paths,
          entity_directories: ENTITY_DIRECTORIES,
          submodule_exclusions: ['text/custom-submodule/']
        })

        expect(result).to.deep.equal(['text/my-doc.md'])
      })

      it('should include entity files that do not match exclusion patterns', () => {
        const file_paths = [
          'text/research/local-notes.md',
          'text/notes/project.md'
        ]

        const result = filter_entity_files({
          file_paths,
          entity_directories: ENTITY_DIRECTORIES
        })

        expect(result).to.deep.equal([
          'text/research/local-notes.md',
          'text/notes/project.md'
        ])
      })
    })
  })

  describe('DEFAULT_SUBMODULE_EXCLUSION_PREFIXES', () => {
    it('should include generic submodule paths', () => {
      expect(DEFAULT_SUBMODULE_EXCLUSION_PREFIXES).to.be.an('array')
      expect(DEFAULT_SUBMODULE_EXCLUSION_PREFIXES).to.include('import-history/')
      expect(DEFAULT_SUBMODULE_EXCLUSION_PREFIXES).to.include('repository/active/')
    })

    it('should not include user-specific paths', () => {
      // User-specific submodule exclusions belong in user-base entity-scan-config.json
      for (const prefix of DEFAULT_SUBMODULE_EXCLUSION_PREFIXES) {
        expect(['import-history/', 'repository/active/']).to.include(prefix)
      }
    })

    it('should not exclude repository/archive (archive entities are indexed)', () => {
      expect(DEFAULT_SUBMODULE_EXCLUSION_PREFIXES).to.not.include('repository/archive/')
    })
  })
})
