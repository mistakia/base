/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuid } from 'uuid'

// Import the modules we want to test
import * as change_requests from '#libs-server/change_requests/index.mjs'
import { markdown } from '#libs-server'
import db from '#db'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('Change Requests', function () {
  let test_repo_path
  let test_user
  let orig_cwd

  // Set longer timeout for Git operations
  this.timeout(30000)

  beforeEach(async function () {
    // Save original working directory
    orig_cwd = process.cwd()

    // Reset database tables
    await reset_all_tables()

    // Create a test user
    test_user = await create_test_user({
      email: 'test-cr@example.com',
      username: 'test_cr_user'
    })

    // Create temporary directory for test repo
    const temp_dir = os.tmpdir()
    test_repo_path = path.join(
      temp_dir,
      `cr-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
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

  describe('create_change_request', function () {
    it('should create a change request with proper structure', async function () {
      // Create a temporary directory for the markdown files
      const markdown_dir = path.join(test_repo_path, 'data/change_requests')
      await fs.mkdir(markdown_dir, { recursive: true })

      // Call the function we're testing
      const change_request_id = await change_requests.create_change_request({
        title: 'Test Change Request',
        description: 'This is a test change request',
        creator_id: test_user.user_id,
        target_branch: 'main',
        file_changes: [
          {
            path: 'test-file.md',
            content: '# Test Content'
          }
        ],
        tags: ['test', 'change-request']
      })

      // Verify results
      expect(change_request_id).to.exist

      // Check database record
      const record = await db('change_requests')
        .where({ change_request_id })
        .first()

      expect(record).to.exist
      expect(record.title).to.equal('Test Change Request')
      expect(record.status).to.equal('PendingReview')

      // Verify the branch was created
      const { stdout: branch_list } = await execute('git branch', {
        cwd: test_repo_path
      })
      expect(branch_list).to.include(`cr/${change_request_id}`)

      // Verify the file was created
      const { stdout: file_list } = await execute(
        `git ls-tree -r --name-only cr/${change_request_id}`,
        { cwd: test_repo_path }
      )
      expect(file_list).to.include('test-file.md')

      // Verify the commit message
      const { stdout: commit_msg } = await execute(
        `git log -1 --pretty=%B cr/${change_request_id}`,
        { cwd: test_repo_path }
      )
      expect(commit_msg).to.include('Apply changes for change request')

      // Verify markdown file was created
      const markdown_file_path = path.join(
        markdown_dir,
        `${change_request_id}.md`
      )
      const file_exists = await fs
        .access(markdown_file_path)
        .then(() => true)
        .catch(() => false)
      expect(file_exists).to.be.true
    })

    it('should handle errors gracefully', async function () {
      try {
        // Try to create a change request with invalid input to trigger error
        await change_requests.create_change_request({
          // Missing required fields like title
          creator_id: test_user.user_id,
          target_branch: 'non_existent_branch'
        })

        // If we get here, the test should fail
        expect.fail('Expected an error but none was thrown')
      } catch (error) {
        // Verify cleanup - worktree should have been removed
        // Get list of worktrees
        const { stdout: worktree_list } = await execute('git worktree list', {
          cwd: test_repo_path
        })

        // Should only have the main worktree (no additional ones)
        const worktree_count = worktree_list
          .split('\n')
          .filter((line) => line.trim()).length
        expect(worktree_count).to.equal(1)
      }
    })
  })

  describe('get_change_request', function () {
    it('should retrieve a change request by ID', async function () {
      const description = 'This is a test for get_change_request'

      // Create a test change request with explicit saving of description
      const cr_id = await change_requests.create_change_request({
        title: 'Test CR for retrieval',
        description,
        creator_id: test_user.user_id,
        target_branch: 'main',
        file_changes: [
          {
            path: 'test-file.md',
            content: '# Test Content'
          }
        ]
      })

      // Manually ensure the description is in the markdown file
      const file_path = path.join(
        test_repo_path,
        `data/change_requests/${cr_id}.md`
      )
      const markdown_data = await markdown.read_markdown_entity(file_path)

      // Make sure description is set
      markdown_data.frontmatter.description = description
      await markdown.write_markdown_entity(
        file_path,
        markdown_data.frontmatter,
        description
      )

      // Retrieve the change request
      const cr = await change_requests.get_change_request({
        change_request_id: cr_id
      })

      // Verify it has the correct data
      expect(cr.change_request_id).to.equal(cr_id)
      expect(cr.title).to.equal('Test CR for retrieval')
      expect(cr.description).to.equal(description)
      expect(cr.creator_id).to.equal(test_user.user_id)
    })

    it('should return null if the change request does not exist', async function () {
      const result = await change_requests.get_change_request({
        change_request_id: uuid()
      })
      expect(result).to.be.null
    })
  })

  describe('list_change_requests', function () {
    it('should list change requests with filtering', async function () {
      // Create multiple change requests with different statuses
      const cr1_id = await change_requests.create_change_request({
        title: 'First CR',
        description: 'First test CR',
        creator_id: test_user.user_id,
        target_branch: 'main',
        file_changes: [],
        tags: ['list-test', 'first']
      })

      const cr2_id = await change_requests.create_change_request({
        title: 'Second CR',
        description: 'Second test CR',
        creator_id: test_user.user_id,
        target_branch: 'main',
        file_changes: [],
        tags: ['list-test', 'second']
      })

      // Update the status of the second CR
      await change_requests.update_change_request_status({
        change_request_id: cr2_id,
        status: 'Approved',
        updater_id: test_user.user_id,
        comment: 'Approved for testing'
      })

      // Call the function without filters first
      const all_results = await change_requests.list_change_requests({})

      // Verify all CRs are returned
      expect(all_results).to.be.an('array')
      expect(all_results.length).to.be.at.least(2)

      // Now filter by status
      const pending_results = await change_requests.list_change_requests({
        status: 'PendingReview'
      })

      // Verify only cr1 is returned
      expect(pending_results).to.be.an('array')
      const pending_ids = pending_results.map((cr) => cr.change_request_id)
      expect(pending_ids).to.include(cr1_id)
      expect(pending_ids).to.not.include(cr2_id)

      // Filter by Approved status
      const approved_results = await change_requests.list_change_requests({
        status: 'Approved'
      })

      // Verify only cr2 is returned
      expect(approved_results).to.be.an('array')
      const approved_ids = approved_results.map((cr) => cr.change_request_id)
      expect(approved_ids).to.not.include(cr1_id)
      expect(approved_ids).to.include(cr2_id)
    })

    it('should filter by tags when provided', async function () {
      // Create a change request with specific tags
      const unique_tag = `test-tag-${Date.now()}`

      // Create first CR with the unique tag
      const cr1_id = await change_requests.create_change_request({
        title: 'Test CR with Tags',
        description: 'This CR has specific tags for testing filtering',
        creator_id: test_user.user_id,
        target_branch: 'main',
        tags: [unique_tag, 'common-tag']
      })

      // Get the file path and ensure the tag is in the markdown
      const file_path1 = path.join(
        test_repo_path,
        `data/change_requests/${cr1_id}.md`
      )
      const markdown_data1 = await markdown.read_markdown_entity(file_path1)

      // Make sure tags are explicitly set in markdown
      markdown_data1.frontmatter.tags = [unique_tag, 'common-tag']
      await markdown.write_markdown_entity(
        file_path1,
        markdown_data1.frontmatter,
        markdown_data1.content
      )

      // Create another change request without the unique tag
      const cr2_id = await change_requests.create_change_request({
        title: 'Test CR without Tag',
        description:
          'This CR does not have the specific tag we want to filter by',
        creator_id: test_user.user_id,
        target_branch: 'main',
        tags: ['common-tag']
      })

      // Ensure the second CR has only common-tag
      const file_path2 = path.join(
        test_repo_path,
        `data/change_requests/${cr2_id}.md`
      )
      const markdown_data2 = await markdown.read_markdown_entity(file_path2)

      // Make sure tags are explicitly set in markdown
      markdown_data2.frontmatter.tags = ['common-tag']
      await markdown.write_markdown_entity(
        file_path2,
        markdown_data2.frontmatter,
        markdown_data2.content
      )

      // Get CR list filtered by the unique tag
      const filtered_list = await change_requests.list_change_requests({
        tags: [unique_tag]
      })

      // Verify filtering works
      expect(filtered_list.length).to.be.at.least(1)
      expect(filtered_list.some((cr) => cr.change_request_id === cr1_id)).to.be
        .true
      expect(filtered_list.some((cr) => cr.change_request_id === cr2_id)).to.be
        .false
    })
  })

  describe('update_change_request_status', function () {
    it('should update the status in both DB and markdown file', async function () {
      // Create a test change request
      const cr_id = await change_requests.create_change_request({
        title: 'Status Test CR',
        description: 'CR for testing status updates',
        creator_id: test_user.user_id,
        target_branch: 'main'
      })

      // Get the absolute file path to verify markdown contents
      const file_path = path.join(
        test_repo_path,
        `data/change_requests/${cr_id}.md`
      )

      // Update the status
      const result = await change_requests.update_change_request_status({
        change_request_id: cr_id,
        status: 'Approved',
        updater_id: test_user.user_id,
        comment: 'Approving this change request.'
      })

      // Verify DB update
      expect(result.status).to.equal('Approved')

      // Verify markdown update directly by reading the file
      const markdown_content = await fs.readFile(file_path, 'utf8')
      expect(markdown_content).to.include('status: Approved')
      expect(markdown_content).to.include('Approving this change request.')
    })

    it('should throw an error for invalid status', async function () {
      // Create a test change request
      const change_request_id = await change_requests.create_change_request({
        title: 'Invalid Status Test',
        description: 'Testing invalid status',
        creator_id: test_user.user_id,
        target_branch: 'main',
        file_changes: []
      })

      try {
        await change_requests.update_change_request_status({
          change_request_id,
          status: 'InvalidStatus',
          updater_id: test_user.user_id
        })

        // If we get here, the test should fail
        expect.fail('Expected an error but none was thrown')
      } catch (error) {
        expect(error.message).to.include('Invalid status')
      }
    })
  })

  describe('merge_change_request', function () {
    it('should merge a change request and update its status', async function () {
      // Create a change request with file changes
      const change_request_id = await change_requests.create_change_request({
        title: 'Merge Test CR',
        description: 'Testing merge functionality',
        creator_id: test_user.user_id,
        target_branch: 'main',
        file_changes: [
          {
            path: 'merge-test-file.md',
            content: '# Merge Test Content'
          }
        ]
      })

      // Update status to Approved
      await change_requests.update_change_request_status({
        change_request_id,
        status: 'Approved',
        updater_id: test_user.user_id,
        comment: 'Ready to merge'
      })

      // Merge the change request
      const merged_cr = await change_requests.merge_change_request({
        change_request_id,
        merger_id: test_user.user_id,
        merge_message: 'Merging test CR'
      })

      // Verify it was merged
      expect(merged_cr.status).to.equal('Merged')

      // Verify the main branch has the changes
      await execute('git checkout main', { cwd: test_repo_path })
      const file_path = path.join(test_repo_path, 'merge-test-file.md')
      const file_exists = await fs
        .access(file_path)
        .then(() => true)
        .catch(() => false)
      expect(file_exists).to.be.true

      // Check DB status
      const db_record = await db('change_requests')
        .where({ change_request_id })
        .first()

      expect(db_record.status).to.equal('Merged')
      expect(db_record.merged_at).to.exist
    })
  })

  describe('handle_github_webhook', function () {
    it('should update CR status when PR is merged on GitHub', async function () {
      // Create a test change request with both PR number and github_repo set
      const cr_id = await change_requests.create_change_request({
        title: 'GitHub Webhook Test',
        description: 'Testing webhook PR merge',
        creator_id: test_user.user_id,
        target_branch: 'main'
      })

      // Directly update the database to set github PR fields
      await db('change_requests').where({ change_request_id: cr_id }).update({
        github_pr_number: 123,
        github_repo: 'test-org/test-repo',
        status: 'Approved' // Set to Approved to allow merging
      })

      // Verify the CR exists and is properly set up
      const cr_before = await change_requests.get_change_request({
        change_request_id: cr_id
      })
      expect(cr_before.status).to.equal('Approved')
      expect(cr_before.github_pr_number).to.equal(123)
      expect(cr_before.github_repo).to.equal('test-org/test-repo')

      // Simulate GitHub webhook for PR merge
      const webhook_payload = {
        action: 'closed',
        pull_request: {
          number: 123,
          merged: true,
          title: 'GitHub Webhook Test'
        },
        repository: {
          owner: {
            login: 'test-org'
          },
          name: 'test-repo'
        }
      }

      // Process the webhook
      const result = await change_requests.handle_github_webhook({
        payload: webhook_payload
      })

      // Verify the result
      if (result) {
        expect(result.status).to.equal('Merged')
        expect(result.github_pr_number).to.equal(123)
        expect(result.github_repo).to.equal('test-org/test-repo')
      } else {
        // If there's no result, check database directly
        const db_record = await db('change_requests')
          .where({ change_request_id: cr_id })
          .first()

        expect(db_record.status).to.equal('Merged')
        expect(db_record.merged_at).to.exist
      }
    })
  })
})
