import { expect } from 'chai'
import fs from 'fs/promises'
import { get_fixture_path } from '#tests/utils/fixture-paths.mjs'
import db from '#db'
import {
  create_github_metadata_entries,
  update_entity_from_normalized_issue
} from '#libs-server/integrations/github/github-sync.mjs'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'
import { create_test_user } from '#tests/utils/index.mjs'

describe('GitHub Sync Helper Functions Unit Tests', () => {
  let test_user
  let test_issue_data
  let test_entity_id

  // Set up test environment
  before(async () => {
    // Create test user
    test_user = await create_test_user()

    // Load test fixture data
    const fixture_path = get_fixture_path('github/github-issue.json')
    const fixture_data = await fs.readFile(fixture_path, 'utf8')
    test_issue_data = JSON.parse(fixture_data)

    // Create a test entity for update tests
    const [entity] = await db('entities')
      .insert({
        title: 'Test Entity for GitHub Sync Tests',
        type: 'task',
        description: 'Original description',
        user_id: test_user.user_id,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*')

    test_entity_id = entity.entity_id

    // Create a test task
    await db('tasks').insert({
      entity_id: test_entity_id,
      status: TASK_STATUS.NO_STATUS,
      priority: TASK_PRIORITY.NONE
    })
  })

  // Clean up after all tests
  after(async () => {
    // Clean up all test entities for the test user
    await db('entities').where({ user_id: test_user.user_id }).delete()
  })

  describe('create_github_metadata_entries', () => {
    it('should create basic metadata entries for GitHub issue', () => {
      const github_repository_owner = 'test-owner'
      const github_repository_name = 'test-repo'

      const normalized_issue = {
        external_url: 'https://github.com/test-owner/test-repo/issues/123',
        updated_at: '2023-01-02T14:00:00Z'
      }

      const metadata_entries = create_github_metadata_entries({
        entity_id: test_entity_id,
        issue: test_issue_data,
        normalized_issue,
        github_repository_owner,
        github_repository_name
      })

      // Verify base metadata entries
      expect(metadata_entries).to.be.an('array')
      expect(metadata_entries.length).to.be.at.least(5)

      // Check required metadata entries
      const external_id_entry = metadata_entries.find(
        (e) => e.key === 'external_id'
      )
      expect(external_id_entry).to.exist
      expect(external_id_entry.value).to.equal(
        `github:${github_repository_owner}/${github_repository_name}:${test_issue_data.number}`
      )

      const external_url_entry = metadata_entries.find(
        (e) => e.key === 'external_url'
      )
      expect(external_url_entry).to.exist
      expect(external_url_entry.value).to.equal(normalized_issue.external_url)

      const repo_entry = metadata_entries.find((e) => e.key === 'github_repo')
      expect(repo_entry).to.exist
      expect(repo_entry.value).to.equal(
        `${github_repository_owner}/${github_repository_name}`
      )
    })

    it('should add labels metadata when issue has labels', () => {
      const github_repository_owner = 'test-owner'
      const github_repository_name = 'test-repo'

      const issue_with_labels = {
        ...test_issue_data,
        labels: [
          { name: 'bug', color: 'ff0000' },
          { name: 'enhancement', color: '0000ff' }
        ]
      }

      const normalized_issue = {
        external_url: 'https://github.com/test-owner/test-repo/issues/123',
        updated_at: '2023-01-02T14:00:00Z'
      }

      const metadata_entries = create_github_metadata_entries({
        entity_id: test_entity_id,
        issue: issue_with_labels,
        normalized_issue,
        github_repository_owner,
        github_repository_name
      })

      // Find labels metadata entry
      const labels_entry = metadata_entries.find(
        (e) => e.key === 'github_labels'
      )
      expect(labels_entry).to.exist

      // Verify labels are stored as JSON
      const parsed_labels = JSON.parse(labels_entry.value)
      expect(parsed_labels).to.be.an('array')
      expect(parsed_labels).to.include('bug')
      expect(parsed_labels).to.include('enhancement')
    })

    it('should add project item ID when available', () => {
      const github_repository_owner = 'test-owner'
      const github_repository_name = 'test-repo'

      const normalized_issue = {
        external_url: 'https://github.com/test-owner/test-repo/issues/123',
        updated_at: '2023-01-02T14:00:00Z',
        github_project_item_id: 'project_item_123'
      }

      const metadata_entries = create_github_metadata_entries({
        entity_id: test_entity_id,
        issue: test_issue_data,
        normalized_issue,
        github_repository_owner,
        github_repository_name
      })

      // Find project item metadata entry
      const project_item_entry = metadata_entries.find(
        (e) => e.key === 'github_project_item_id'
      )
      expect(project_item_entry).to.exist
      expect(project_item_entry.value).to.equal('project_item_123')
    })
  })

  describe('update_entity_from_normalized_issue', () => {
    it('should update entity and task with normalized issue data', async () => {
      const normalized_issue = {
        title: 'Updated Title from GitHub',
        description: 'Updated description from GitHub issue',
        status: TASK_STATUS.IN_PROGRESS,
        priority: TASK_PRIORITY.HIGH,
        finished_at: null
      }

      await update_entity_from_normalized_issue({
        entity_id: test_entity_id,
        normalized_issue
      })

      // Check entity was updated
      const updated_entity = await db('entities')
        .where({ entity_id: test_entity_id })
        .first()

      expect(updated_entity).to.have.property('title', normalized_issue.title)
      expect(updated_entity).to.have.property(
        'description',
        normalized_issue.description
      )

      // Check task was updated
      const updated_task = await db('tasks')
        .where({ entity_id: test_entity_id })
        .first()

      expect(updated_task).to.have.property('status', normalized_issue.status)
      expect(updated_task).to.have.property(
        'priority',
        normalized_issue.priority
      )
      expect(updated_task).to.have.property('finished_at', null)
    })

    it('should handle finished_at date', async () => {
      const finished_date = '2023-04-01T10:00:00Z'

      const normalized_issue = {
        title: 'Completed Task',
        description: 'This task has been completed',
        status: TASK_STATUS.COMPLETED,
        priority: TASK_PRIORITY.NONE,
        finished_at: finished_date
      }

      await update_entity_from_normalized_issue({
        entity_id: test_entity_id,
        normalized_issue
      })

      // Check task updated with finished date
      const updated_task = await db('tasks')
        .where({ entity_id: test_entity_id })
        .first()

      expect(updated_task).to.have.property('status', TASK_STATUS.COMPLETED)

      // Verify finished_at was set (note: date comparison can be tricky)
      expect(updated_task).to.have.property('finished_at')
      expect(updated_task.finished_at).to.not.be.null

      // Convert to ISO string for comparison (ignoring milliseconds)
      const task_finished_at = new Date(updated_task.finished_at)
        .toISOString()
        .split('.')[0]
      const expected_finished_at = new Date(finished_date)
        .toISOString()
        .split('.')[0]

      expect(task_finished_at).to.equal(expected_finished_at)
    })

    it('should update date fields when provided', async () => {
      const start_by_date = '2023-05-01T00:00:00Z'
      const finish_by_date = '2023-06-01T00:00:00Z'

      const normalized_issue = {
        title: 'Task With Dates',
        description: 'This task has start and finish dates',
        status: TASK_STATUS.NO_STATUS,
        priority: TASK_PRIORITY.NONE,
        start_by: start_by_date,
        finish_by: finish_by_date
      }

      await update_entity_from_normalized_issue({
        entity_id: test_entity_id,
        normalized_issue
      })

      // Check task updated with dates
      const updated_task = await db('tasks')
        .where({ entity_id: test_entity_id })
        .first()

      // Verify dates were set
      expect(updated_task).to.have.property('start_by')
      expect(updated_task).to.have.property('finish_by')
      expect(updated_task.start_by).to.not.be.null
      expect(updated_task.finish_by).to.not.be.null

      // Convert to ISO string for comparison (ignoring milliseconds)
      const task_start_by = new Date(updated_task.start_by)
        .toISOString()
        .split('.')[0]
      const task_finish_by = new Date(updated_task.finish_by)
        .toISOString()
        .split('.')[0]

      const expected_start_by = new Date(start_by_date)
        .toISOString()
        .split('.')[0]
      const expected_finish_by = new Date(finish_by_date)
        .toISOString()
        .split('.')[0]

      expect(task_start_by).to.equal(expected_start_by)
      expect(task_finish_by).to.equal(expected_finish_by)
    })
  })
})
