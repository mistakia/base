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

// Set up temp directory for imports
const temp_dir = create_temp_test_directory('github-sync-test-')

describe('GitHub Sync Integration Tests', () => {
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

    // Create a test entity using the create_new_task_from_github_issue function
    const normalized_issue = github.normalize_github_issue({
      issue: test_issue_data,
      github_repository_owner: test_github_repository_owner,
      github_repository_name: test_github_repository_name
    })

    const external_id = `${test_github_repository_owner}/${test_github_repository_name}:${test_issue_data.number}`
    const import_cid = await sync.create_content_identifier(normalized_issue)

    const result = await github.create_new_task_from_github_issue({
      issue: test_issue_data,
      normalized_issue,
      github_repository_owner: test_github_repository_owner,
      github_repository_name: test_github_repository_name,
      user_id: test_user.user_id,
      external_id,
      import_cid,
      import_history_base_directory: temp_dir.path
    })

    test_entity_id = result.entity_id
  })

  // Clean up after tests
  after(async () => {
    if (test_entity_id) {
      // Clean up entity and related data
      await db('entities').where({ entity_id: test_entity_id }).delete()
    }

    // Clean up all test data related to our test user
    await db('entities').where({ user_id: test_user.user_id }).delete()

    // Clean up temporary directory
    if (temp_dir) {
      temp_dir.cleanup()
    }
  })

  describe('process_single_github_issue', () => {
    it('should create a new task from a GitHub issue', async () => {
      const issue = {
        id: 12345,
        number: 456, // Different issue number to avoid conflicts with test entity
        title: 'Test Issue',
        body: 'Test Description',
        state: 'open',
        html_url: 'https://github.com/test-owner/test-repo/issues/456',
        created_at: '2023-01-01T12:00:00Z',
        updated_at: '2023-01-02T14:30:00Z',
        labels: []
      }

      const result = await github.process_single_github_issue({
        issue,
        github_repository_owner: 'test-owner',
        github_repository_name: 'test-repo',
        import_history_base_directory: temp_dir.path,
        user_id: test_user.user_id,
        github_token: 'test-token'
      })

      expect(result).to.be.an('object')
      expect(result).to.have.property('entity_id')
      expect(result).to.have.property('action', 'created')
      expect(result).to.have.property('conflicts_found', false)

      // Verify entity exists
      const entity = await db('entities')
        .where({ entity_id: result.entity_id })
        .first()

      expect(entity).to.be.an('object')
      expect(entity).to.have.property('title', 'Test Issue')
      expect(entity).to.have.property('description', 'Test Description')
      expect(entity).to.have.property('user_id', test_user.user_id)

      // Verify task exists
      const task = await db('tasks')
        .where({ entity_id: result.entity_id })
        .first()

      expect(task).to.be.an('object')
      expect(task).to.have.property('status')
      expect(task).to.have.property('priority')

      // Clean up
      await db('entities').where({ entity_id: result.entity_id }).delete()
    })

    it('should update an existing task when the GitHub issue changes', async () => {
      // Verify the entity and task exist before proceeding
      const existing_entity = await db('entities')
        .where({ entity_id: test_entity_id })
        .first()
      expect(existing_entity).to.not.be.null

      const existing_task = await db('tasks')
        .where({ entity_id: test_entity_id })
        .first()
      expect(existing_task).to.not.be.null

      // Create an updated version of the test issue
      const updated_issue = {
        ...test_issue_data,
        title: 'Updated Test GitHub Issue',
        body: 'This is an updated test GitHub issue.\n\nWith new content.',
        updated_at: '2023-01-04T09:15:00Z',
        labels: [
          { id: 'label1', name: 'bug', color: 'ff0000' },
          { id: 'label2', name: 'priority:critical', color: 'ff00ff' }
        ]
      }

      // Process the updated issue
      const result = await github.process_single_github_issue({
        issue: updated_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name,
        user_id: test_user.user_id,
        import_history_base_directory: temp_dir.path
      })

      // Verify result
      expect(result).to.be.an('object')
      expect(result).to.have.property('entity_id', test_entity_id)
      expect(result).to.have.property('action', 'updated')

      // Verify entity was updated
      const entity = await db('entities')
        .where({ entity_id: test_entity_id })
        .first()

      expect(entity).to.have.property('title', updated_issue.title)
      expect(entity).to.have.property('description', updated_issue.body)

      // Verify task was updated (priority should have changed)
      const task = await db('tasks')
        .where({ entity_id: test_entity_id })
        .first()

      expect(task).to.have.property('priority', TASK_PRIORITY.CRITICAL)

      // Verify metadata was updated
      const metadata = await db('entity_metadata')
        .where({
          entity_id: test_entity_id,
          key: 'github_updated_at'
        })
        .first()

      expect(metadata).to.have.property('value', updated_issue.updated_at)

      // Check that labels were updated
      const labels_metadata = await db('entity_metadata')
        .where({
          entity_id: test_entity_id,
          key: 'github_labels'
        })
        .first()

      const parsed_labels = JSON.parse(labels_metadata.value)
      expect(parsed_labels).to.include('bug')
      expect(parsed_labels).to.include('priority:critical')
    })

    it('should detect conflicts when both local and GitHub changes exist', async () => {
      // Create an issue and import it first
      const initial_issue = {
        id: 12345,
        number: 789, // Different number to avoid conflicts
        title: 'Initial Title',
        body: 'Initial Description',
        state: 'open',
        html_url: 'https://github.com/test-owner/test-repo/issues/789',
        created_at: '2023-01-01T12:00:00Z',
        updated_at: '2023-01-02T14:30:00Z',
        labels: []
      }

      // First import to create the task
      const initial_result = await github.process_single_github_issue({
        issue: initial_issue,
        github_repository_owner: 'test-owner',
        github_repository_name: 'test-repo',
        user_id: test_user.user_id,
        github_token: 'test-token',
        import_history_base_directory: temp_dir.path
      })

      // Make sure entity was created
      expect(initial_result).to.have.property('entity_id')
      expect(initial_result).to.have.property('sync_record')
      expect(initial_result.sync_record).to.have.property('sync_id')

      // Get the task_id for this entity
      const conflict_task = await db('tasks')
        .where({ entity_id: initial_result.entity_id })
        .first()

      expect(conflict_task).to.not.be.undefined

      // Update the local entity (simulating local changes)
      await db('entities')
        .where({ entity_id: initial_result.entity_id })
        .update({
          title: 'Local Title Change',
          updated_at: new Date().toISOString()
        })

      // Mark the title field as updated in the sync record
      await sync.update_field_last_updated_timestamps(
        initial_result.sync_record.sync_id,
        { title: true },
        new Date().toISOString()
      )

      // Add a small delay to ensure timestamps are different
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Now try to sync a modified GitHub issue (different title)
      const modified_issue = {
        ...initial_issue,
        title: 'GitHub Title Change',
        updated_at: new Date().toISOString() // Updated timestamp
      }

      const result = await github.process_single_github_issue({
        issue: modified_issue,
        github_repository_owner: 'test-owner',
        github_repository_name: 'test-repo',
        user_id: test_user.user_id,
        github_token: 'test-token',
        import_history_base_directory: temp_dir.path
      })

      // Check that conflicts were detected
      expect(result).to.have.property('conflicts_found', true)
      expect(result).to.have.property('conflicts')
      expect(result.conflicts).to.include('title')
    })
  })

  describe('process_github_issues', () => {
    it('should process multiple GitHub issues in batch', async () => {
      // Create multiple test issues
      const test_issues = [
        {
          id: 2000001,
          number: 201,
          title: 'Batch Issue 1',
          body: 'This is batch issue 1',
          state: 'open',
          html_url: 'https://github.com/test-owner/test-repo/issues/201',
          created_at: '2023-02-01T10:00:00Z',
          updated_at: '2023-02-01T10:00:00Z',
          closed_at: null,
          labels: [],
          repository: {
            name: 'test-repo',
            owner: {
              login: 'test-owner'
            }
          }
        },
        {
          id: 2000002,
          number: 202,
          title: 'Batch Issue 2',
          body: 'This is batch issue 2',
          state: 'closed',
          html_url: 'https://github.com/test-owner/test-repo/issues/202',
          created_at: '2023-02-02T10:00:00Z',
          updated_at: '2023-02-02T12:00:00Z',
          closed_at: '2023-02-02T12:00:00Z',
          labels: [{ id: 'label3', name: 'enhancement', color: '0000ff' }],
          repository: {
            name: 'test-repo',
            owner: {
              login: 'test-owner'
            }
          }
        }
      ]

      // Process the batch
      const results = await github.process_github_issues({
        issues: test_issues,
        github_repository_owner: 'test-owner',
        github_repository_name: 'test-repo',
        user_id: test_user.user_id,
        import_history_base_directory: temp_dir.path,
        github_token: 'test-token'
      })

      // Check results
      expect(results).to.have.property('created', 2)
      expect(results).to.have.property('errors', 0)
      expect(results).to.have.property('processed_issues').with.lengthOf(2)

      // Verify the entities were created
      const entities = await db('entities')
        .whereIn(
          'title',
          test_issues.map((i) => i.title)
        )
        .where('user_id', test_user.user_id)
        .orderBy('created_at')

      expect(entities).to.have.lengthOf(2)

      // Verify tasks were created
      const tasks = await db('tasks')
        .whereIn(
          'entity_id',
          entities.map((e) => e.entity_id)
        )
        .orderBy('entity_id')

      expect(tasks).to.have.lengthOf(2)

      // Verify statuses were set correctly
      const task1 = tasks.find(
        (t) =>
          t.entity_id ===
          entities.find((e) => e.title === 'Batch Issue 1').entity_id
      )
      expect(task1).to.have.property('status', TASK_STATUS.NO_STATUS)

      const task2 = tasks.find(
        (t) =>
          t.entity_id ===
          entities.find((e) => e.title === 'Batch Issue 2').entity_id
      )
      expect(task2).to.have.property('status', TASK_STATUS.COMPLETED)
    })
  })

  describe('sync_task_back_to_github', () => {
    it('should prepare data for syncing a task back to GitHub', async () => {
      // Verify entity and task exist before proceeding
      const existing_entity = await db('entities')
        .where({ entity_id: test_entity_id })
        .first()
      expect(existing_entity).to.not.be.null

      const existing_task = await db('tasks')
        .where({ entity_id: test_entity_id })
        .first()
      expect(existing_task).to.not.be.null

      // Make changes to the entity and task
      await db('entities').where({ entity_id: test_entity_id }).update({
        title: 'Updated Task Title for Sync Back Test',
        description: 'Updated task description for testing sync back to GitHub.'
      })

      await db('tasks').where({ entity_id: test_entity_id }).update({
        status: TASK_STATUS.NO_STATUS // This should map to 'open' in GitHub
      })

      // Get entity data directly to compare
      const entity = await db('entities')
        .where({ entity_id: test_entity_id })
        .first()

      const task = await db('tasks')
        .where({ entity_id: test_entity_id })
        .first()

      // Verify required metadata exists before proceeding
      const github_issue_number = await db('entity_metadata')
        .where({ entity_id: test_entity_id, key: 'github_issue_number' })
        .first()
      expect(github_issue_number).to.not.be.null

      const github_repo = await db('entity_metadata')
        .where({ entity_id: test_entity_id, key: 'github_repo' })
        .first()
      expect(github_repo).to.not.be.null

      // Fetch all metadata
      const metadata_records = await db('entity_metadata').where({
        entity_id: test_entity_id
      })

      const metadata = {}
      for (const record of metadata_records) {
        metadata[record.key] = record.value
      }

      // Verify expected values for sync
      expect(entity.title).to.equal('Updated Task Title for Sync Back Test')
      expect(entity.description).to.equal(
        'Updated task description for testing sync back to GitHub.'
      )
      expect(task.status).to.equal(TASK_STATUS.NO_STATUS)
      expect(metadata.github_issue_number).to.equal(
        String(test_issue_data.number)
      )
      expect(metadata.github_repo).to.equal(
        `${test_github_repository_owner}/${test_github_repository_name}`
      )
    })
  })
})
