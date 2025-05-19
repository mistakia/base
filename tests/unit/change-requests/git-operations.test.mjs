/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { promisify } from 'util'
import { exec } from 'child_process'

// Import the actual git operations to test
import * as change_request_utils from '#libs-server/change-requests/utils.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'

const expect = chai.expect
const execute = promisify(exec)

describe('Change Request Git Operations', function () {
  let test_repo
  let orig_cwd

  // Set longer timeout for Git operations
  this.timeout(30000)

  beforeEach(async function () {
    // Save original working directory
    orig_cwd = process.cwd()

    // Create temporary repository for testing
    test_repo = await create_temp_test_repo()

    // Change to the test repo directory so git operations use this path
    process.chdir(test_repo.user_path)
  })

  afterEach(async function () {
    // Restore original working directory
    process.chdir(orig_cwd)

    // Clean up the test repo
    test_repo.cleanup()
  })

  // Helper to create a feature branch with some changes
  async function create_feature_branch(branch_name) {
    // Create and checkout branch
    await execute(`git checkout -b ${branch_name}`, { cwd: test_repo.user_path })

    // Create a test file with unique content
    const file_name = `test-file-${uuid().substring(0, 8)}.md`
    const content = `# Test Content for ${branch_name}\n\nCreated at ${new Date().toISOString()}`

    await fs.writeFile(path.join(test_repo.user_path, file_name), content)

    // Commit the changes
    await execute(`git add ${file_name}`, { cwd: test_repo.user_path })
    await execute(`git commit -m "Add test file for ${branch_name}"`, {
      cwd: test_repo.user_path
    })

    // Return to main branch
    await execute('git checkout main', { cwd: test_repo.user_path })

    return { branch_name, file_name, content }
  }

  describe('get_change_request_commits', function () {
    it('should return commits specific to the feature branch', async function () {
      // Create a feature branch with changes
      const { branch_name, file_name } = await create_feature_branch(
        'feature/commits-test'
      )

      // Get the commits using the utility function
      const commits = await change_request_utils.get_change_request_commits({
        feature_branch: branch_name,
        target_branch: 'main',
        user_base_directory: test_repo.user_path
      })

      // Verify we got the expected commits
      expect(commits).to.be.an('array')
      expect(commits.length).to.equal(1)
      expect(commits[0].message).to.include(`Add test file for ${branch_name}`)

      // Verify we have file diffs
      expect(commits[0].files).to.be.an('array')
      expect(commits[0].files.length).to.equal(1)
      expect(commits[0].files[0].path).to.equal(file_name)
      expect(commits[0].files[0].status).to.equal('added')
      expect(commits[0].files[0].diff).to.be.a('string')
      expect(commits[0].files[0].diff).to.include(
        `Test Content for ${branch_name}`
      )
    })

    it('should return empty array if no commits exist', async function () {
      // Create an empty branch with no unique commits
      await execute('git checkout -b empty-branch', { cwd: test_repo.user_path })
      await execute('git checkout main', { cwd: test_repo.user_path })

      // Get the commits using the utility function
      const commits = await change_request_utils.get_change_request_commits({
        feature_branch: 'empty-branch',
        target_branch: 'main',
        user_base_directory: test_repo.user_path
      })

      // Verify we got no commits
      expect(commits).to.be.an('array')
      expect(commits.length).to.equal(0)
    })
  })

  describe('build_change_request_from_git', function () {
    it('should build change request data from Git information', async function () {
      // Create a feature branch with changes
      const { branch_name, file_name } = await create_feature_branch(
        'feature/build-cr-test'
      )

      // Build change request from git
      const cr_data = await change_request_utils.build_change_request_from_git({
        feature_branch: branch_name,
        target_branch: 'main',
        user_base_directory: test_repo.user_path
      })

      // Verify the data
      expect(cr_data).to.be.an('object')
      expect(cr_data.feature_branch).to.equal(branch_name)
      expect(cr_data.target_branch).to.equal('main')
      expect(cr_data.commits).to.be.an('array')
      expect(cr_data.commits.length).to.equal(1)
      expect(cr_data.branch_info).to.be.an('object')
      expect(cr_data.branch_info.name).to.equal(branch_name)
      expect(cr_data.branch_info.target).to.equal('main')
      expect(cr_data.branch_info.commits).to.equal(1)

      // Verify the file diffs in the commits
      expect(cr_data.commits[0].files).to.be.an('array')
      expect(cr_data.commits[0].files.length).to.equal(1)
      expect(cr_data.commits[0].files[0].path).to.equal(file_name)
      expect(cr_data.commits[0].files[0].status).to.equal('added')
      expect(cr_data.commits[0].files[0].diff).to.be.a('string')
    })

    it('should return data with empty commits for branch with no unique commits', async function () {
      // Create an empty branch
      await execute('git checkout -b empty-branch-for-build', {
        cwd: test_repo.user_path
      })
      await execute('git checkout main', { cwd: test_repo.user_path })

      // Build change request from git
      const cr_data = await change_request_utils.build_change_request_from_git({
        feature_branch: 'empty-branch-for-build',
        target_branch: 'main',
        user_base_directory: test_repo.user_path
      })

      // Verify the data
      expect(cr_data).to.be.an('object')
      expect(cr_data.feature_branch).to.equal('empty-branch-for-build')
      expect(cr_data.target_branch).to.equal('main')
      expect(cr_data.commits).to.be.an('array')
      expect(cr_data.commits.length).to.equal(0)
      expect(cr_data.branch_info.commits).to.equal(0)
    })
  })

  describe('merge_branch_for_change_request', function () {
    it('should merge feature branch into target branch', async function () {
      // Create a feature branch with changes
      const { branch_name, file_name } =
        await create_feature_branch('feature/merge-test')

      // Merge the feature branch
      const result = await change_request_utils.merge_branch_for_change_request(
        {
          target_branch: 'main',
          feature_branch: branch_name,
          merge_message: 'Merging test branch',
          delete_branch: false, // Keep branch for verification
          user_base_directory: test_repo.user_path
        }
      )

      // Verify the merge was successful
      expect(result).to.be.an('object')
      expect(result.success).to.be.true
      expect(result.merge_commit_hash).to.be.a('string')

      // Verify the file is now in the main branch
      await execute('git checkout main', { cwd: test_repo.user_path })
      const file_path = path.join(test_repo.user_path, file_name)
      const file_exists = await fs
        .access(file_path)
        .then(() => true)
        .catch(() => false)

      expect(file_exists).to.be.true
    })

    it('should throw error if branches do not exist', async function () {
      try {
        // Try to merge with non-existent branch
        await change_request_utils.merge_branch_for_change_request({
          target_branch: 'main',
          feature_branch: 'non-existent-branch',
          merge_message: 'This should fail',
          user_base_directory: test_repo.user_path
        })

        // If we get here, the test should fail
        expect.fail('Expected an error but none was thrown')
      } catch (error) {
        expect(error.message).to.include('Branch not found')
      }
    })

    it('should delete the feature branch after merging if specified', async function () {
      // Create a feature branch with changes
      const { branch_name, file_name } = await create_feature_branch(
        'feature/delete-after-merge'
      )

      // Merge the feature branch with delete_branch=true
      await change_request_utils.merge_branch_for_change_request({
        target_branch: 'main',
        feature_branch: branch_name,
        merge_message: 'Merge and delete test',
        delete_branch: true, // Delete branch after merging
        user_base_directory: test_repo.user_path
      })

      // Verify the branch was deleted
      const { stdout: branch_list } = await execute('git branch', {
        cwd: test_repo.user_path
      })

      expect(branch_list).to.not.include(branch_name)

      // Verify the changes were merged successfully
      await execute('git checkout main', { cwd: test_repo.user_path })
      const file_path = path.join(test_repo.user_path, file_name)
      const file_exists = await fs
        .access(file_path)
        .then(() => true)
        .catch(() => false)

      expect(file_exists).to.be.true
    })
  })
})
