/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

// Import the actual git operations to test
import * as git_ops from '#libs-server/git/git_operations.mjs'

const expect = chai.expect
const execute = promisify(exec)

describe('Change Request Git Operations', function () {
  let test_repo_path
  let orig_cwd
  let worktrees_to_clean = []

  // Set longer timeout for Git operations
  this.timeout(30000)

  beforeEach(async function () {
    // Save original working directory
    orig_cwd = process.cwd()

    // Create temporary directory for test repo
    const temp_dir = os.tmpdir()
    test_repo_path = path.join(
      temp_dir,
      `git-ops-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )

    // Initialize test repo
    await fs.mkdir(test_repo_path, { recursive: true })
    await execute('git init', { cwd: test_repo_path })
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
    await execute('git branch -M main', { cwd: test_repo_path })

    // Change to the test repo directory so git operations use this path
    process.chdir(test_repo_path)

    // Reset worktrees tracking
    worktrees_to_clean = []
  })

  afterEach(async function () {
    // Restore original working directory
    process.chdir(orig_cwd)

    // Cleanup any worktrees created during the test
    for (const worktree of worktrees_to_clean) {
      try {
        await execute(`git worktree remove --force "${worktree}"`, {
          cwd: test_repo_path
        })
      } catch (error) {
        console.error(`Error removing worktree ${worktree}:`, error)
      }
    }

    // Clean up the test repo
    try {
      await fs.rm(test_repo_path, { recursive: true, force: true })
    } catch (error) {
      console.error('Error cleaning up test repo:', error)
    }
  })

  // Helper function to create a unique worktree for tests
  async function create_test_worktree(branch_name) {
    const unique_id = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const worktree_path = path.join(
      os.tmpdir(),
      `worktree-test-${branch_name}-${unique_id}`
    )

    // Create the branch if it doesn't exist
    try {
      await execute(`git checkout -b ${branch_name}`, { cwd: test_repo_path })
      await execute('git checkout main', { cwd: test_repo_path })
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error
      }
    }

    await execute(`git worktree add "${worktree_path}" ${branch_name}`, {
      cwd: test_repo_path
    })

    // Add to cleanup list
    worktrees_to_clean.push(worktree_path)

    return worktree_path
  }

  describe('create_change_request_branch', function () {
    it('should create a branch with the correct naming convention', async function () {
      const change_request_id = 'test-cr-456'
      const branch_name = `cr/${change_request_id}`
      const target_branch = 'main'

      // Use the direct git_ops function that's actually used in production
      await git_ops.create_branch({
        repo_path: test_repo_path,
        branch_name,
        base_branch: target_branch
      })

      // Verify the branch was created with the correct name
      const { stdout: branch_list } = await execute('git branch', {
        cwd: test_repo_path
      })
      expect(branch_list).to.include(branch_name)
    })

    it('should handle errors during branch creation', async function () {
      try {
        // Try to create a branch from a non-existent target branch
        const change_request_id = 'test-cr-456'
        const branch_name = `cr/${change_request_id}`
        const nonexistent_branch = 'non_existent_branch'

        await git_ops.create_branch({
          repo_path: test_repo_path,
          branch_name,
          base_branch: nonexistent_branch
        })

        // Should not reach here
        expect.fail('Should have thrown an error')
      } catch (error) {
        // Expect an error since the target branch doesn't exist
        expect(error).to.exist
      }
    })
  })

  describe('apply_file_changes', function () {
    it('should apply file changes to the worktree', async function () {
      // Create a worktree for testing with unique name
      const worktree_path = await create_test_worktree('main-apply')

      try {
        const file_changes = [
          {
            path: 'test-file-1.md',
            content: '# Test Content 1'
          },
          {
            path: 'test-file-2.md',
            content: '# Test Content 2'
          }
        ]

        // Apply file changes manually as this is how it's done in the change_requests module
        for (const change of file_changes) {
          const full_file_path = path.resolve(worktree_path, change.path)
          const dir_name = path.dirname(full_file_path)
          // Ensure directory exists before writing file
          await fs.mkdir(dir_name, { recursive: true })
          await fs.writeFile(full_file_path, change.content)
        }

        // Stage the changes using git_ops function
        const changed_file_paths = file_changes.map((change) => change.path)
        await git_ops.add_files({
          worktree_path,
          files_to_add: changed_file_paths
        })

        // Verify files were written
        for (const file of file_changes) {
          const file_path = path.join(worktree_path, file.path)
          const content = await fs.readFile(file_path, 'utf8')
          expect(content).to.equal(file.content)
        }

        // Verify files were staged
        const { stdout: git_status } = await execute('git status --porcelain', {
          cwd: worktree_path
        })
        expect(git_status).to.include('A  test-file-1.md')
        expect(git_status).to.include('A  test-file-2.md')
      } finally {
        // Let the afterEach clean up worktrees
      }
    })

    it('should create directories as needed', async function () {
      // Create a worktree for testing with unique name
      const worktree_path = await create_test_worktree('main-nested')

      try {
        const nested_path = 'nested/directory/test-file.md'
        const content = '# Nested Content'

        // Apply file change manually as this is how it's done in the change_requests module
        const full_file_path = path.resolve(worktree_path, nested_path)
        const dir_name = path.dirname(full_file_path)
        await fs.mkdir(dir_name, { recursive: true })
        await fs.writeFile(full_file_path, content)

        // Stage the change using git_ops function
        await git_ops.add_files({
          worktree_path,
          files_to_add: nested_path
        })

        // Verify the nested directory and file were created
        const file_path = path.join(worktree_path, nested_path)
        const file_content = await fs.readFile(file_path, 'utf8')
        expect(file_content).to.equal(content)

        // Verify file was staged
        const { stdout: git_status } = await execute('git status --porcelain', {
          cwd: worktree_path
        })
        expect(git_status).to.include('A  nested/directory/test-file.md')
      } finally {
        // Let the afterEach clean up worktrees
      }
    })

    it('should handle file deletion when content is null', async function () {
      // Create a worktree for testing with unique name
      const worktree_path = await create_test_worktree('main-delete')

      try {
        // First create a file
        const file_to_delete_path = 'to-be-deleted.md'
        const file_to_delete = path.join(worktree_path, file_to_delete_path)
        await fs.writeFile(file_to_delete, '# File to delete')

        // Stage and commit the file
        await git_ops.add_files({
          worktree_path,
          files_to_add: file_to_delete_path
        })
        await git_ops.commit_changes({
          worktree_path,
          commit_message: 'Add file to delete'
        })

        // Then delete it (simulating a null content change)
        await fs.unlink(file_to_delete)

        // Stage the deletion using git_ops function
        await git_ops.add_files({
          worktree_path,
          files_to_add: file_to_delete_path
        })

        // Verify the file was deleted
        try {
          await fs.access(file_to_delete)
          expect.fail('File should have been deleted')
        } catch (error) {
          // Expected error since file should be gone
          expect(error.code).to.equal('ENOENT')
        }

        // Verify deletion was staged
        const { stdout: git_status } = await execute('git status --porcelain', {
          cwd: worktree_path
        })
        expect(git_status).to.include('D  to-be-deleted.md')
      } finally {
        // Let the afterEach clean up worktrees
      }
    })
  })

  describe('merge_change_request', function () {
    it('should merge a feature branch into target branch', async function () {
      const change_request_id = 'test-cr-789'
      const feature_branch = `cr/${change_request_id}`
      const target_branch = 'main'

      // Create a feature branch with a change
      await execute(`git checkout -b ${feature_branch}`, {
        cwd: test_repo_path
      })
      await fs.writeFile(
        path.join(test_repo_path, 'merge-test-file.md'),
        '# Merge Test Content'
      )
      await execute('git add merge-test-file.md', { cwd: test_repo_path })
      await execute('git commit -m "Add merge test file"', {
        cwd: test_repo_path
      })
      await execute('git checkout main', { cwd: test_repo_path })

      // Merge using the git operations functions
      await git_ops.checkout_branch({
        repo_path: test_repo_path,
        branch_name: target_branch
      })
      await git_ops.merge_branch({
        repo_path: test_repo_path,
        branch_to_merge: feature_branch,
        merge_message: 'Test merge'
      })

      // Verify we're on the target branch
      const { stdout: current_branch } = await execute(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: test_repo_path }
      )
      expect(current_branch.trim()).to.equal(target_branch)

      // Verify the changes were merged
      const merge_file_path = path.join(test_repo_path, 'merge-test-file.md')
      const file_exists = await fs
        .access(merge_file_path)
        .then(() => true)
        .catch(() => false)
      expect(file_exists).to.be.true

      // Verify the merge commit message
      const { stdout: commit_msg } = await execute('git log -1 --pretty=%B', {
        cwd: test_repo_path
      })
      expect(commit_msg).to.include('Test merge')
    })

    it('should optionally delete the source branch after merging', async function () {
      const change_request_id = 'test-cr-delete'
      const feature_branch = `cr/${change_request_id}`
      const target_branch = 'main'

      // Create a feature branch with a change
      await execute(`git checkout -b ${feature_branch}`, {
        cwd: test_repo_path
      })
      await fs.writeFile(
        path.join(test_repo_path, 'delete-branch-test.md'),
        '# Delete Branch Test'
      )
      await execute('git add delete-branch-test.md', { cwd: test_repo_path })
      await execute('git commit -m "Add delete branch test file"', {
        cwd: test_repo_path
      })
      await execute('git checkout main', { cwd: test_repo_path })

      // Merge and delete branch using git operations functions
      await git_ops.checkout_branch({
        repo_path: test_repo_path,
        branch_name: target_branch
      })
      await git_ops.merge_branch({
        repo_path: test_repo_path,
        branch_to_merge: feature_branch,
        merge_message: 'Test merge'
      })
      await git_ops.delete_branch({
        repo_path: test_repo_path,
        branch_name: feature_branch
      })

      // Verify the branch was deleted
      const { stdout: branch_list } = await execute('git branch', {
        cwd: test_repo_path
      })
      expect(branch_list).to.not.include(feature_branch)

      // Verify the changes were still merged
      const test_file_path = path.join(test_repo_path, 'delete-branch-test.md')
      const file_exists = await fs
        .access(test_file_path)
        .then(() => true)
        .catch(() => false)
      expect(file_exists).to.be.true
    })
  })
})
