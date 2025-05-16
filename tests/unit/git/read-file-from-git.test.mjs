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
  read_file_from_git
} from '#libs-server/git/git-files/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('read_file_from_git', function () {
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

  it('should read a file from a specific branch', async function () {
    const git_relative_path = 'test-read-file.md'
    const content = '# Test File Content\n\nThis is a test file.'
    const branch = 'main'
    const commit_message = 'Add test file for reading'

    // First write a file to read
    await write_file_to_git({
      repo_path: test_repo_path,
      git_relative_path,
      content,
      branch,
      commit_message
    })

    // Read the file using our function
    const result = await read_file_from_git({
      repo_path: test_repo_path,
      git_relative_path,
      branch
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.content).to.equal(content)
    expect(result.git_relative_path).to.equal(git_relative_path)
    expect(result.branch).to.equal(branch)
  })

  it('should read a file from a different branch', async function () {
    const git_relative_path = 'feature-specific-file.md'
    const content = '# Feature Branch Content'
    const branch = 'feature-branch'
    const commit_message = 'Add feature-specific file'

    // Write file to feature branch
    await execute('git checkout feature-branch', { cwd: test_repo_path })
    await write_file_to_git({
      repo_path: test_repo_path,
      git_relative_path,
      content,
      branch,
      commit_message
    })
    await execute('git checkout main', { cwd: test_repo_path })

    // Read the file from feature branch while on main
    const result = await read_file_from_git({
      repo_path: test_repo_path,
      git_relative_path,
      branch
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.content).to.equal(content)
    expect(result.git_relative_path).to.equal(git_relative_path)
    expect(result.branch).to.equal(branch)
  })

  it('should handle non-existent files gracefully', async function () {
    const git_relative_path = 'non-existent-file.md'
    const branch = 'main'

    const result = await read_file_from_git({
      repo_path: test_repo_path,
      git_relative_path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('Failed to read file')
    expect(result.git_relative_path).to.equal(git_relative_path)
  })

  it('should handle non-existent branches gracefully', async function () {
    const git_relative_path = 'test-file.md'
    const branch = 'non-existent-branch'

    const result = await read_file_from_git({
      repo_path: test_repo_path,
      git_relative_path,
      branch
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('Branch non-existent-branch does not exist')
    expect(result.git_relative_path).to.equal(git_relative_path)
  })

  it('should validate required parameters', async function () {
    // Test missing repo_path
    try {
      await read_file_from_git({
        git_relative_path: 'test.md',
        branch: 'main'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Repository path is required')
    }

    // Test missing git_relative_path
    try {
      await read_file_from_git({
        repo_path: test_repo_path,
        branch: 'main'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Git relative path is required')
    }

    // Test missing branch
    try {
      await read_file_from_git({
        repo_path: test_repo_path,
        git_relative_path: 'test.md'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Branch is required')
    }
  })
})
