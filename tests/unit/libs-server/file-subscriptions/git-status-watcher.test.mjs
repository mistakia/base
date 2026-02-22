import { expect } from 'chai'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'

import {
  start_git_status_watcher,
  stop_git_status_watcher,
  REPO_FILE_IGNORE_DIRS,
  repo_file_ignore
} from '#libs-server/file-subscriptions/git-status-watcher.mjs'

describe('Git Status Watcher', function () {
  this.timeout(15000)

  let temp_dir
  let repo_path_a
  let repo_path_b

  beforeEach(async function () {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-watcher-test-'))
    repo_path_a = path.join(temp_dir, 'repo-a')
    repo_path_b = path.join(temp_dir, 'repo-b')

    await fs.mkdir(path.join(repo_path_a, '.git', 'refs', 'heads'), {
      recursive: true
    })
    await fs.mkdir(path.join(repo_path_b, '.git', 'refs', 'heads'), {
      recursive: true
    })
    await fs.writeFile(path.join(repo_path_a, '.git', 'index'), '')
    await fs.writeFile(
      path.join(repo_path_a, '.git', 'HEAD'),
      'ref: refs/heads/main\n'
    )
    await fs.writeFile(path.join(repo_path_b, '.git', 'index'), '')
    await fs.writeFile(
      path.join(repo_path_b, '.git', 'HEAD'),
      'ref: refs/heads/main\n'
    )
  })

  afterEach(async function () {
    await stop_git_status_watcher()
    await fs.rm(temp_dir, { recursive: true, force: true })
  })

  describe('debounce behavior', () => {
    it('should debounce rapid changes within the same repo into a single callback', async () => {
      const callbacks = []

      await start_git_status_watcher({
        on_git_status_change: ({ repo_path }) => {
          callbacks.push({ repo_path })
        },
        repo_paths: [repo_path_a]
      })

      // Simulate rapid git changes (like a commit touching index + HEAD + ref)
      await fs.writeFile(path.join(repo_path_a, '.git', 'index'), 'updated-1')
      await fs.writeFile(
        path.join(repo_path_a, '.git', 'HEAD'),
        'ref: refs/heads/main\n'
      )
      await fs.writeFile(
        path.join(repo_path_a, '.git', 'refs', 'heads', 'main'),
        'abc123'
      )

      // Wait less than debounce - should have no callbacks yet
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(callbacks).to.have.lengthOf(0)

      // Wait for debounce to complete
      await new Promise((resolve) => setTimeout(resolve, 800))
      expect(callbacks).to.have.lengthOf(1)
      expect(callbacks[0].repo_path).to.equal(repo_path_a)
    })

    it('should trigger separate callbacks for changes in different repos', async () => {
      const callbacks = []

      await start_git_status_watcher({
        on_git_status_change: ({ repo_path }) => {
          callbacks.push({ repo_path })
        },
        repo_paths: [repo_path_a, repo_path_b]
      })

      // Change files in both repos simultaneously
      await fs.writeFile(path.join(repo_path_a, '.git', 'index'), 'updated-a')
      await fs.writeFile(path.join(repo_path_b, '.git', 'index'), 'updated-b')

      // Wait for debounce to complete
      await new Promise((resolve) => setTimeout(resolve, 1500))

      expect(callbacks).to.have.lengthOf(2)

      const repo_paths_called = callbacks.map((c) => c.repo_path).sort()
      const expected = [repo_path_a, repo_path_b].sort()
      expect(repo_paths_called).to.deep.equal(expected)
    })
  })

  describe('REPO_FILE_IGNORE_DIRS', () => {
    it('should include thread to avoid overlap with thread-watcher', () => {
      expect(REPO_FILE_IGNORE_DIRS.has('thread')).to.be.true
    })

    it('should include import-history for git submodule', () => {
      expect(REPO_FILE_IGNORE_DIRS.has('import-history')).to.be.true
    })

    it('should include embedded-database-index for DuckDB files', () => {
      expect(REPO_FILE_IGNORE_DIRS.has('embedded-database-index')).to.be.true
    })

    it('should include standard ignore directories', () => {
      expect(REPO_FILE_IGNORE_DIRS.has('node_modules')).to.be.true
      expect(REPO_FILE_IGNORE_DIRS.has('.git')).to.be.true
    })
  })

  describe('repo_file_ignore', () => {
    it('should ignore excluded directories by basename', () => {
      expect(repo_file_ignore('/some/path/node_modules')).to.be.true
      expect(repo_file_ignore('/some/path/.git')).to.be.true
      expect(repo_file_ignore('/some/path/dist')).to.be.true
    })

    it('should ignore swap and backup files', () => {
      expect(repo_file_ignore('/some/path/file.swp')).to.be.true
      expect(repo_file_ignore('/some/path/file.txt~')).to.be.true
    })

    it('should ignore specific files', () => {
      expect(repo_file_ignore('/some/path/.DS_Store')).to.be.true
      expect(repo_file_ignore('/some/path/yarn-error.log')).to.be.true
    })

    it('should not ignore regular source files', () => {
      expect(repo_file_ignore('/some/path/index.mjs')).to.be.false
      expect(repo_file_ignore('/some/path/src')).to.be.false
      expect(repo_file_ignore('/some/path/package.json')).to.be.false
    })
  })

  describe('cleanup', () => {
    it('should stop watcher and clear timers on stop', async () => {
      const callbacks = []

      await start_git_status_watcher({
        on_git_status_change: ({ repo_path }) => {
          callbacks.push({ repo_path })
        },
        repo_paths: [repo_path_a]
      })

      // Trigger a change
      await fs.writeFile(path.join(repo_path_a, '.git', 'index'), 'updated')

      // Stop before debounce fires
      await new Promise((resolve) => setTimeout(resolve, 200))
      await stop_git_status_watcher()

      // Wait past debounce period - callback should not fire
      await new Promise((resolve) => setTimeout(resolve, 1500))
      expect(callbacks).to.have.lengthOf(0)
    })
  })
})
