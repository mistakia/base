/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuid } from 'uuid'

import { update_change_request_status } from '#libs-server/change_requests/index.mjs'
import db from '#db'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

const expect = chai.expect
const execute = promisify(exec)

describe('Change Request Status Update', function () {
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
      email: 'test-status@example.com',
      username: 'test_status_user'
    })

    // Create temporary directory for test repo
    const temp_dir = os.tmpdir()
    test_repo_path = path.join(
      temp_dir,
      `status-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
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

  describe('update_change_request_status', function () {
    it('should update status when transition is valid', async function () {
      // Create a test change request in the database
      const change_request_id = uuid()
      const current_status = 'PendingReview'

      // Insert a change request directly into the database
      await db('change_requests').insert({
        change_request_id,
        status: current_status,
        title: 'Test Status Update',
        creator_id: test_user.user_id,
        created_at: new Date(),
        updated_at: new Date(),
        target_branch: 'main',
        feature_branch: `cr/${change_request_id}`
      })

      // Create a markdown file for the change request
      const markdown_dir = path.join(test_repo_path, 'data/change_requests')
      await fs.mkdir(markdown_dir, { recursive: true })

      const markdown_file_path = path.join(
        markdown_dir,
        `${change_request_id}.md`
      )
      const markdown_content = `---
change_request_id: ${change_request_id}
title: Test Status Update
status: ${current_status}
creator_id: ${test_user.user_id}
created_at: ${new Date().toISOString()}
target_branch: main
feature_branch: cr/${change_request_id}
type: change_request
---

# Test Status Update

Initial content`

      await fs.writeFile(markdown_file_path, markdown_content)

      // Update the status
      const result = await update_change_request_status({
        change_request_id,
        status: 'Approved',
        comment: 'Looks good!',
        updater_id: test_user.user_id
      })

      // Verify the result
      expect(result).to.have.property('status', 'Approved')

      // Verify the database was updated
      const db_record = await db('change_requests')
        .where({ change_request_id })
        .first()

      expect(db_record.status).to.equal('Approved')

      // Verify the markdown file was updated - read directly from the file path
      const updated_content = await fs.readFile(markdown_file_path, 'utf8')
      expect(updated_content).to.include('status: Approved')
      expect(updated_content).to.include('Looks good!')
    })

    it('should reject invalid status values', async function () {
      // Create a test change request
      const change_request_id = uuid()

      // Insert a change request directly into the database
      await db('change_requests').insert({
        change_request_id,
        status: 'PendingReview',
        title: 'Test Invalid Status',
        creator_id: test_user.user_id,
        created_at: new Date(),
        updated_at: new Date(),
        target_branch: 'main',
        feature_branch: `cr/${change_request_id}`
      })

      try {
        await update_change_request_status({
          change_request_id,
          status: 'InvalidStatus',
          user: {
            username: test_user.username,
            user_id: test_user.user_id
          }
        })
        // Should not reach here
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Invalid status')

        // Verify the database was not updated
        const db_record = await db('change_requests')
          .where({ change_request_id })
          .first()

        expect(db_record.status).to.equal('PendingReview')
      }
    })

    it('should reject invalid status transitions', async function () {
      // Create a test change request with status already Merged
      const change_request_id = uuid()

      // Insert a change request directly into the database
      await db('change_requests').insert({
        change_request_id,
        status: 'Merged',
        title: 'Test Invalid Transition',
        creator_id: test_user.user_id,
        created_at: new Date(),
        updated_at: new Date(),
        merged_at: new Date(),
        target_branch: 'main',
        feature_branch: `cr/${change_request_id}`
      })

      // Create a markdown file for the change request
      const markdown_dir = path.join(test_repo_path, 'data/change_requests')
      const markdown_content = `---
change_request_id: ${change_request_id}
title: Test Invalid Transition
status: Merged
creator_id: ${test_user.user_id}
created_at: ${new Date().toISOString()}
merged_at: ${new Date().toISOString()}
target_branch: main
feature_branch: cr/${change_request_id}
type: change_request
---

# Test Invalid Transition

Already merged content`

      await fs.writeFile(
        path.join(markdown_dir, `${change_request_id}.md`),
        markdown_content
      )

      try {
        await update_change_request_status({
          change_request_id,
          status: 'Approved', // Cannot approve something already merged
          updater_id: test_user.user_id
        })
        // Should not reach here
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Cannot transition')

        // Verify the database was not updated
        const db_record = await db('change_requests')
          .where({ change_request_id })
          .first()

        expect(db_record.status).to.equal('Merged')
      }
    })

    it('should include comment when provided', async function () {
      // Create a test change request
      const change_request_id = uuid()

      // Insert a change request directly into the database
      await db('change_requests').insert({
        change_request_id,
        status: 'PendingReview',
        title: 'Test Comment',
        creator_id: test_user.user_id,
        created_at: new Date(),
        updated_at: new Date(),
        target_branch: 'main',
        feature_branch: `cr/${change_request_id}`
      })

      // Create a markdown file for the change request
      const markdown_dir = path.join(test_repo_path, 'data/change_requests')
      const markdown_file_path = path.join(
        markdown_dir,
        `${change_request_id}.md`
      )
      const markdown_content = `---
change_request_id: ${change_request_id}
title: Test Comment
status: PendingReview
creator_id: ${test_user.user_id}
created_at: ${new Date().toISOString()}
target_branch: main
feature_branch: cr/${change_request_id}
type: change_request
---

# Test Comment

Initial content`

      await fs.writeFile(markdown_file_path, markdown_content)

      // Update with a detailed comment
      const comment = 'This is a detailed review comment with specific feedback'
      await update_change_request_status({
        change_request_id,
        status: 'NeedsRevision',
        comment,
        updater_id: test_user.user_id
      })

      // Verify the markdown file contains the comment - read directly from the file path
      const updated_content = await fs.readFile(markdown_file_path, 'utf8')
      expect(updated_content).to.include(comment)
      expect(updated_content).to.include('Status Update: NeedsRevision')
    })

    it('should handle missing change request gracefully', async function () {
      try {
        await update_change_request_status({
          change_request_id: uuid(), // Use a non-existent UUID
          status: 'Approved',
          updater_id: test_user.user_id
        })
        // Should not reach here
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('not found')
      }
    })
  })
})
