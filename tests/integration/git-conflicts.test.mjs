/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

import {
  get_conflicts,
  get_conflict_versions,
  resolve_conflict,
  is_merging
} from '#libs-server/git/conflicts.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('Git Conflict Operations', function () {
  this.timeout(30000)

  let test_repo_path
  let remote_repo_path

  // Create test repositories with a merge conflict
  beforeEach(async function () {
    const temp_dir = os.tmpdir()
    test_repo_path = path.join(
      temp_dir,
      `conflict-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )
    remote_repo_path = path.join(
      temp_dir,
      `conflict-remote-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )

    // Create remote repository
    await fs.mkdir(remote_repo_path, { recursive: true })
    await execute('git init --bare', { cwd: remote_repo_path })

    // Create local repository
    await fs.mkdir(test_repo_path, { recursive: true })
    await execute('git init', { cwd: test_repo_path })
    await execute(`git remote add origin ${remote_repo_path}`, {
      cwd: test_repo_path
    })

    // Configure git
    await execute('git config user.name "Test User"', { cwd: test_repo_path })
    await execute('git config user.email "test@example.com"', {
      cwd: test_repo_path
    })

    // Create initial commit on main
    await fs.writeFile(
      path.join(test_repo_path, 'conflict-file.txt'),
      'Line 1: Original\nLine 2: Original\nLine 3: Original'
    )
    await execute('git add conflict-file.txt', { cwd: test_repo_path })
    await execute('git commit -m "Initial commit"', { cwd: test_repo_path })
    await execute('git branch -M main', { cwd: test_repo_path })
    await execute('git push -u origin main', { cwd: test_repo_path })

    // Create feature branch with conflicting changes
    await execute('git checkout -b feature-branch', { cwd: test_repo_path })
    await fs.writeFile(
      path.join(test_repo_path, 'conflict-file.txt'),
      'Line 1: Original\nLine 2: Feature Change\nLine 3: Original'
    )
    await execute('git add conflict-file.txt', { cwd: test_repo_path })
    await execute('git commit -m "Feature change"', { cwd: test_repo_path })

    // Go back to main and make conflicting change
    await execute('git checkout main', { cwd: test_repo_path })
    await fs.writeFile(
      path.join(test_repo_path, 'conflict-file.txt'),
      'Line 1: Original\nLine 2: Main Change\nLine 3: Original'
    )
    await execute('git add conflict-file.txt', { cwd: test_repo_path })
    await execute('git commit -m "Main change"', { cwd: test_repo_path })

    // Attempt merge (will create conflict)
    try {
      await execute('git merge feature-branch', { cwd: test_repo_path })
    } catch {
      // Expected to fail due to conflict
    }
  })

  afterEach(async function () {
    try {
      await fs.rm(test_repo_path, { recursive: true, force: true })
      await fs.rm(remote_repo_path, { recursive: true, force: true })
    } catch (error) {
      console.error('Error cleaning up:', error)
    }
  })

  describe('get_conflicts', () => {
    it('should detect conflicted files', async function () {
      const conflicts = await get_conflicts({ repo_path: test_repo_path })

      expect(conflicts).to.be.an('array')
      expect(conflicts).to.have.lengthOf(1)
      expect(conflicts[0].path).to.equal('conflict-file.txt')
      expect(conflicts[0].status).to.equal('conflict')
    })
  })

  describe('is_merging', () => {
    it('should return true when in merge state', async function () {
      const merging = await is_merging({ repo_path: test_repo_path })
      expect(merging).to.be.true
    })
  })

  describe('get_conflict_versions', () => {
    it('should return all versions of conflicted file', async function () {
      const versions = await get_conflict_versions({
        repo_path: test_repo_path,
        file_path: 'conflict-file.txt'
      })

      expect(versions).to.have.property('file_path', 'conflict-file.txt')
      expect(versions).to.have.property('ours')
      expect(versions).to.have.property('theirs')
      expect(versions).to.have.property('base')
      expect(versions).to.have.property('current')

      // Verify content from each version
      expect(versions.ours).to.include('Main Change')
      expect(versions.theirs).to.include('Feature Change')
      expect(versions.base).to.include('Original')

      // Current should have conflict markers
      expect(versions.current).to.include('<<<<<<<')
      expect(versions.current).to.include('>>>>>>>')
    })

    it('should include branch names', async function () {
      const versions = await get_conflict_versions({
        repo_path: test_repo_path,
        file_path: 'conflict-file.txt'
      })

      expect(versions).to.have.property('ours_branch')
      expect(versions).to.have.property('theirs_branch')
      expect(versions.ours_branch).to.equal('main')
      expect(versions.theirs_branch).to.equal('feature-branch')
    })
  })

  describe('resolve_conflict', () => {
    it('should resolve conflict using ours strategy', async function () {
      await resolve_conflict({
        repo_path: test_repo_path,
        file_path: 'conflict-file.txt',
        resolution: 'ours'
      })

      // Check file content
      const content = await fs.readFile(
        path.join(test_repo_path, 'conflict-file.txt'),
        'utf8'
      )
      expect(content).to.include('Main Change')
      expect(content).not.to.include('Feature Change')

      // Check conflict is resolved
      const conflicts = await get_conflicts({ repo_path: test_repo_path })
      expect(conflicts).to.have.lengthOf(0)
    })

    it('should resolve conflict using theirs strategy', async function () {
      await resolve_conflict({
        repo_path: test_repo_path,
        file_path: 'conflict-file.txt',
        resolution: 'theirs'
      })

      // Check file content
      const content = await fs.readFile(
        path.join(test_repo_path, 'conflict-file.txt'),
        'utf8'
      )
      expect(content).to.include('Feature Change')
      expect(content).not.to.include('Main Change')

      // Check conflict is resolved
      const conflicts = await get_conflicts({ repo_path: test_repo_path })
      expect(conflicts).to.have.lengthOf(0)
    })

    it('should resolve conflict with merged content', async function () {
      const merged_content =
        'Line 1: Original\nLine 2: Merged Both\nLine 3: Original'

      await resolve_conflict({
        repo_path: test_repo_path,
        file_path: 'conflict-file.txt',
        resolution: 'merged',
        merged_content
      })

      // Check file content
      const content = await fs.readFile(
        path.join(test_repo_path, 'conflict-file.txt'),
        'utf8'
      )
      expect(content).to.equal(merged_content)

      // Check conflict is resolved
      const conflicts = await get_conflicts({ repo_path: test_repo_path })
      expect(conflicts).to.have.lengthOf(0)
    })
  })
})
