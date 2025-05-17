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
const temp_dir = create_temp_test_directory('github-conflict-resolution-test-')

describe('GitHub Sync Conflict Resolution Tests', () => {
  let test_user
  let test_issue_data
  let test_github_repository_owner
  let test_github_repository_name

  // Set up test environment
  before(async () => {
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

  // Clean up after all tests
  after(async () => {
    // Clean up temporary directory
    if (temp_dir) {
      temp_dir.cleanup()
    }
  })

  // Reset database before each describe block
  beforeEach(async () => {
    await reset_all_tables()

    // Recreate test user after database reset
    test_user = await create_test_user()
  })

  describe('Title conflict detection and resolution', () => {
    let test_entity_id
    let sync_record

    // Set up test entity for title conflict tests
    beforeEach(async () => {
      // Create a test entity
      const [entity] = await db('entities')
        .insert({
          title: 'Initial Issue Title',
          type: 'task',
          description: 'Initial issue description',
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

      // Create original issue data
      const original_issue = {
        ...test_issue_data,
        title: 'Original Issue Title'
      }

      // Add GitHub metadata
      await db('entity_metadata').insert([
        {
          entity_id: test_entity_id,
          key: 'external_id',
          value: `github:${test_github_repository_owner}/${test_github_repository_name}:${original_issue.number}`
        },
        {
          entity_id: test_entity_id,
          key: 'github_issue_number',
          value: String(original_issue.number)
        },
        {
          entity_id: test_entity_id,
          key: 'github_repo',
          value: `${test_github_repository_owner}/${test_github_repository_name}`
        },
        {
          entity_id: test_entity_id,
          key: 'github_updated_at',
          value: original_issue.updated_at
        }
      ])

      // Create sync record
      const external_id = `${test_github_repository_owner}/${test_github_repository_name}:${original_issue.number}`
      sync_record = await sync.get_or_create_sync_record({
        entity_id: test_entity_id,
        external_system: 'github',
        external_id
      })

      // Create initial import history
      const normalized_issue = github.normalize_github_issue({
        issue: original_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name
      })

      const import_cid = await sync.create_content_identifier(normalized_issue)

      await sync.save_import_data({
        external_system: 'github',
        entity_id: test_entity_id,
        raw_data: original_issue,
        processed_data: normalized_issue,
        import_history_base_directory: temp_dir.path
      })

      await sync.record_import_history({
        sync_id: sync_record.sync_id,
        raw_data: original_issue,
        import_cid
      })

      // Make sure title field is marked as locally updated
      await sync.update_field_last_updated_timestamps(
        sync_record.sync_id,
        { title: true },
        new Date().toISOString()
      )
    })

    it('should detect conflicts when both GitHub and local changes exist', async () => {
      // Create a modified GitHub issue with a different title
      const modified_issue = {
        ...test_issue_data,
        title: 'GitHub Updated Title',
        updated_at: new Date().toISOString() // More recent timestamp
      }

      const normalized_issue = github.normalize_github_issue({
        issue: modified_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name
      })

      const import_cid = await sync.create_content_identifier(normalized_issue)

      // Process the update - should detect conflict
      const result = await github.update_existing_task_from_github_issue({
        entity_id: test_entity_id,
        issue: modified_issue,
        normalized_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name,
        import_cid,
        import_history_base_directory: temp_dir.path
      })

      // Verify conflict was detected
      expect(result).to.have.property('conflicts_found', true)
      expect(result).to.have.property('conflicts').that.includes('title')
    })

    it('should use GitHub changes when conflict strategy is external_wins', async () => {
      // Set up conflict strategy for this entity
      await db('sync_configs').insert({
        entity_id: test_entity_id,
        entity_type: 'task',
        external_system: 'github',
        field_strategies: {
          title: 'external_wins',
          description: 'external_wins'
        }
      })

      // Set up a modified issue data
      const modified_issue = {
        ...test_issue_data,
        title: 'GitHub Title Should Win',
        updated_at: new Date().toISOString() // More recent timestamp
      }

      const normalized_issue = github.normalize_github_issue({
        issue: modified_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name
      })

      const import_cid = await sync.create_content_identifier(normalized_issue)

      // Process the update with conflict resolution
      await github.update_existing_task_from_github_issue({
        entity_id: test_entity_id,
        issue: modified_issue,
        normalized_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name,
        import_cid,
        import_history_base_directory: temp_dir.path
      })

      // Verify GitHub title was used
      const updated_entity = await db('entities')
        .where({ entity_id: test_entity_id })
        .first()

      expect(updated_entity).to.have.property(
        'title',
        'GitHub Title Should Win'
      )
    })
  })

  describe('Status conflict detection and resolution', () => {
    let test_entity_id
    let sync_record

    // Set up test entity for status conflict tests
    beforeEach(async () => {
      // Create a test entity
      const [entity] = await db('entities')
        .insert({
          title: 'Status Test Issue',
          type: 'task',
          description: 'Status test description',
          user_id: test_user.user_id,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*')

      test_entity_id = entity.entity_id

      // Create task with initial status
      await db('tasks').insert({
        entity_id: test_entity_id,
        status: TASK_STATUS.NO_STATUS,
        priority: TASK_PRIORITY.NONE
      })

      // Create original issue data - ensure state is 'open' to start with
      const original_issue = {
        ...test_issue_data,
        state: 'open',
        closed_at: null
      }

      // Add GitHub metadata
      await db('entity_metadata').insert([
        {
          entity_id: test_entity_id,
          key: 'external_id',
          value: `github:${test_github_repository_owner}/${test_github_repository_name}:${original_issue.number}`
        },
        {
          entity_id: test_entity_id,
          key: 'github_issue_number',
          value: String(original_issue.number)
        },
        {
          entity_id: test_entity_id,
          key: 'github_repo',
          value: `${test_github_repository_owner}/${test_github_repository_name}`
        },
        {
          entity_id: test_entity_id,
          key: 'github_updated_at',
          value: original_issue.updated_at
        }
      ])

      // Create sync record
      const external_id = `${test_github_repository_owner}/${test_github_repository_name}:${original_issue.number}`
      sync_record = await sync.get_or_create_sync_record({
        entity_id: test_entity_id,
        external_system: 'github',
        external_id
      })

      // Create initial import history with open state
      const normalized_issue = github.normalize_github_issue({
        issue: original_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name
      })

      const import_cid = await sync.create_content_identifier(normalized_issue)

      await sync.save_import_data({
        external_system: 'github',
        entity_id: test_entity_id,
        raw_data: original_issue,
        processed_data: normalized_issue,
        import_history_base_directory: temp_dir.path
      })

      await sync.record_import_history({
        sync_id: sync_record.sync_id,
        raw_data: original_issue,
        import_cid
      })

      // Mark status as locally updated
      await sync.update_field_last_updated_timestamps(
        sync_record.sync_id,
        { status: true },
        new Date().toISOString()
      )
    })

    it('should detect status conflicts', async () => {
      // Update local status to IN_PROGRESS
      await db('tasks').where({ entity_id: test_entity_id }).update({
        status: TASK_STATUS.IN_PROGRESS,
        finished_at: null
      })

      // Create a modified GitHub issue with different status
      const modified_issue = {
        ...test_issue_data,
        state: 'closed', // This maps to COMPLETED
        updated_at: new Date().toISOString(),
        closed_at: new Date().toISOString()
      }

      const normalized_issue = github.normalize_github_issue({
        issue: modified_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name
      })

      const import_cid = await sync.create_content_identifier(normalized_issue)

      // Process the update - should detect conflict
      const result = await github.update_existing_task_from_github_issue({
        entity_id: test_entity_id,
        issue: modified_issue,
        normalized_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name,
        import_cid,
        import_history_base_directory: temp_dir.path
      })

      // Verify conflict was detected
      expect(result).to.have.property('conflicts_found', true)
      expect(result).to.have.property('conflicts').that.includes('status')
    })

    it('should resolve status conflicts using external_wins strategy', async () => {
      // Update local status first
      await db('tasks').where({ entity_id: test_entity_id }).update({
        status: TASK_STATUS.IN_PROGRESS,
        finished_at: null
      })

      // Set up conflict strategy for this entity
      await db('sync_configs').insert({
        entity_id: test_entity_id,
        entity_type: 'task',
        external_system: 'github',
        field_strategies: {
          status: 'external_wins',
          // Add finished_at to also use external_wins strategy
          finished_at: 'external_wins'
        }
      })

      // Create a modified GitHub issue with closed status (different from original 'open')
      const modified_issue = {
        ...test_issue_data,
        state: 'closed',
        updated_at: new Date().toISOString(),
        closed_at: new Date().toISOString()
      }

      const normalized_issue = github.normalize_github_issue({
        issue: modified_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name
      })

      // Check that normalized issue has status = COMPLETED
      expect(normalized_issue).to.have.property('status', TASK_STATUS.COMPLETED)

      const import_cid = await sync.create_content_identifier(normalized_issue)

      // Process the update
      await github.update_existing_task_from_github_issue({
        entity_id: test_entity_id,
        issue: modified_issue,
        normalized_issue,
        github_repository_owner: test_github_repository_owner,
        github_repository_name: test_github_repository_name,
        import_cid,
        import_history_base_directory: temp_dir.path
      })

      // Verify GitHub status was used
      const updated_task = await db('tasks')
        .where({ entity_id: test_entity_id })
        .first()

      // Check that status was updated to COMPLETED
      expect(updated_task).to.have.property('status', TASK_STATUS.COMPLETED)
      expect(updated_task).to.have.property('finished_at').to.not.be.null
    })
  })
})
