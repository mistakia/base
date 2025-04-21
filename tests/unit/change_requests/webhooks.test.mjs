/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'

import db from '#db'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread
} from '#tests/utils/index.mjs'
import {
  pr_merged_webhook,
  pr_closed_without_merging_webhook,
  pr_reopened_webhook,
  base_repository,
  base_sender,
  create_pr_merged_webhook
} from '#tests/fixtures/github/webhooks.mjs'

import * as change_requests from '#libs-server/change_requests/index.mjs'

const expect = chai.expect
const execute = promisify(exec)

describe('Change Request Webhooks', function () {
  let test_user
  let orig_cwd
  let test_thread

  // Set longer timeout
  this.timeout(15000)

  beforeEach(async function () {
    // Save original working directory
    orig_cwd = process.cwd()

    // Reset database tables
    await reset_all_tables()

    // Create a test user
    test_user = await create_test_user({
      email: 'webhook-test@example.com',
      username: 'webhook_test_user'
    })

    // Create a test thread with a git repo
    test_thread = await create_test_thread({
      user_id: test_user.user_id
    })

    // Create change_requests directory in the user repo
    await fs.mkdir(
      path.join(test_thread.user_base_directory, 'data/change_requests'),
      {
        recursive: true
      }
    )

    // Change to the test repo directory
    process.chdir(test_thread.user_base_directory)
  })

  afterEach(async function () {
    // Restore original working directory
    process.chdir(orig_cwd)

    // Clean up
    test_thread.cleanup()
  })

  describe('handle_github_webhook', function () {
    it('should update change request status when PR is merged', async function () {
      // Create a feature branch for testing
      const branch_name = `feature/webhook-test-${uuidv4().substring(0, 8)}`
      await fs.writeFile(
        path.join(test_thread.user_base_directory, 'test-file.md'),
        '# Test content for webhook'
      )
      await fs.writeFile(
        path.join(test_thread.user_base_directory, 'README.md'),
        '# Updated README'
      )

      // Commit and push the changes to create the branch
      await execute(`git checkout -b ${branch_name}`, {
        cwd: test_thread.user_base_directory
      })
      await execute('git add .', { cwd: test_thread.user_base_directory })
      await execute('git commit -m "Test changes for webhook test"', {
        cwd: test_thread.user_base_directory
      })
      await execute('git checkout main', {
        cwd: test_thread.user_base_directory
      })

      // Define the PR information consistently
      const pr_number = 12345
      const github_repo = 'test-org/test-repo'

      // Create a change request with GitHub PR info
      const cr_id = await change_requests.create_change_request({
        title: 'Webhook Test PR',
        description: 'Testing GitHub webhook integration',
        creator_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch_name,
        thread_id: test_thread.thread_id,
        github_repo,
        github_pr_number: pr_number,
        github_pr_url: `https://github.com/${github_repo}/pull/${pr_number}`,
        repo_path: test_thread.user_base_directory
      })

      // Update status to Approved (required before merging)
      await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'Approved',
        updater_id: test_user.user_id,
        comment: 'Approving for webhook test',
        repo_path: test_thread.user_base_directory
      })

      // Create a custom webhook payload with the exact same values using the fixture helper
      const merged_webhook = create_pr_merged_webhook({
        pr_number,
        repo: github_repo,
        title: 'Webhook Test PR',
        branch: branch_name
      })

      // Process the webhook
      const result = await change_requests.handle_github_webhook({
        payload: merged_webhook,
        repo_path: test_thread.user_base_directory
      })

      // Verify change request was updated to Merged
      expect(result).to.exist
      expect(result.change_request_id).to.equal(cr_id)
      expect(result.status).to.equal('Merged')
      expect(result.merged_at).to.exist

      // Double-check in database
      const updated_record = await db('change_requests')
        .where({ change_request_id: cr_id })
        .first()

      expect(updated_record.status).to.equal('Merged')
      expect(updated_record.merged_at).to.exist
    })

    it('should handle PR closure without merge', async function () {
      // Create a feature branch for testing
      const branch_name = `feature/webhook-closed-test-${uuidv4().substring(0, 8)}`
      await fs.writeFile(
        path.join(test_thread.user_base_directory, 'closed-test-file.md'),
        '# Test content for closed webhook'
      )

      // Commit and push the changes to create the branch
      await execute(`git checkout -b ${branch_name}`, {
        cwd: test_thread.user_base_directory
      })
      await execute('git add .', { cwd: test_thread.user_base_directory })
      await execute('git commit -m "Test changes for closed webhook test"', {
        cwd: test_thread.user_base_directory
      })
      await execute('git checkout main', {
        cwd: test_thread.user_base_directory
      })

      // Define the PR information consistently
      const pr_number = 45678
      const github_repo = 'test-org/test-repo'

      // Create a change request with GitHub PR info
      const cr_id = await change_requests.create_change_request({
        title: 'Webhook Closed PR Test',
        description: 'Testing GitHub webhook closed PR integration',
        creator_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch_name,
        thread_id: test_thread.thread_id,
        github_repo,
        github_pr_number: pr_number,
        github_pr_url: `https://github.com/${github_repo}/pull/${pr_number}`,
        repo_path: test_thread.user_base_directory
      })

      // Use the closed webhook fixture and customize it for our test
      const closed_webhook = {
        ...pr_closed_without_merging_webhook,
        number: pr_number,
        pull_request: {
          ...pr_closed_without_merging_webhook.pull_request,
          number: pr_number,
          title: 'Webhook Closed PR Test',
          html_url: `https://github.com/${github_repo}/pull/${pr_number}`,
          head: {
            ref: branch_name
          }
        }
      }

      // Process the webhook
      const result = await change_requests.handle_github_webhook({
        payload: closed_webhook,
        repo_path: test_thread.user_base_directory
      })

      // Verify change request was updated to Closed
      expect(result).to.exist
      expect(result.change_request_id).to.equal(cr_id)
      expect(result.status).to.equal('Closed')
      expect(result.closed_at).to.exist

      // Double-check in database
      const db_record = await db('change_requests')
        .where({ change_request_id: cr_id })
        .first()

      expect(db_record.status).to.equal('Closed')
      expect(db_record.closed_at).to.exist
    })

    it('should handle PR comments', async function () {
      // Create a feature branch for testing
      const branch_name = `feature/webhook-comment-test-${uuidv4().substring(0, 8)}`
      await fs.writeFile(
        path.join(test_thread.user_base_directory, 'comment-test-file.md'),
        '# Test content for comment webhook'
      )

      // Commit and push the changes to create the branch
      await execute(`git checkout -b ${branch_name}`, {
        cwd: test_thread.user_base_directory
      })
      await execute('git add .', { cwd: test_thread.user_base_directory })
      await execute('git commit -m "Test changes for comment webhook test"', {
        cwd: test_thread.user_base_directory
      })
      await execute('git checkout main', {
        cwd: test_thread.user_base_directory
      })

      // Define the PR information consistently
      const pr_number = 78901
      const github_repo = 'test-org/test-repo'

      // Create a change request with GitHub PR info
      const cr_id = await change_requests.create_change_request({
        title: 'Webhook Comment PR Test',
        description: 'Testing GitHub webhook comment PR integration',
        creator_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch_name,
        thread_id: test_thread.thread_id,
        github_repo,
        github_pr_number: pr_number,
        github_pr_url: `https://github.com/${github_repo}/pull/${pr_number}`,
        repo_path: test_thread.user_base_directory
      })

      // Create comment webhook based on the base fixtures
      // For PR comments we need to add the issue and comment fields
      const comment_webhook = {
        action: 'created',
        number: pr_number,
        pull_request: {
          ...pr_merged_webhook.pull_request,
          number: pr_number,
          merged: false,
          title: 'Webhook Comment PR Test',
          html_url: `https://github.com/${github_repo}/pull/${pr_number}`,
          head: {
            ref: branch_name
          }
        },
        issue: {
          number: pr_number,
          html_url: `https://github.com/${github_repo}/pull/${pr_number}`,
          pull_request: {
            url: `https://api.github.com/repos/${github_repo}/pulls/${pr_number}`
          }
        },
        comment: {
          body: 'This looks good but needs a few tweaks',
          user: {
            login: 'reviewer',
            id: 67890
          }
        },
        repository: base_repository,
        sender: base_sender
      }

      // Process the webhook
      const result = await change_requests.handle_github_webhook({
        payload: comment_webhook,
        repo_path: test_thread.user_base_directory
      })

      // Comments don't change status, just verify we got the right CR
      expect(result).to.exist
      expect(result.change_request_id).to.equal(cr_id)

      // Status should remain unchanged
      const updated_record = await db('change_requests')
        .where({ change_request_id: cr_id })
        .first()

      expect(updated_record.status).to.equal('PendingReview')
    })

    it('should handle reopened PR', async function () {
      // Create a feature branch for testing
      const branch_name = `feature/webhook-reopen-test-${uuidv4().substring(0, 8)}`
      await fs.writeFile(
        path.join(test_thread.user_base_directory, 'reopen-test-file.md'),
        '# Test content for reopened webhook'
      )

      // Commit and push the changes to create the branch
      await execute(`git checkout -b ${branch_name}`, {
        cwd: test_thread.user_base_directory
      })
      await execute('git add .', { cwd: test_thread.user_base_directory })
      await execute('git commit -m "Test changes for reopened webhook test"', {
        cwd: test_thread.user_base_directory
      })
      await execute('git checkout main', {
        cwd: test_thread.user_base_directory
      })

      // Define the PR information consistently
      const pr_number = 56789
      const github_repo = 'test-org/test-repo'

      // Create a change request with GitHub PR info and closed status
      const cr_id = await change_requests.create_change_request({
        title: 'Webhook Reopened PR Test',
        description: 'Testing GitHub webhook reopened PR integration',
        creator_id: test_user.user_id,
        target_branch: 'main',
        feature_branch: branch_name,
        thread_id: test_thread.thread_id,
        github_repo,
        github_pr_number: pr_number,
        github_pr_url: `https://github.com/${github_repo}/pull/${pr_number}`,
        repo_path: test_thread.user_base_directory
      })

      // First, set the status to Closed
      await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'Closed',
        updater_id: test_user.user_id,
        comment: 'Closing for webhook reopen test',
        repo_path: test_thread.user_base_directory
      })

      // Create a reopened webhook based on the fixture
      const reopened_webhook = {
        ...pr_reopened_webhook,
        number: pr_number,
        pull_request: {
          ...pr_reopened_webhook.pull_request,
          number: pr_number,
          title: 'Webhook Reopened PR Test',
          html_url: `https://github.com/${github_repo}/pull/${pr_number}`,
          head: {
            ref: branch_name
          }
        }
      }

      // Process the webhook
      const result = await change_requests.handle_github_webhook({
        payload: reopened_webhook,
        repo_path: test_thread.user_base_directory
      })

      // Verify change request was updated to PendingReview
      expect(result).to.exist
      expect(result.change_request_id).to.equal(cr_id)
      expect(result.status).to.equal('PendingReview')

      // Double-check in database
      const updated_record = await db('change_requests')
        .where({ change_request_id: cr_id })
        .first()

      expect(updated_record.status).to.equal('PendingReview')
      expect(updated_record.closed_at).to.be.null
    })
  })
})
