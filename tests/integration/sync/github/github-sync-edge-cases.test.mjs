import { expect } from 'chai'
import fs from 'fs/promises'

import { sync, github } from '#libs-server'
import {
  create_test_user,
  create_temp_test_directory,
  reset_all_tables
} from '#tests/utils/index.mjs'
import db from '#db'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'
import { get_fixture_path } from '#tests/utils/fixture-paths.mjs'

const temp_dir = create_temp_test_directory('github-sync-edge-cases-test-')

describe('GitHub Sync Edge Cases and Error Handling', () => {
  let test_user
  let test_issue_data
  let test_github_repository_owner
  let test_github_repository_name
  let test_entity_id

  // Set up test environment
  before(async () => {
    await reset_all_tables()

    // Create test user
    test_user = await create_test_user()

    // Set up test repository info
    test_github_repository_owner = 'test-owner'
    test_github_repository_name = 'test-repo'

    // Read test fixture data
    const fixture_path = get_fixture_path('github/github-issue.json')
    const fixture_data = await fs.readFile(fixture_path, 'utf8')
    test_issue_data = JSON.parse(fixture_data)
  })

  // Clean up after tests
  after(async () => {
    // Clean up all test data related to our test user
    await db('entities').where({ user_id: test_user.user_id }).delete()

    // Clean up temporary directory
    if (temp_dir) {
      temp_dir.cleanup()
    }
  })

  describe('process_single_github_issue with invalid inputs', () => {
    it('should throw error when repo_owner is missing', async () => {
      try {
        await github.process_single_github_issue({
          issue: test_issue_data,
          github_repository_name: test_github_repository_name,
          user_id: test_user.user_id,
          import_history_base_directory: temp_dir.path
        })
        expect.fail('Expected error was not thrown')
      } catch (error) {
        expect(error.message).to.include('Missing repository owner')
      }
    })

    it('should throw error when repo_name is missing', async () => {
      try {
        await github.process_single_github_issue({
          issue: test_issue_data,
          github_repository_owner: test_github_repository_owner,
          user_id: test_user.user_id,
          import_history_base_directory: temp_dir.path
        })
        expect.fail('Expected error was not thrown')
      } catch (error) {
        expect(error.message).to.include('Missing repository name')
      }
    })

    it('should handle malformed GitHub issue gracefully', async () => {
      const malformed_issue = {
        // Missing required fields like number, title, etc.
        id: 12345,
        state: 'open',
        created_at: '2023-01-01T12:00:00Z',
        updated_at: '2023-01-02T14:30:00Z'
      }

      try {
        await github.process_single_github_issue({
          issue: malformed_issue,
          github_repository_owner: test_github_repository_owner,
          github_repository_name: test_github_repository_name,
          user_id: test_user.user_id,
          import_history_base_directory: temp_dir.path
        })
        expect.fail('Expected error was not thrown')
      } catch (error) {
        // We should get an error about the issue data
        expect(error.message).to.not.be.empty
      }
    })
  })

  describe('process_github_issues with error conditions', () => {
    it('should handle errors for individual issues without failing the whole batch', async () => {
      // Create test issues with one malformed issue
      const test_issues = [
        // Valid issue
        {
          id: 1001,
          number: 101,
          title: 'Valid Issue 1',
          body: 'This is a valid issue',
          state: 'open',
          html_url: 'https://github.com/test-owner/test-repo/issues/101',
          created_at: '2023-01-01T12:00:00Z',
          updated_at: '2023-01-02T14:30:00Z',
          labels: []
        },
        // Malformed issue (missing required fields)
        {
          id: 1002
          // Missing number, title, etc.
        },
        // Valid issue
        {
          id: 1003,
          number: 103,
          title: 'Valid Issue 2',
          body: 'This is another valid issue',
          state: 'closed',
          html_url: 'https://github.com/test-owner/test-repo/issues/103',
          created_at: '2023-01-03T12:00:00Z',
          updated_at: '2023-01-04T14:30:00Z',
          closed_at: '2023-01-04T14:30:00Z',
          labels: []
        }
      ]

      // Process the batch
      const results = await github.process_github_issues({
        issues: test_issues,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name,
        user_id: test_user.user_id,
        import_history_base_directory: temp_dir.path
      })

      // Check that we processed the valid issues and recorded the error
      expect(results).to.have.property('created', 2)
      expect(results).to.have.property('errors', 1)
      expect(results).to.have.property('processed_issues').with.lengthOf(3)

      // Check error details
      const error_issue = results.processed_issues.find(
        (i) => i.action === 'error'
      )
      expect(error_issue).to.exist
      expect(error_issue).to.have.property('error').that.is.not.empty
    })

    it('should handle pull requests by skipping them', async () => {
      // Create test issues with one pull request
      const test_issues = [
        // Regular issue
        {
          id: 2001,
          number: 201,
          title: 'Regular Issue',
          body: 'This is a regular issue',
          state: 'open',
          html_url: 'https://github.com/test-owner/test-repo/issues/201',
          created_at: '2023-02-01T12:00:00Z',
          updated_at: '2023-02-02T14:30:00Z',
          labels: []
        },
        // Pull Request (has pull_request property)
        {
          id: 2002,
          number: 202,
          title: 'Test Pull Request',
          body: 'This is a pull request',
          state: 'open',
          html_url: 'https://github.com/test-owner/test-repo/pull/202',
          created_at: '2023-02-03T12:00:00Z',
          updated_at: '2023-02-04T14:30:00Z',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/202'
          },
          labels: []
        }
      ]

      // Process the batch
      const results = await github.process_github_issues({
        issues: test_issues,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name,
        user_id: test_user.user_id,
        import_history_base_directory: temp_dir.path
      })

      // Check that we processed the regular issue and skipped the PR
      expect(results).to.have.property('created', 1)
      expect(results).to.have.property('skipped', 1)
      expect(results).to.have.property('processed_issues').with.lengthOf(2)

      // Check skipped PR details
      const skipped_issue = results.processed_issues.find(
        (i) => i.action === 'skipped'
      )
      expect(skipped_issue).to.exist
      expect(skipped_issue).to.have.property('issue_number', 202)
      expect(skipped_issue).to.have.property('reason', 'pull_request')
    })
  })

  describe('update_existing_task_from_github_issue edge cases', () => {
    beforeEach(async () => {
      // Create a test entity for each test
      const [entity] = await db('entities')
        .insert({
          title: 'Test Entity for Edge Cases',
          type: 'task',
          description: 'Test description',
          user_id: test_user.user_id,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*')

      test_entity_id = entity.entity_id

      // Create task
      await db('tasks').insert({
        entity_id: test_entity_id,
        status: TASK_STATUS.NO_STATUS,
        priority: TASK_PRIORITY.NONE
      })

      // Add required metadata
      await db('entity_metadata').insert([
        {
          entity_id: test_entity_id,
          key: 'external_id',
          value: `github:${test_github_repository_owner}/${test_github_repository_name}:${test_issue_data.number}`
        },
        {
          entity_id: test_entity_id,
          key: 'github_issue_number',
          value: String(test_issue_data.number)
        },
        {
          entity_id: test_entity_id,
          key: 'github_repo',
          value: `${test_github_repository_owner}/${test_github_repository_name}`
        }
      ])

      // Create sync record
      await sync.get_or_create_sync_record({
        entity_id: test_entity_id,
        external_system: 'github',
        external_id: `${test_github_repository_owner}/${test_github_repository_name}:${test_issue_data.number}`
      })
    })

    afterEach(async () => {
      // Clean up test entity after each test
      if (test_entity_id) {
        await db('entities').where({ entity_id: test_entity_id }).delete()
        test_entity_id = null
      }
    })

    it('should handle non-existent entity gracefully', async () => {
      try {
        await github.update_existing_task_from_github_issue({
          entity_id: '00000000-0000-4000-a000-000000000000',
          issue: test_issue_data,
          normalized_issue: github.normalize_github_issue({
            issue: test_issue_data,
            github_repository_owner: test_github_repository_owner,
            github_repository_name: test_github_repository_name
          }),
          github_repository_owner: test_github_repository_owner,
          github_repository_name: test_github_repository_name,
          import_cid: 'test-cid',
          import_history_base_directory: temp_dir.path
        })
        expect.fail('Expected error was not thrown')
      } catch (error) {
        expect(error.message).to.include('not found')
      }
    })

    it('should skip update when no changes are detected', async () => {
      // First create an import history to compare against
      const normalized_issue = github.normalize_github_issue({
        issue: test_issue_data,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name
      })

      await sync.save_import_data({
        external_system: 'github',
        entity_id: test_entity_id,
        raw_data: test_issue_data,
        processed_data: normalized_issue,
        import_history_base_directory: temp_dir.path
      })

      // Now try to update with the same data
      const result = await github.update_existing_task_from_github_issue({
        entity_id: test_entity_id,
        issue: test_issue_data,
        normalized_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name,
        import_cid: 'test-cid',
        import_history_base_directory: temp_dir.path
      })

      // Should be skipped since no changes were detected
      expect(result).to.have.property('action', 'skipped')
      expect(result).to.have.property('conflicts_found', false)
    })
  })
})
