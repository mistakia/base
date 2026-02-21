/* global describe, it, before, after */

import fs from 'fs'
import path from 'path'
import os from 'os'

import { expect } from 'chai'

import {
  discover_watch_paths,
  DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS
} from '#libs-server/file-subscriptions/file-watcher.mjs'

describe('file-watcher', () => {
  let temp_dir

  before(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-watcher-test-'))

    // Create entity directories
    fs.mkdirSync(path.join(temp_dir, 'task'))
    fs.mkdirSync(path.join(temp_dir, 'text'))
    fs.mkdirSync(path.join(temp_dir, 'guideline'))
    fs.mkdirSync(path.join(temp_dir, 'tag'))
    fs.mkdirSync(path.join(temp_dir, 'workflow'))

    // Create non-entity directories (should be excluded)
    fs.mkdirSync(path.join(temp_dir, 'repository'))
    fs.mkdirSync(path.join(temp_dir, 'thread'))
    fs.mkdirSync(path.join(temp_dir, '.git'))
    fs.mkdirSync(path.join(temp_dir, 'node_modules'))
    fs.mkdirSync(path.join(temp_dir, 'embedded-database-index'))
    fs.mkdirSync(path.join(temp_dir, 'import-history'))

    // Create a regular file (should be skipped, not a directory)
    fs.writeFileSync(path.join(temp_dir, 'CLAUDE.md'), 'test')
  })

  after(() => {
    fs.rmSync(temp_dir, { recursive: true, force: true })
  })

  describe('discover_watch_paths', () => {
    it('should discover entity directories and exclude non-entity directories', () => {
      const paths = discover_watch_paths(temp_dir)
      const names = paths.map((p) => path.basename(p))

      expect(names).to.include('task')
      expect(names).to.include('text')
      expect(names).to.include('guideline')
      expect(names).to.include('tag')
      expect(names).to.include('workflow')

      expect(names).to.not.include('repository')
      expect(names).to.not.include('thread')
      expect(names).to.not.include('.git')
      expect(names).to.not.include('node_modules')
      expect(names).to.not.include('embedded-database-index')
      expect(names).to.not.include('import-history')
    })

    it('should exclude hidden directories (dot prefix)', () => {
      const paths = discover_watch_paths(temp_dir)
      const names = paths.map((p) => path.basename(p))

      expect(names).to.not.include('.git')
    })

    it('should not include regular files', () => {
      const paths = discover_watch_paths(temp_dir)
      const names = paths.map((p) => path.basename(p))

      expect(names).to.not.include('CLAUDE.md')
    })

    it('should return absolute paths', () => {
      const paths = discover_watch_paths(temp_dir)

      for (const p of paths) {
        expect(path.isAbsolute(p)).to.be.true
      }
    })

    it('should automatically include new entity directories', () => {
      const new_dir = path.join(temp_dir, 'recipe')
      fs.mkdirSync(new_dir)

      try {
        const paths = discover_watch_paths(temp_dir)
        const names = paths.map((p) => path.basename(p))

        expect(names).to.include('recipe')
      } finally {
        fs.rmdirSync(new_dir)
      }
    })

    it('should use explicit watch paths when provided', () => {
      const paths = discover_watch_paths(temp_dir, {
        explicit_watch_paths: ['task', 'text']
      })
      const names = paths.map((p) => path.basename(p))

      expect(names).to.deep.equal(['task', 'text'])
    })

    it('should filter out non-existent explicit paths', () => {
      const paths = discover_watch_paths(temp_dir, {
        explicit_watch_paths: ['task', 'nonexistent']
      })
      const names = paths.map((p) => path.basename(p))

      expect(names).to.deep.equal(['task'])
      expect(names).to.not.include('nonexistent')
    })

    it('should respect custom exclusion list', () => {
      const paths = discover_watch_paths(temp_dir, {
        exclude_dirs: ['repository', 'thread', '.git', 'node_modules', 'embedded-database-index', 'import-history', 'tag']
      })
      const names = paths.map((p) => path.basename(p))

      expect(names).to.include('task')
      expect(names).to.not.include('tag')
    })

    it('should return empty array for non-existent directory', () => {
      const paths = discover_watch_paths('/nonexistent/path')

      expect(paths).to.deep.equal([])
    })
  })

  describe('DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS', () => {
    it('should contain the expected exclusion list', () => {
      expect(DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS).to.include('repository')
      expect(DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS).to.include('thread')
      expect(DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS).to.include('.git')
      expect(DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS).to.include('node_modules')
      expect(DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS).to.include('embedded-database-index')
      expect(DEFAULT_SUBSCRIPTION_EXCLUDE_DIRS).to.include('import-history')
    })
  })
})
