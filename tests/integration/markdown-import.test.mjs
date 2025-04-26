import { expect } from 'chai'
import postgres from '#db'
import { import_repositories } from '#libs-server/markdown/index.mjs'
import { git } from '#libs-server'
import { create_test_user } from '#tests/utils/index.mjs'
import { create_temp_test_repo } from '#tests/utils/create-temp-test-repo.mjs'

describe('Markdown Import Integration Tests', () => {
  let test_user
  let user_repo
  let system_branch
  let user_branch

  before(async () => {
    test_user = await create_test_user()

    // Create a temp repo for user data
    user_repo = await create_temp_test_repo({
      prefix: 'user-repo-',
      initial_content: '# User Repository'
    })

    // Get the current system branch
    system_branch = await git.get_current_branch('.')
    user_branch = await git.get_current_branch(user_repo.path)
  })

  after(async () => {
    // Clean up the database
    await postgres('entities').where({ user_id: test_user.user_id }).delete()

    // Clean up the user repository
    if (user_repo && user_repo.cleanup) {
      user_repo.cleanup()
    }
  })

  beforeEach(async () => {
    // Clear entities before each test
    await postgres('entities').where({ user_id: test_user.user_id }).delete()
  })

  describe('import_repositories', () => {
    it('should import markdown files', async () => {
      // Clear database first
      await postgres('entities').where({ user_id: test_user.user_id }).delete()

      // Run the import using the real system directory
      const result = await import_repositories(
        {
          user_repository: {
            path: user_repo.path,
            branch: user_branch,
            is_submodule: false
          },
          system_branch,
          user_branch
        },
        test_user.user_id
      )

      // Check the results
      expect(result.imported).to.be.at.least(1)
      expect(result.errors).to.equal(0)

      // Verify entities were created in the database
      const entities = await postgres('entities')
        .where({ user_id: test_user.user_id })
        .select('*')

      expect(entities.length).to.equal(87)
    })

    it('should update existing entities when reimported', async () => {
      // First import
      await import_repositories(
        {
          user_repository: {
            path: user_repo.path,
            branch: user_branch,
            is_submodule: false
          },
          system_branch,
          user_branch
        },
        test_user.user_id
      )

      // Get the current entities
      const initial_entities = await postgres('entities')
        .where({ user_id: test_user.user_id })
        .select('*')

      // Store timestamps for comparison
      const initial_timestamps = initial_entities.map((e) => ({
        entity_id: e.entity_id,
        updated_at: e.updated_at
      }))

      // Wait a moment to ensure timestamp will be different
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Second import - should update timestamps but not create new entities
      await import_repositories(
        {
          user_repository: {
            path: user_repo.path,
            branch: user_branch,
            is_submodule: false
          },
          system_branch,
          user_branch,
          force_update: true // Force update even if git_sha is the same
        },
        test_user.user_id
      )

      // Get updated entities
      const updated_entities = await postgres('entities')
        .where({ user_id: test_user.user_id })
        .select('*')

      // The count should be the same (no new entities created)
      expect(updated_entities.length).to.equal(initial_entities.length)

      // At least one entity should have been updated
      const has_updated = updated_entities.some((updated) => {
        const initial = initial_timestamps.find(
          (e) => e.entity_id === updated.entity_id
        )
        return (
          initial && new Date(updated.updated_at) > new Date(initial.updated_at)
        )
      })

      expect(has_updated).to.be.true
    })

    it('should mark removed entities as archived', async () => {
      // First, import all files
      await import_repositories(
        {
          user_repository: {
            path: user_repo.path,
            branch: user_branch,
            is_submodule: false
          },
          system_branch,
          user_branch
        },
        test_user.user_id
      )

      // Get the current entity count
      await postgres('entities')
        .where({ user_id: test_user.user_id })
        .count('* as count')
        .then((rows) => parseInt(rows[0].count))

      // Create a temporary entity with a file_path that won't match any real file
      const temp_entity_id = await postgres('entities')
        .insert({
          title: 'Temporary Entity',
          type: 'text',
          description: 'This entity will be archived',
          user_id: test_user.user_id,
          markdown: '# Temporary\n\nThis is temporary.',
          content: 'This is temporary.',
          frontmatter: JSON.stringify({
            title: 'Temporary Entity',
            type: 'text',
            description: 'This entity will be archived'
          }),
          file_path: './system/non-existent-file.md',
          git_sha: 'fake-sha',
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('entity_id')
        .then((rows) => rows[0].entity_id)

      // Run import with stale entity removal
      const result = await import_repositories(
        {
          user_repository: {
            path: user_repo.path,
            branch: user_branch,
            is_submodule: false
          },
          system_branch,
          user_branch
        },
        test_user.user_id
      )

      // Check that at least the temp entity was archived
      expect(result.removed).to.be.at.least(1)

      // Verify the temp entity was archived
      const archived_entity = await postgres('entities')
        .where({ entity_id: temp_entity_id })
        .first()

      expect(archived_entity.archived_at).to.not.be.null
    })
  })
})
