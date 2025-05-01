/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

// Import the functions we want to test
import {
  write_file_to_git,
  file_exists_in_git
} from '#libs-server/git/git-files/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('file_exists_in_git', function () {
  let test_repo_path
  let remote_repo_path

  // Create test repositories before tests
  beforeEach(async function () {
    // Create temporary directories for test repos
    const temp_dir = os.tmpdir()
    test_repo_path = path.join(
      temp_dir,
      `git-files-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )
    remote_repo_path = path.join(
      temp_dir,
      `git-files-remote-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )

    // Create remote test repository
    await fs.mkdir(remote_repo_path, { recursive: true })
    await execute('git init --bare', { cwd: remote_repo_path })

    // Create local test repository
    await fs.mkdir(test_repo_path, { recursive: true })
    await execute('git init', { cwd: test_repo_path })
    await execute(`git remote add origin ${remote_repo_path}`, {
      cwd: test_repo_path
    })

    // Configure git for tests
    await execute('git config user.name "Test User"', { cwd: test_repo_path })
    await execute('git config user.email "test@example.com"', {
      cwd: test_repo_path
    })

    // Create initial commit
    await fs.writeFile(
      path.join(test_repo_path, 'README.md'),
      '# Test Repository'
    )
    await execute('git add README.md', { cwd: test_repo_path })
    await execute('git commit -m "Initial commit"', { cwd: test_repo_path })

    // Create and push master/main branch
    await execute('git branch -M main', { cwd: test_repo_path })
    await execute('git push -u origin main', { cwd: test_repo_path })

    // Create a feature branch
    await execute('git checkout -b feature-branch', { cwd: test_repo_path })
    await fs.writeFile(
      path.join(test_repo_path, 'feature.md'),
      '# Feature Content'
    )
    await execute('git add feature.md', { cwd: test_repo_path })
    await execute('git commit -m "Add feature"', { cwd: test_repo_path })
    await execute('git push -u origin feature-branch', { cwd: test_repo_path })

    // Return to main branch
    await execute('git checkout main', { cwd: test_repo_path })
  })

  // Clean up after tests
  afterEach(async function () {
    try {
      await fs.rm(test_repo_path, { recursive: true, force: true })
      await fs.rm(remote_repo_path, { recursive: true, force: true })
    } catch (error) {
      console.error('Error cleaning up test repositories:', error)
    }
  })

  it('should return true for existing files in a branch', async function () {
    const file_path = 'test-exists-file.md'
    const content = '# Test File Content'
    const branch = 'main'
    const commit_message = 'Add test file for existence check'

    // First write a file to check
    await write_file_to_git({
      repo_path: test_repo_path,
      file_path,
      content,
      branch,
      commit_message
    })

    // Check if file exists
    const result = await file_exists_in_git({
      repo_path: test_repo_path,
      file_path,
      branch
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.file_path).to.equal(file_path)
    expect(result.branch).to.equal(branch)
  })

  it('should return false for non-existent files in a branch', async function () {
    const file_path = 'non-existent-file.md'
    const branch = 'main'

    const result = await file_exists_in_git({
      repo_path: test_repo_path,
      file_path,
      branch
    })

    expect(result.success).to.be.true
    expect(result.exists).to.be.false
    expect(result.file_path).to.equal(file_path)
    expect(result.branch).to.equal(branch)
  })

  it('should check files in different branches correctly', async function () {
    const file_path = 'branch-specific-file.md'
    const content = '# Branch Specific Content'
    const branch = 'feature-branch'
    const commit_message = 'Add branch-specific file'

    // Write file to feature branch
    await execute('git checkout feature-branch', { cwd: test_repo_path })
    await write_file_to_git({
      repo_path: test_repo_path,
      file_path,
      content,
      branch,
      commit_message
    })
    await execute('git checkout main', { cwd: test_repo_path })

    // Check file exists in feature branch
    const feature_result = await file_exists_in_git({
      repo_path: test_repo_path,
      file_path,
      branch: 'feature-branch'
    })

    // Check file doesn't exist in main branch
    const main_result = await file_exists_in_git({
      repo_path: test_repo_path,
      file_path,
      branch: 'main'
    })

    expect(feature_result.success).to.be.true
    expect(feature_result.exists).to.be.true
    expect(main_result.success).to.be.true
    expect(main_result.exists).to.be.false
  })

  it('should handle non-existent branches gracefully', async function () {
    const file_path = 'test-file.md'
    const branch = 'non-existent-branch'

    const result = await file_exists_in_git({
      repo_path: test_repo_path,
      file_path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('Branch non-existent-branch does not exist')
    expect(result.file_path).to.equal(file_path)
  })

  it('should validate required parameters', async function () {
    // Test missing repo_path
    try {
      await file_exists_in_git({
        file_path: 'test.md',
        branch: 'main'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Repository path is required')
    }

    // Test missing file_path
    try {
      await file_exists_in_git({
        repo_path: test_repo_path,
        branch: 'main'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('File path is required')
    }

    // Test missing branch
    try {
      await file_exists_in_git({
        repo_path: test_repo_path,
        file_path: 'test.md'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Branch is required')
    }
  })
})
