import { expect } from 'chai'
import fs from 'fs/promises'
import import_github_issues from '#scripts/github/import-github-issues.mjs'
import {
  create_test_user,
  create_temp_test_directory
} from '#tests/utils/index.mjs'
import { get_fixture_path } from '#tests/utils/fixture-paths.mjs'
import { TASK_STATUS } from '#libs-shared/task-constants.mjs'
import db from '#db'

describe('GitHub Import Scripts Integration Tests', () => {
  let test_user
  let test_repo_info
  let test_issues
  let test_directory
  let mock_get_github_repo_issues

  // Set up test environment
  before(async () => {
    // Create test user
    test_user = await create_test_user()

    test_directory = create_temp_test_directory('github-issues-test-')

    // Set up test repository info
    test_repo_info = {
      owner: 'testuser',
      repo: 'test-repo',
      github_token: 'test-token'
    }

    // Load test issues from fixture
    const fixture_path = get_fixture_path('github/github-repo-issues.json')
    const fixture_data = JSON.parse(await fs.readFile(fixture_path, 'utf8'))
    test_issues = fixture_data.issues

    mock_get_github_repo_issues = async () => fixture_data
  })

  // Clean up after tests
  after(async () => {
    // Clean up all test data related to our test user
    await db('entities').where({ user_id: test_user.user_id }).delete()

    // Clean up temporary directory
    if (test_directory) {
      test_directory.cleanup()
    }
  })

  describe('import_github_issues script', () => {
    it('should import issues from a GitHub repository', async () => {
      const results = await import_github_issues({
        owner: test_repo_info.owner,
        repo: test_repo_info.repo,
        github_token: test_repo_info.github_token,
        user_id: test_user.user_id,
        import_history_base_directory: test_directory.path,
        get_github_repo_issues: mock_get_github_repo_issues
      })

      // Verify the results
      expect(results).to.be.an('object')
      expect(results).to.have.property('created', 3)
      expect(results).to.have.property('skipped', 0)
      expect(results).to.have.property('updated', 0)
      expect(results).to.have.property('conflicts', 0)
      expect(results).to.have.property('errors', 0)

      // Check if entities were created properly
      const entities = await db('entities')
        .whereIn(
          'title',
          test_issues.map((issue) => issue.title)
        )
        .where('user_id', test_user.user_id)
        .orderBy('created_at')

      const earliest_test_issue = test_issues.sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      )[0]

      expect(entities).to.be.an('array')
      expect(entities).to.have.lengthOf(3)

      // Verify first issue was imported correctly
      expect(entities[0]).to.have.property('title', earliest_test_issue.title)
      expect(entities[0]).to.have.property(
        'description',
        earliest_test_issue.body
      )

      // Verify tasks were created
      const tasks = await db('tasks')
        .whereIn(
          'entity_id',
          entities.map((entity) => entity.entity_id)
        )
        .orderBy('entity_id')

      expect(tasks).to.be.an('array')
      expect(tasks).to.have.lengthOf(3)

      // Verify statuses match the issues
      const tasks_by_entity_id = {}
      tasks.forEach((task) => {
        tasks_by_entity_id[task.entity_id] = task
      })

      // Verify open/closed statuses match issues in fixture
      const entity_by_title = {}
      entities.forEach((entity) => {
        entity_by_title[entity.title] = entity
      })

      const auth_bug_entity =
        entity_by_title['Fix authentication bug in login system']
      const dark_mode_entity =
        entity_by_title['Implement dark mode for dashboard']
      const docs_entity =
        entity_by_title['Update documentation for API endpoints']

      expect(tasks_by_entity_id[auth_bug_entity.entity_id]).to.have.property(
        'status',
        TASK_STATUS.NO_STATUS
      )
      expect(tasks_by_entity_id[dark_mode_entity.entity_id]).to.have.property(
        'status',
        TASK_STATUS.NO_STATUS
      )
      expect(tasks_by_entity_id[docs_entity.entity_id]).to.have.property(
        'status',
        TASK_STATUS.COMPLETED
      )

      // Verify metadata was created
      const metadata_count = await db('entity_metadata')
        .whereIn(
          'entity_id',
          entities.map((entity) => entity.entity_id)
        )
        .count('metadata_id as count')
        .first()

      expect(Number(metadata_count.count)).to.be.at.least(10)

      // Verify external syncs were created
      const syncs = await db('external_syncs')
        .whereIn(
          'entity_id',
          entities.map((entity) => entity.entity_id)
        )
        .orderBy('entity_id')

      expect(syncs).to.be.an('array')
      expect(syncs).to.have.lengthOf(3)

      // Verify external IDs match pattern
      // Create a map of entity titles to syncs for easier validation
      const entity_by_sync_id = {}
      for (let i = 0; i < entities.length; i++) {
        entity_by_sync_id[entities[i].entity_id] = entities[i]
      }

      // Create a map of issue titles to issue numbers
      const issue_number_by_title = {}
      for (let i = 0; i < test_issues.length; i++) {
        issue_number_by_title[test_issues[i].title] = test_issues[i].number
      }

      // Verify each sync has correct external ID based on entity title
      for (let i = 0; i < syncs.length; i++) {
        const entity = entity_by_sync_id[syncs[i].entity_id]
        const issue_number = issue_number_by_title[entity.title]
        expect(syncs[i].external_id).to.equal(
          `${test_repo_info.owner}/${test_repo_info.repo}:${issue_number}`
        )
      }
    })

    it('should process a single issue directly', async () => {
      // Use an issue from the fixture
      const single_issue = {
        ...test_issues[0],
        number: 4, // Change number to avoid conflict with previous test
        title: 'Single Issue Test',
        body: 'This is a single issue for testing direct issue import'
      }

      // Run import with single issue
      const results = await import_github_issues({
        owner: test_repo_info.owner,
        repo: test_repo_info.repo,
        github_token: test_repo_info.github_token,
        user_id: test_user.user_id,
        single_issue,
        import_history_base_directory: test_directory.path
      })

      // Verify the results
      expect(results).to.be.an('object')
      expect(results).to.have.property('created', 1)
      expect(results).to.have.property('skipped', 0)

      // Verify entity was created
      const entity = await db('entities')
        .where('title', single_issue.title)
        .where('user_id', test_user.user_id)
        .first()

      expect(entity).to.be.an('object')
      expect(entity).to.have.property('title', single_issue.title)
      expect(entity).to.have.property('description', single_issue.body)

      // Verify metadata
      const metadata = await db('entity_metadata')
        .where('entity_id', entity.entity_id)
        .where('key', 'github_issue_number')
        .first()

      expect(metadata).to.be.an('object')
      expect(metadata).to.have.property('value', String(single_issue.number))
    })
  })
})
