import { expect } from 'chai'
import fs from 'fs/promises'

import import_github_project_issues from '#scripts/github/import-github-project-issues.mjs'
import {
  create_test_user,
  create_temp_test_directory
} from '#tests/utils/index.mjs'
import { get_fixture_path } from '#tests/utils/fixture-paths.mjs'
import db from '#db'

describe('GitHub Project Import Integration Tests', () => {
  let test_user
  let test_project_data
  let test_project_info
  let test_issues
  let test_directory
  let mock_get_github_project

  // Set up test environment
  before(async () => {
    // Create test user
    test_user = await create_test_user()

    test_directory = create_temp_test_directory('github-project-test-')

    // Set up test project info
    test_project_info = {
      username: 'test-org',
      project_number: 1,
      github_token: 'test-token'
    }

    // Load project data from fixtures
    const project_items_path = get_fixture_path(
      'github/github-project-items.json'
    )
    test_project_data = JSON.parse(
      await fs.readFile(project_items_path, 'utf8')
    )

    // Extract test issues from the project items
    test_issues = test_project_data.data.user.projectV2.items.nodes
      .map((node) => {
        // Only extract issues that have content (some might be empty)
        if (node.content && Object.keys(node.content).length > 0) {
          return {
            id: node.content.id,
            number: node.content.number,
            title: node.content.title,
            body: node.content.body,
            state: node.content.state === 'OPEN' ? 'open' : 'closed',
            html_url: node.content.url,
            created_at: node.content.createdAt,
            updated_at: node.content.updatedAt,
            closed_at: node.content.closedAt,
            labels: node.content.labels
              ? node.content.labels.nodes.map((label) => ({
                  id: label.id,
                  name: label.name,
                  color: label.color
                }))
              : [],
            repository: node.content.repository
              ? {
                  name: node.content.repository.name,
                  owner: {
                    login: node.content.repository.owner.login
                  }
                }
              : null
          }
        }
        return null
      })
      .filter(Boolean) // Remove null entries

    mock_get_github_project = async () => test_project_data
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

  describe('import_github_project_issues function', () => {
    it('should import issues from a GitHub project', async () => {
      const results = await import_github_project_issues({
        username: test_project_info.username,
        project_number: test_project_info.project_number,
        github_token: test_project_info.github_token,
        user_id: test_user.user_id,
        import_history_base_directory: test_directory.path,
        get_github_project: mock_get_github_project
      })

      // Verify the results
      expect(results).to.be.an('object')
      expect(results).to.have.property('totals')
      expect(results.totals).to.have.property('created').that.is.greaterThan(0)
      expect(results.totals).to.have.property('updated')
      expect(results.totals).to.have.property('skipped')
      expect(results.totals).to.have.property('conflicts')
      expect(results.totals).to.have.property('errors')

      // Verify project info was captured
      expect(results).to.have.property('project')
      expect(results.project).to.have.property(
        'username',
        test_project_info.username
      )
      expect(results.project).to.have.property(
        'project_number',
        test_project_info.project_number
      )
      expect(results.project).to.have.property(
        'id',
        test_project_data.data.user.projectV2.id
      )

      // Check that created entities match our test issues count
      const created_count = results.totals.created
      expect(created_count).to.equal(test_issues.length)

      // Check if entities were created properly
      const entities = await db('entities')
        .whereIn(
          'title',
          test_issues.map((issue) => issue.title)
        )
        .where('user_id', test_user.user_id)
        .orderBy('created_at')

      expect(entities).to.be.an('array')
      expect(entities).to.have.lengthOf(test_issues.length)

      // Verify all issues were imported
      const titles = entities.map((entity) => entity.title)
      test_issues.forEach((issue) => {
        expect(titles).to.include(issue.title)
      })

      // Verify tasks were created
      const tasks = await db('tasks')
        .whereIn(
          'entity_id',
          entities.map((entity) => entity.entity_id)
        )
        .orderBy('entity_id')

      expect(tasks).to.be.an('array')
      expect(tasks).to.have.lengthOf(test_issues.length)

      // Verify metadata was created correctly
      let metadata_count = 0
      for (const entity of entities) {
        const metadata = await db('entity_metadata')
          .where('entity_id', entity.entity_id)
          .where('key', 'github_project_item_id')
          .first()

        // Some issues might not have project item IDs, so we only count the ones that do
        if (metadata) {
          metadata_count++
          // Check that we saved project item ID in metadata
          expect(metadata).to.be.an('object')
          expect(metadata.value).to.match(/^PVTI_/)
        }
      }

      // At least some entities should have metadata
      expect(metadata_count).to.be.greaterThan(0)

      // Verify external syncs were created
      const sync_count = await db('external_syncs')
        .whereIn(
          'entity_id',
          entities.map((entity) => entity.entity_id)
        )
        .count('sync_id as count')
        .first()

      expect(Number(sync_count.count)).to.equal(test_issues.length)
    })
  })
})
