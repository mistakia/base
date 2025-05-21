/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuid } from 'uuid'

// Import the modules we want to test
import * as change_requests from '#libs-server/change-requests/index.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import db from '#db'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread
} from '#tests/utils/index.mjs'
const execute = promisify(exec)
const expect = chai.expect

describe('Change Requests', function () {
  let test_user
  let test_thread

  // Set longer timeout for Git operations
  this.timeout(30000)

  beforeEach(async function () {
    // Reset database tables
    await reset_all_tables()

    // Create a test user
    test_user = await create_test_user({
      email: 'test-cr@example.com',
      username: 'test_cr_user'
    })

    // Create a test thread with a git repo
    test_thread = await create_test_thread({
      user_id: test_user.user_id
    })
  })

  afterEach(async function () {
    // Clean up
    test_thread.cleanup()
  })

  // Helper to create a feature branch with some changes
  async function create_feature_branch(branch_name) {
    // Create and checkout branch
    await execute(`git checkout -b ${branch_name}`, {
      cwd: test_thread.user_base_directory
    })

    // Create a test file with unique content
    const file_name = `test-file-${uuid().substring(0, 8)}.md`
    const content = `# Test Content for ${branch_name}\n\nCreated at ${new Date().toISOString()}`

    await fs.writeFile(
      path.join(test_thread.user_base_directory, file_name),
      content
    )

    // Commit the changes
    await execute(`git add ${file_name}`, {
      cwd: test_thread.user_base_directory
    })
    await execute(`git commit -m "Add test file for ${branch_name}"`, {
      cwd: test_thread.user_base_directory
    })

    // Return to main branch
    await execute('git checkout main', { cwd: test_thread.user_base_directory })

    return { branch_name, file_name, content }
  }

  describe('create_change_request', function () {
    it('should create a change request from an existing branch', async function () {
      // Create a feature branch with some changes
      const { branch_name } = await create_feature_branch('feature/test-branch')

      // Call the function we're testing with an existing branch
      const change_request_id = await change_requests.create_change_request({
        title: 'Test Change Request From Existing Branch',
        description: 'Using an existing Git branch for changes',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch_name,
        thread_id: test_thread.thread_id,
        tags: ['test', 'existing-branch'],
        user_base_directory: test_thread.user_base_directory
      })

      // Verify results
      expect(change_request_id).to.exist

      // Check database record
      const record = await db('change_requests')
        .where({ change_request_id })
        .first()

      expect(record).to.exist
      expect(record.title).to.equal('Test Change Request From Existing Branch')
      expect(record.status).to.equal('PendingReview')
      expect(record.feature_branch).to.equal(branch_name)
      expect(record.target_branch).to.equal('main')
      expect(record.thread_id).to.equal(test_thread.thread_id)

      // Verify markdown file was created
      const markdown_dir = path.join(
        test_thread.user_base_directory,
        'change-requests'
      )
      const markdown_file_path = path.join(
        markdown_dir,
        `${change_request_id}.md`
      )
      const file_exists = await fs
        .access(markdown_file_path)
        .then(() => true)
        .catch(() => false)

      expect(file_exists).to.be.true

      // Check markdown content
      const markdown_data = await read_entity_from_filesystem({
        absolute_path: markdown_file_path
      })
      expect(markdown_data.entity_properties.title).to.equal(
        'Test Change Request From Existing Branch'
      )
      expect(markdown_data.entity_properties.description).to.include(
        'Using an existing Git branch'
      )
      expect(markdown_data.entity_properties.feature_branch).to.equal(
        branch_name
      )
      expect(markdown_data.entity_properties.target_branch).to.equal('main')
      expect(markdown_data.entity_properties.thread_id).to.equal(
        test_thread.thread_id
      )
      expect(markdown_data.entity_properties.tags).to.include.members([
        'test',
        'existing-branch'
      ])
    })

    it('should throw an error if branch does not exist', async function () {
      try {
        // Try to create a change request with non-existent branch
        await change_requests.create_change_request({
          title: 'Invalid Branch Test',
          description: 'This should fail',
          user_id: test_user.user_id,
          target_branch: 'main',
          feature_branch: 'non-existent-branch',
          thread_id: test_thread.thread_id,
          user_base_directory: test_thread.user_base_directory
        })

        // If we get here, the test should fail
        expect.fail('Expected an error but none was thrown')
      } catch (error) {
        expect(error.message).to.include('branch')
      }
    })
  })

  describe('get_change_request', function () {
    it('should retrieve a change request by ID', async function () {
      // Create a feature branch with changes
      const { branch_name } = await create_feature_branch(
        'feature/retrieve-test'
      )
      const description =
        'This is a test for get_change_request with existing branch'

      // Create a test change request
      const cr_id = await change_requests.create_change_request({
        title: 'Test CR for retrieval',
        description,
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch_name,
        thread_id: test_thread.thread_id,
        user_base_directory: test_thread.user_base_directory
      })

      // Retrieve the change request
      const retrieved_cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })

      // Verify retrieved data
      expect(retrieved_cr).to.exist
      expect(retrieved_cr.change_request_id).to.equal(cr_id)
      expect(retrieved_cr.title).to.equal('Test CR for retrieval')
      expect(retrieved_cr.description).to.equal(description)
      expect(retrieved_cr.feature_branch).to.equal(branch_name)
      expect(retrieved_cr.target_branch).to.equal('main')
      expect(retrieved_cr.thread_id).to.equal(test_thread.thread_id)
    })
  })

  describe('update_change_request_status', function () {
    it('should update status of a change request', async function () {
      // Create a feature branch with changes
      const { branch_name } = await create_feature_branch('feature/status-test')

      // Create a test change request
      const cr_id = await change_requests.create_change_request({
        title: 'Test CR for status update',
        description: 'Testing status updates',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch_name,
        thread_id: test_thread.thread_id,
        user_base_directory: test_thread.user_base_directory
      })

      // Update the status
      await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'Approved',
        updater_id: test_user.user_id,
        comment: 'Approving this change request',
        user_base_directory: test_thread.user_base_directory
      })

      // Verify the status was updated
      const updated_cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })

      expect(updated_cr.status).to.equal('Approved')
    })
  })

  describe('merge_change_request', function () {
    it('should merge an approved change request', async function () {
      // Create a feature branch with changes
      const { branch_name, file_name } =
        await create_feature_branch('feature/merge-test')

      // Create a test change request
      const cr_id = await change_requests.create_change_request({
        title: 'Test CR for merging',
        description: 'Testing merge functionality',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch_name,
        thread_id: test_thread.thread_id,
        user_base_directory: test_thread.user_base_directory
      })

      // Update status to approved first
      await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'Approved',
        updater_id: test_user.user_id,
        comment: 'Approving for merge test',
        user_base_directory: test_thread.user_base_directory
      })

      // Merge the change request
      await change_requests.merge_change_request({
        change_request_id: cr_id,
        merger_id: test_user.user_id,
        comment: 'Merging approved changes',
        user_base_directory: test_thread.user_base_directory
      })

      // Verify the change request was merged
      const merged_cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })

      expect(merged_cr.status).to.equal('Merged')
      expect(merged_cr.merged_at).to.exist

      // Verify the changes are in the target branch
      await execute('git checkout main', {
        cwd: test_thread.user_base_directory
      })
      const { stdout: file_list } = await execute('git ls-files', {
        cwd: test_thread.user_base_directory
      })

      expect(file_list).to.include(file_name)
    })

    it('should not merge change requests in wrong status', async function () {
      // Create a feature branch with changes
      const { branch_name } = await create_feature_branch(
        'feature/block-merge-test'
      )

      // Create a test change request (initially in PendingReview)
      const cr_id = await change_requests.create_change_request({
        title: 'Test CR for blocked merge',
        description: 'Testing merge restrictions',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch_name,
        thread_id: test_thread.thread_id,
        user_base_directory: test_thread.user_base_directory
      })

      try {
        // Try to merge without approval
        await change_requests.merge_change_request({
          change_request_id: cr_id,
          merger_id: test_user.user_id,
          comment: 'Trying to merge without approval',
          user_base_directory: test_thread.user_base_directory
        })

        // Should not reach here
        expect.fail(
          'Should have thrown an error for merging unapproved change request'
        )
      } catch (error) {
        expect(error.message).to.include('status')
      }

      // Verify status hasn't changed
      const cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })

      expect(cr.status).to.equal('PendingReview')
    })
  })

  describe('list_change_requests', function () {
    it('should list change requests with filters', async function () {
      // Create multiple feature branches with changes
      const branch1 = await create_feature_branch('feature/list-test-1')
      const branch2 = await create_feature_branch('feature/list-test-2')

      // Create multiple change requests
      const cr_id1 = await change_requests.create_change_request({
        title: 'Test CR 1',
        description: 'First test CR',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch1.branch_name,
        thread_id: test_thread.thread_id,
        tags: ['test', 'list'],
        user_base_directory: test_thread.user_base_directory
      })

      await change_requests.create_change_request({
        title: 'Test CR 2',
        description: 'Second test CR',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch2.branch_name,
        thread_id: test_thread.thread_id,
        tags: ['test', 'other'],
        user_base_directory: test_thread.user_base_directory
      })

      // Update status of one change request
      await change_requests.update_change_request_status({
        change_request_id: cr_id1,
        status: 'Approved',
        updater_id: test_user.user_id,
        comment: 'Approving for list test',
        user_base_directory: test_thread.user_base_directory
      })

      // List all change requests
      const all_crs = await change_requests.list_change_requests({
        user_base_directory: test_thread.user_base_directory
      })
      expect(all_crs.length).to.be.at.least(2)

      // Filter by status
      const approved_crs = await change_requests.list_change_requests({
        status: 'Approved',
        user_base_directory: test_thread.user_base_directory
      })
      expect(approved_crs.length).to.equal(1)
      expect(approved_crs[0].change_request_id).to.equal(cr_id1)

      // Filter by thread
      const thread_crs = await change_requests.list_change_requests({
        thread_id: test_thread.thread_id,
        user_base_directory: test_thread.user_base_directory
      })
      expect(thread_crs.length).to.be.at.least(2)
    })
  })
})
