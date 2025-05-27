/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

// Import the function we want to test
import { write_file_to_git } from '#libs-server/git/git-files/index.mjs'
import git from '#libs-server/git/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('Git Files Operations', function () {
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

  describe('write_file_to_git', function () {
    it('should write a file to a git repository', async function () {
      const git_relative_path = 'test-write-file.md'
      const content = '# Test File Content\n\nThis is a test file.'
      const branch = 'main'
      const commit_message = 'Add test file'

      // Write the file using our function
      const result = await write_file_to_git({
        repo_path: test_repo_path,
        git_relative_path,
        content,
        branch,
        commit_message
      })

      // Validate result
      expect(result.success).to.be.true
      expect(result.git_relative_path).to.equal(git_relative_path)
      expect(result.branch).to.equal(branch)

      // Verify the file was written and committed to git
      const file_content = await git.read_file_from_ref({
        repo_path: test_repo_path,
        ref: branch,
        file_path: git_relative_path
      })

      expect(file_content).to.equal(content)
    })

    it('should stage changes without committing when no commit message is provided', async function () {
      const git_relative_path = 'test-staged-file.md'
      const content =
        '# Test Staged Content\n\nThis should be staged but not committed.'
      const branch = 'main'

      // Write the file without a commit message
      const result = await write_file_to_git({
        repo_path: test_repo_path,
        git_relative_path,
        content,
        branch
      })

      // Validate result
      expect(result.success).to.be.true
      expect(result.git_relative_path).to.equal(git_relative_path)
      expect(result.branch).to.equal(branch)

      // Verify the file is present on disk
      const full_file_path = path.join(test_repo_path, git_relative_path)
      const file_exists = await fs
        .access(full_file_path)
        .then(() => true)
        .catch(() => false)
      expect(file_exists).to.be.true

      // Verify the file is in the staging area (git index) but not committed
      const { stdout: git_status } = await execute('git status --porcelain', {
        cwd: test_repo_path
      })
      expect(git_status).to.include(git_relative_path)

      // Verify the file is not yet in the git history
      try {
        await git.read_file_from_ref({
          repo_path: test_repo_path,
          ref: branch,
          file_path: git_relative_path
        })
        expect.fail('File should not be in git history yet')
      } catch (error) {
        expect(error.message).to.include('fatal: path')
      }

      // Now commit the file and verify it's in git history
      await execute('git commit -m "Commit the staged file"', {
        cwd: test_repo_path
      })

      const committed_content = await git.read_file_from_ref({
        repo_path: test_repo_path,
        ref: branch,
        file_path: git_relative_path
      })
      expect(committed_content).to.equal(content)
    })

    it('should write a file and commit changes', async function () {
      const git_relative_path = 'test-committed-file.md'
      const content = '# Committed Test Content\n\nThis will be committed.'
      const branch = 'main'
      const commit_message = 'Add test committed file'

      // Write and commit the file
      const result = await write_file_to_git({
        repo_path: test_repo_path,
        git_relative_path,
        content,
        branch,
        commit_message
      })

      // Validate result
      expect(result.success).to.be.true
      expect(result.git_relative_path).to.equal(git_relative_path)
      expect(result.branch).to.equal(branch)

      // Verify the file was committed with the correct message
      const { stdout } = await execute('git log -1 --pretty=%B', {
        cwd: test_repo_path
      })
      expect(stdout.trim()).to.equal(commit_message)

      // Verify the file content
      const file_content = await git.read_file_from_ref({
        repo_path: test_repo_path,
        ref: branch,
        file_path: git_relative_path
      })
      expect(file_content).to.equal(content)
    })

    it('should create nested directories as needed', async function () {
      const git_relative_path = 'nested/directory/structure/test-file.md'
      const content = '# Nested File Content'
      const branch = 'main'

      // Write the file using our function
      const result = await write_file_to_git({
        repo_path: test_repo_path,
        git_relative_path,
        content,
        branch,
        commit_message: 'Add nested file'
      })

      // Validate result
      expect(result.success).to.be.true
      expect(result.git_relative_path).to.equal(git_relative_path)

      // Verify the file was written
      const file_content = await git.read_file_from_ref({
        repo_path: test_repo_path,
        ref: branch,
        file_path: git_relative_path
      })
      expect(file_content).to.equal(content)
    })

    it('should write to a different branch', async function () {
      const git_relative_path = 'branch-specific-file.md'
      const content = '# Branch Specific Content'
      const branch = 'feature-branch'

      // Write the file to feature-branch
      const result = await write_file_to_git({
        repo_path: test_repo_path,
        git_relative_path,
        content,
        branch,
        commit_message: 'Add branch specific file'
      })

      // Validate result
      expect(result.success).to.be.true
      expect(result.git_relative_path).to.equal(git_relative_path)
      expect(result.branch).to.equal(branch)

      // Verify file exists in feature-branch
      const file_content = await git.read_file_from_ref({
        repo_path: test_repo_path,
        ref: branch,
        file_path: git_relative_path
      })
      expect(file_content).to.equal(content)

      // Verify file does NOT exist in main branch
      try {
        await git.read_file_from_ref({
          repo_path: test_repo_path,
          ref: 'main',
          file_path: git_relative_path
        })
        // Should not reach here
        expect.fail('File should not exist in main branch')
      } catch (error) {
        // Expected error
        expect(error.message).to.include('failed')
      }
    })

    it('should handle errors when branch does not exist', async function () {
      const git_relative_path = 'error-test-file.md'
      const content = '# Error Test Content'
      const non_existent_branch = `non-existent-branch-${Date.now()}`

      // Try to write to non-existent branch
      const result = await write_file_to_git({
        repo_path: test_repo_path,
        git_relative_path,
        content,
        branch: non_existent_branch
      })

      // Validate error result
      expect(result.success).to.be.false
      expect(result.error).to.include(
        `Branch ${non_existent_branch} does not exist`
      )
    })

    it('should reject if required parameters are missing', async function () {
      // Test missing repo_path
      try {
        await write_file_to_git({
          git_relative_path: 'test.md',
          content: 'content',
          branch: 'main'
        })
        expect.fail('Should have thrown an error for missing repo_path')
      } catch (error) {
        expect(error.message).to.include('Repository path is required')
      }

      // Test missing git_relative_path
      try {
        await write_file_to_git({
          repo_path: test_repo_path,
          content: 'content',
          branch: 'main'
        })
        expect.fail('Should have thrown an error for missing git_relative_path')
      } catch (error) {
        expect(error.message).to.include('Git relative path is required')
      }

      // Test missing content
      try {
        await write_file_to_git({
          repo_path: test_repo_path,
          git_relative_path: 'test.md',
          branch: 'main'
        })
        expect.fail('Should have thrown an error for missing content')
      } catch (error) {
        expect(error.message).to.include('Content is required')
      }

      // Test missing branch
      try {
        await write_file_to_git({
          repo_path: test_repo_path,
          git_relative_path: 'test.md',
          content: 'content'
        })
        expect.fail('Should have thrown an error for missing branch')
      } catch (error) {
        expect(error.message).to.include('Branch is required')
      }
    })
  })
})
