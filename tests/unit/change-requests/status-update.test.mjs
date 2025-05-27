/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'

// Import modules to test
import * as change_requests from '#libs-server/change-requests/index.mjs'
import {
  VALID_STATUSES,
  VALID_TRANSITIONS
} from '#libs-server/change-requests/constants.mjs'
import db from '#db'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread
} from '#tests/utils/index.mjs'
import { promisify } from 'util'
import { exec } from 'child_process'

const execute = promisify(exec)
const expect = chai.expect

describe('Change Request Status Updates', function () {
  let test_user
  let test_thread
  let feature_branch

  // Set longer timeout for Git operations
  this.timeout(30000)

  beforeEach(async function () {
    // Reset database tables
    await reset_all_tables()

    // Create a test user
    test_user = await create_test_user({
      email: 'status-test@example.com',
      username: 'status_test_user'
    })

    // Create a test thread with a git repo
    test_thread = await create_test_thread({
      user_id: test_user.user_id
    })

    // Create the change_requests directory
    await fs.mkdir(
      path.join(test_thread.user_base_directory, 'change-requests'),
      {
        recursive: true
      }
    )

    // Create a feature branch with changes for testing
    feature_branch = `feature/status-test-${uuid().substring(0, 8)}`
    await execute(`git checkout -b ${feature_branch}`, {
      cwd: test_thread.user_base_directory
    })

    // Create a test file
    const test_file = path.join(
      test_thread.user_base_directory,
      'status-test-file.md'
    )
    await fs.writeFile(test_file, '# Status Test Content')

    // Commit the changes
    await execute('git add .', { cwd: test_thread.user_base_directory })
    await execute('git commit -m "Add test file for status testing"', {
      cwd: test_thread.user_base_directory
    })

    // Return to main branch
    await execute('git checkout main', { cwd: test_thread.user_base_directory })
  })

  afterEach(async function () {
    // Clean up
    test_thread.cleanup()
  })

  describe('update_change_request_status', function () {
    it('should update status in database and markdown file', async function () {
      // Create a change request
      const cr_id = await change_requests.create_change_request({
        title: 'Status Update Test',
        description: 'Testing status update functionality',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch,
        thread_id: test_thread.thread_id,
        user_base_directory: test_thread.user_base_directory
      })

      // Initial status should be PendingReview
      const cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })
      expect(cr.status).to.equal('PendingReview')

      // Update status to Approved
      const update_result = await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'Approved',
        updater_id: test_user.user_id,
        comment: 'Approving for testing',
        user_base_directory: test_thread.user_base_directory
      })

      // Verify update result
      expect(update_result.status).to.equal('Approved')
      expect(update_result.change_request_id).to.equal(cr_id)

      // Verify database record
      const db_record = await db('change_requests')
        .where({ change_request_id: cr_id })
        .first()

      expect(db_record.status).to.equal('Approved')

      // Verify markdown file status
      const markdown_file = path.join(
        test_thread.user_base_directory,
        'change-requests',
        `${cr_id}.md`
      )
      const markdown_content = await fs.readFile(markdown_file, 'utf8')

      expect(markdown_content).to.include('status: Approved')
      expect(markdown_content).to.include('Approving for testing')
    })

    it('should allow valid status transitions only', async function () {
      // Create a change request
      const cr_id = await change_requests.create_change_request({
        title: 'Status Transition Test',
        description: 'Testing valid status transitions',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch,
        thread_id: test_thread.thread_id,
        user_base_directory: test_thread.user_base_directory
      })

      // Try an invalid transition directly to Merged
      try {
        await change_requests.update_change_request_status({
          change_request_id: cr_id,
          status: 'Merged',
          updater_id: test_user.user_id,
          comment: 'Attempting invalid transition',
          user_base_directory: test_thread.user_base_directory
        })

        // Should not reach here
        expect.fail('Should have thrown an error for invalid transition')
      } catch (error) {
        expect(error.message).to.include('Invalid status transition')
      }

      // Verify proper flow works: PendingReview -> Approved -> Merged
      await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'Approved',
        updater_id: test_user.user_id,
        comment: 'Valid approval',
        user_base_directory: test_thread.user_base_directory
      })

      let cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })
      expect(cr.status).to.equal('Approved')

      // Now merge should work
      await change_requests.merge_change_request({
        change_request_id: cr_id,
        merger_id: test_user.user_id,
        comment: 'Merging approved changes',
        user_base_directory: test_thread.user_base_directory
      })

      cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })
      expect(cr.status).to.equal('Merged')
    })

    it('should handle rejection workflow', async function () {
      // Create a change request
      const cr_id = await change_requests.create_change_request({
        title: 'Rejection Test',
        description: 'Testing rejection workflow',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch,
        thread_id: test_thread.thread_id,
        user_base_directory: test_thread.user_base_directory
      })

      // Reject the change request
      await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'Rejected',
        updater_id: test_user.user_id,
        comment: 'Rejecting these changes',
        user_base_directory: test_thread.user_base_directory
      })

      // Verify rejection
      const cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })
      expect(cr.status).to.equal('Rejected')

      // Rejected change requests cannot be merged
      try {
        await change_requests.merge_change_request({
          change_request_id: cr_id,
          merger_id: test_user.user_id,
          comment: 'Attempting to merge rejected CR',
          user_base_directory: test_thread.user_base_directory
        })

        // Should not reach here
        expect.fail('Should have thrown an error for merging rejected CR')
      } catch (error) {
        expect(error.message).to.include('status')
      }
    })

    it('should allow reopening a rejected change request', async function () {
      // Create a change request
      const cr_id = await change_requests.create_change_request({
        title: 'Reopen Test',
        description: 'Testing reopening workflow',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch,
        thread_id: test_thread.thread_id,
        user_base_directory: test_thread.user_base_directory
      })

      // Reject the change request
      await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'Rejected',
        updater_id: test_user.user_id,
        comment: 'Rejecting temporarily',
        user_base_directory: test_thread.user_base_directory
      })

      // Reopen/reset to PendingReview
      await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'PendingReview',
        updater_id: test_user.user_id,
        comment: 'Reopening for more review',
        user_base_directory: test_thread.user_base_directory
      })

      // Verify reopened
      const cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })
      expect(cr.status).to.equal('PendingReview')

      // Now should be able to approve
      await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'Approved',
        updater_id: test_user.user_id,
        comment: 'Approving reopened CR',
        user_base_directory: test_thread.user_base_directory
      })

      const approved_cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })
      expect(approved_cr.status).to.equal('Approved')
    })

    it('should throw error for non-existent change request', async function () {
      // Try to update a non-existent change request
      const fake_id = uuid()

      try {
        await change_requests.update_change_request_status({
          change_request_id: fake_id,
          status: 'Approved',
          updater_id: test_user.user_id,
          comment: 'This should fail',
          user_base_directory: test_thread.user_base_directory
        })

        // Should not reach here
        expect.fail('Should have thrown an error for non-existent CR')
      } catch (error) {
        expect(error.message).to.include('not found')
      }
    })

    it('should throw error for invalid status value', async function () {
      // Create a change request
      const cr_id = await change_requests.create_change_request({
        title: 'Invalid Status Test',
        description: 'Testing invalid status values',
        user_id: test_user.user_id,
        target_branch: 'main',
        feature_branch,
        thread_id: test_thread.thread_id,
        user_base_directory: test_thread.user_base_directory
      })

      // Try to update with invalid status
      try {
        await change_requests.update_change_request_status({
          change_request_id: cr_id,
          status: 'InvalidStatus',
          updater_id: test_user.user_id,
          comment: 'This should fail',
          user_base_directory: test_thread.user_base_directory
        })

        // Should not reach here
        expect.fail('Should have thrown an error for invalid status')
      } catch (error) {
        expect(error.message).to.include('Invalid status')
      }

      // Verify CR status unchanged
      const cr = await change_requests.get_change_request({
        change_request_id: cr_id,
        user_base_directory: test_thread.user_base_directory
      })
      expect(cr.status).to.equal('PendingReview')
    })
  })

  describe('valid status constants', function () {
    it('should export valid statuses and transitions', function () {
      // Verify exported constants
      expect(VALID_STATUSES).to.be.an('array')
      expect(VALID_STATUSES.length).to.be.at.least(4)

      // Check that statuses match expected values
      expect(VALID_STATUSES).to.include.members([
        'Draft',
        'PendingReview',
        'Approved',
        'NeedsRevision',
        'Rejected',
        'Merged',
        'Closed'
      ])

      expect(VALID_TRANSITIONS).to.be.an('object')
      expect(Object.keys(VALID_TRANSITIONS).length).to.be.at.least(4)

      // Check that transitions are properly defined
      expect(VALID_TRANSITIONS.PendingReview).to.include.members([
        'Approved',
        'Rejected'
      ])
      expect(VALID_TRANSITIONS.Approved).to.include.members([
        'Merged',
        'PendingReview'
      ])
      expect(VALID_TRANSITIONS.Rejected).to.include.members(['PendingReview'])
    })
  })
})
