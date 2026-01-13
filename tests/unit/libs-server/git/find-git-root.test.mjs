/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

import { find_git_root } from '#libs-server/git/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('find_git_root', function () {
  let test_repo_path
  let temp_dir

  beforeEach(async function () {
    temp_dir = path.join(
      os.tmpdir(),
      `find-git-root-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )

    // Create temporary directory structure
    test_repo_path = path.join(temp_dir, 'test-repo')
    await fs.mkdir(path.join(test_repo_path, 'nested', 'deep', 'path'), {
      recursive: true
    })

    // Initialize git repo
    await execute('git init', { cwd: test_repo_path })
    await execute('git config user.name "Test User"', { cwd: test_repo_path })
    await execute('git config user.email "test@example.com"', {
      cwd: test_repo_path
    })
  })

  afterEach(async function () {
    try {
      await fs.rm(temp_dir, { recursive: true, force: true })
    } catch (error) {
      console.error('Error cleaning up test directory:', error)
    }
  })

  it('should find git root from nested path', function () {
    const nested_path = path.join(test_repo_path, 'nested', 'deep', 'path')
    const result = find_git_root({
      file_path: nested_path,
      bounds_path: temp_dir
    })

    expect(result).to.equal(test_repo_path)
  })

  it('should find git root from file path', async function () {
    const file_path = path.join(test_repo_path, 'nested', 'test-file.txt')
    await fs.writeFile(file_path, 'test content')

    const result = find_git_root({
      file_path,
      bounds_path: temp_dir
    })

    expect(result).to.equal(test_repo_path)
  })

  it('should find git root from repo root directory', function () {
    const result = find_git_root({
      file_path: test_repo_path,
      bounds_path: temp_dir
    })

    expect(result).to.equal(test_repo_path)
  })

  it('should return null for non-git directory', async function () {
    const non_git_dir = path.join(temp_dir, 'non-git-dir')
    await fs.mkdir(non_git_dir, { recursive: true })

    const result = find_git_root({
      file_path: non_git_dir,
      bounds_path: temp_dir
    })

    expect(result).to.be.null
  })

  it('should stay within bounds_path', async function () {
    // Create a git repo outside the bounds
    const outside_repo = path.join(os.tmpdir(), `outside-repo-${Date.now()}`)
    await fs.mkdir(outside_repo, { recursive: true })
    await execute('git init', { cwd: outside_repo })

    // Create a subdirectory inside the outside repo
    const inner_dir = path.join(outside_repo, 'inner')
    await fs.mkdir(inner_dir, { recursive: true })

    // Search from inner_dir with bounds that don't include the .git
    const result = find_git_root({
      file_path: inner_dir,
      bounds_path: inner_dir
    })

    expect(result).to.be.null

    // Cleanup
    await fs.rm(outside_repo, { recursive: true, force: true })
  })

  it('should handle non-existent file paths', function () {
    const non_existent = path.join(test_repo_path, 'does', 'not', 'exist.txt')
    const result = find_git_root({
      file_path: non_existent,
      bounds_path: temp_dir
    })

    // Should still find the repo since we search from parent directories
    expect(result).to.equal(test_repo_path)
  })

  it('should handle git worktree (.git file)', async function () {
    // Create a worktree
    const worktree_path = path.join(temp_dir, 'worktree')

    // Make an initial commit so we can create a worktree
    await fs.writeFile(path.join(test_repo_path, 'README.md'), '# Test')
    await execute('git add README.md', { cwd: test_repo_path })
    await execute('git commit -m "Initial commit"', { cwd: test_repo_path })

    // Create worktree
    await execute(`git worktree add -b test-branch ${worktree_path}`, {
      cwd: test_repo_path
    })

    const nested_in_worktree = path.join(worktree_path, 'some', 'path')
    await fs.mkdir(nested_in_worktree, { recursive: true })

    const result = find_git_root({
      file_path: nested_in_worktree,
      bounds_path: temp_dir
    })

    expect(result).to.equal(worktree_path)

    // Cleanup worktree
    await execute(`git worktree remove ${worktree_path}`, {
      cwd: test_repo_path
    })
  })
})
