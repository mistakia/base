/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

// Import the functions we want to test
import {
  delete_file_from_git,
  write_file_to_git
} from '#libs-server/git/git-files/index.mjs'
import git from '#libs-server/git/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('delete_file_from_git', function () {
  let test_repo_path
  let remote_repo_path

  // Create test repositories before tests
  beforeEach(async function () {
    // Create temporary directories for test repos
    const temp_dir = os.tmpdir()
    test_repo_path = path.join(
      temp_dir,
      `git-delete-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )
    remote_repo_path = path.join(
      temp_dir,
      `git-delete-remote-${Date.now()}-${Math.floor(Math.random() * 10000)}`
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

    // Add a test file to be deleted
    await fs.writeFile(
      path.join(test_repo_path, 'test-delete.md'),
      '# File to be deleted'
    )
    await execute('git add test-delete.md', { cwd: test_repo_path })
    await execute('git commit -m "Add file to be deleted"', {
      cwd: test_repo_path
    })
    await execute('git push origin feature-branch', { cwd: test_repo_path })

    // Return to main branch
    await execute('git checkout main', { cwd: test_repo_path })

    // Add a test file to main branch to be deleted
    await fs.writeFile(
      path.join(test_repo_path, 'main-delete.md'),
      '# Main file to be deleted'
    )
    await execute('git add main-delete.md', { cwd: test_repo_path })
    await execute('git commit -m "Add file to be deleted on main"', {
      cwd: test_repo_path
    })
    await execute('git push origin main', { cwd: test_repo_path })
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

  it('should delete a file from a git repository with commit', async function () {
    const git_relative_path = 'main-delete.md'
    const branch = 'main'
    const commit_message = 'Delete test file'

    // First, verify the file exists
    const exists_before = await git
      .read_file_from_ref({
        repo_path: test_repo_path,
        ref: branch,
        file_path: git_relative_path
      })
      .then(() => true)
      .catch(() => false)

    expect(exists_before).to.be.true

    // Delete the file using our function
    const result = await delete_file_from_git({
      repo_path: test_repo_path,
      git_relative_path,
      branch,
      commit_message
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.git_relative_path).to.equal(git_relative_path)
    expect(result.branch).to.equal(branch)

    // Verify the file was deleted from git
    try {
      await git.read_file_from_ref({
        repo_path: test_repo_path,
        ref: branch,
        file_path: git_relative_path
      })
      expect.fail('File should be deleted from git')
    } catch (error) {
      expect(error.message).to.include('fatal')
    }

    // Verify the commit message
    const { stdout } = await execute('git log -1 --pretty=%B', {
      cwd: test_repo_path
    })
    expect(stdout.trim()).to.equal(commit_message)
  })

  it('should delete a file from a different branch', async function () {
    const git_relative_path = 'test-delete.md'
    const branch = 'feature-branch'
    const commit_message = 'Delete feature branch file'

    // Delete the file from feature-branch
    const result = await delete_file_from_git({
      repo_path: test_repo_path,
      git_relative_path,
      branch,
      commit_message
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.git_relative_path).to.equal(git_relative_path)
    expect(result.branch).to.equal(branch)

    // Verify the file is deleted from the feature branch
    try {
      await git.read_file_from_ref({
        repo_path: test_repo_path,
        ref: branch,
        file_path: git_relative_path
      })
      expect.fail('File should be deleted from git')
    } catch (error) {
      expect(error.message).to.include('fatal')
    }

    // Check that the file is only deleted from the specified branch
    await execute('git checkout main', { cwd: test_repo_path })
    const main_files = await git.list_files({
      repo_path: test_repo_path,
      ref: 'main'
    })
    expect(main_files).to.include('main-delete.md')
    expect(main_files).to.not.include('test-delete.md')
  })

  it('should stage deletion without committing when no commit message is provided', async function () {
    const git_relative_path = 'main-delete.md'
    const branch = 'main'

    // Delete the file without a commit message
    const result = await delete_file_from_git({
      repo_path: test_repo_path,
      git_relative_path,
      branch
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.git_relative_path).to.equal(git_relative_path)
    expect(result.branch).to.equal(branch)

    // Verify the file is physically deleted
    const full_file_path = path.join(test_repo_path, git_relative_path)
    const file_exists = await fs
      .access(full_file_path)
      .then(() => true)
      .catch(() => false)
    expect(file_exists).to.be.false

    // Verify the file is in the staging area (git index) but not committed
    const { stdout: git_status } = await execute('git status --porcelain', {
      cwd: test_repo_path
    })
    expect(git_status).to.include('D  ' + git_relative_path)

    // Verify the file is still in the git history
    const file_content = await git.read_file_from_ref({
      repo_path: test_repo_path,
      ref: branch,
      file_path: git_relative_path
    })
    expect(file_content).to.include('# Main file to be deleted')

    // Now commit the deletion and verify it's gone from git history
    await execute('git commit -m "Commit the staged deletion"', {
      cwd: test_repo_path
    })

    try {
      await git.read_file_from_ref({
        repo_path: test_repo_path,
        ref: branch,
        file_path: git_relative_path
      })
      expect.fail('File should be deleted from git history')
    } catch (error) {
      expect(error.message).to.include('fatal')
    }
  })

  it('should fail if the branch does not exist', async function () {
    const git_relative_path = 'test-delete.md'
    const branch = 'non-existent-branch'

    // Attempt to delete from a non-existent branch
    const result = await delete_file_from_git({
      repo_path: test_repo_path,
      git_relative_path,
      branch,
      commit_message: 'This should fail'
    })

    // Validate the failure
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })

  it('should delete a nested file from a git repository', async function () {
    // Create a nested file first
    const nested_path = 'nested/path/to/delete-me.md'
    const content = '# Nested file to delete'

    // Create the nested file first
    await write_file_to_git({
      repo_path: test_repo_path,
      git_relative_path: nested_path,
      content,
      branch: 'main',
      commit_message: 'Add nested file to be deleted'
    })

    // Now delete it
    const result = await delete_file_from_git({
      repo_path: test_repo_path,
      git_relative_path: nested_path,
      branch: 'main',
      commit_message: 'Delete nested file'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.git_relative_path).to.equal(nested_path)

    // Verify the file was deleted
    try {
      await git.read_file_from_ref({
        repo_path: test_repo_path,
        ref: 'main',
        file_path: nested_path
      })
      expect.fail('Nested file should be deleted from git')
    } catch (error) {
      expect(error.message).to.include('fatal')
    }
  })
})
