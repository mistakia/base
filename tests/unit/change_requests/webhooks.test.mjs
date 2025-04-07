/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'

import {
  handle_pr_merged,
  handle_pr_closed_without_merging,
  handle_pr_reopened
} from '#libs-server/change_requests/webhooks.mjs'
import db from '#db'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'
import {
  pr_merged_webhook,
  pr_closed_without_merging_webhook,
  pr_reopened_webhook,
  base_repository,
  base_sender
} from '#tests/fixtures/github/webhooks.mjs'

const expect = chai.expect
const execute = promisify(exec)

describe('Change Requests Webhook Handlers', function () {
  let test_repo_path
  let test_user
  let orig_cwd

  // Set longer timeout
  this.timeout(10000)

  beforeEach(async function () {
    // Save original working directory
    orig_cwd = process.cwd()

    // Reset database tables
    await reset_all_tables()

    // Create a test user
    test_user = await create_test_user({
      email: 'test-webhook@example.com',
      username: 'test_webhook_user'
    })

    // Create temporary directory for test repo
    const temp_dir = os.tmpdir()
    test_repo_path = path.join(
      temp_dir,
      `webhook-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
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

    // Create the change_requests directory
    await fs.mkdir(path.join(test_repo_path, 'data/change_requests'), {
      recursive: true
    })

    // Change to the test repo directory so git operations use this path
    process.chdir(test_repo_path)
  })

  afterEach(async function () {
    // Restore original working directory
    process.chdir(orig_cwd)

    // Clean up the test repo
    try {
      await fs.rm(test_repo_path, { recursive: true, force: true })
    } catch (error) {
      console.error('Error cleaning up test repo:', error)
    }
  })

  describe('handle_pr_merged', function () {
    it('should update change request status to Merged', async function () {
      // Create a test change request linked to a GitHub PR
      const change_request_id = uuidv4()
      const pr_number = 123
      const github_repo = 'test-org/test-repo'

      // Insert a change request directly into the database
      await db('change_requests').insert({
        change_request_id,
        status: 'Approved',
        title: 'Test GitHub PR Merged',
        creator_id: test_user.user_id,
        created_at: new Date(),
        updated_at: new Date(),
        target_branch: 'main',
        feature_branch: `cr/${change_request_id}`,
        github_pr_number: pr_number,
        github_repo
      })

      // Call the webhook handler with the fixture
      await handle_pr_merged(pr_merged_webhook)

      // Verify the database was updated
      const db_record = await db('change_requests')
        .where({ change_request_id })
        .first()

      expect(db_record.status).to.equal('Merged')
    })

    it('should handle missing required fields gracefully', async function () {
      // Create webhook payload with missing required fields
      const invalid_webhook = {
        action: 'closed',
        pull_request: {
          merged: true
        }
        // Missing number, repository, and sender
      }

      // This should not throw an error
      const result = await handle_pr_merged(invalid_webhook)
      expect(result).to.be.null
    })
  })

  describe('handle_pr_closed_without_merging', function () {
    it('should update change request status to Closed', async function () {
      // Create a test change request linked to a GitHub PR
      const change_request_id = uuidv4()
      const pr_number = 123
      const github_repo = 'test-org/test-repo'

      // Insert a change request directly into the database
      await db('change_requests').insert({
        change_request_id,
        status: 'PendingReview',
        title: 'Test GitHub PR Closed',
        creator_id: test_user.user_id,
        created_at: new Date(),
        updated_at: new Date(),
        target_branch: 'main',
        feature_branch: `cr/${change_request_id}`,
        github_pr_number: pr_number,
        github_repo
      })

      // Call the webhook handler with the fixture
      await handle_pr_closed_without_merging(pr_closed_without_merging_webhook)

      // Verify the database was updated
      const db_record = await db('change_requests')
        .where({ change_request_id })
        .first()

      expect(db_record.status).to.equal('Closed')
    })

    it('should handle malformed payload gracefully', async function () {
      // Create an invalid webhook payload missing required fields
      const invalid_webhook = {
        action: 'closed',
        repository: base_repository
        // Missing number, pull_request, and sender
      }

      // This should not throw an error and return null
      const result = await handle_pr_closed_without_merging(invalid_webhook)
      expect(result).to.be.null
    })
  })

  describe('handle_pr_reopened', function () {
    it('should update change request status to PendingReview', async function () {
      // Create a test change request linked to a GitHub PR
      const change_request_id = uuidv4()
      const pr_number = 123
      const github_repo = 'test-org/test-repo'

      // Insert a change request directly into the database with Closed status
      await db('change_requests').insert({
        change_request_id,
        status: 'Closed',
        title: 'Test GitHub PR Reopened',
        creator_id: test_user.user_id,
        created_at: new Date(),
        updated_at: new Date(),
        closed_at: new Date(),
        target_branch: 'main',
        feature_branch: `cr/${change_request_id}`,
        github_pr_number: pr_number,
        github_repo
      })

      // Call the webhook handler with the fixture
      await handle_pr_reopened(pr_reopened_webhook)

      // Verify the database was updated
      const db_record = await db('change_requests')
        .where({ change_request_id })
        .first()

      expect(db_record.status).to.equal('PendingReview')
    })

    it('should handle missing required fields gracefully', async function () {
      // Create webhook payload with missing required fields
      const invalid_webhook = {
        action: 'reopened',
        sender: base_sender
        // Missing number, pull_request, and repository
      }

      // This should not throw an error and return null
      const result = await handle_pr_reopened(invalid_webhook)
      expect(result).to.be.null
    })
  })
})
