import { expect } from 'chai'
import path from 'path'

import postgres from '#db'
import { import_repository_from_git } from '#libs-server/entity/database/import/import-repository-from-git.mjs'
import { create_test_user, create_test_entity } from '#tests/utils/index.mjs'
import { create_temp_test_repo } from '#tests/utils/create-temp-test-repo.mjs'
import reset_all_tables from '#tests/utils/reset-all-tables.mjs'
import {
  register_base_directories,
  clear_registered_directories
} from '#libs-server/base-uri/index.mjs'

describe('Markdown Import Integration Tests', function () {
  this.timeout(30000)

  let test_user
  let test_repo
  let branch

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    // Create a temp repo for user data
    test_repo = await create_temp_test_repo({
      prefix: 'user-repo-',
      initial_content: '---\ntype: text\n---\n# User Repository'
    })
    branch = test_repo.system_branch

    // Register directories with the base URI registry
    register_base_directories({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })

    // Add a proper entity file to the user repo for testing
    await create_test_entity({
      base_uri: 'user:test-entity.md',
      branch: test_repo.user_branch,
      entity_properties: {
        title: 'Test Entity',
        user_id: test_user.user_id
      },
      entity_type: 'text',
      entity_content:
        '# Test Entity\n\nThis is a test entity for import testing.'
    })
  })

  after(async () => {
    // Clean up the database
    await postgres('entities').where({ user_id: test_user.user_id }).delete()

    // Clean up registry and repositories
    clear_registered_directories()
    if (test_repo && test_repo.cleanup) {
      test_repo.cleanup()
    }
  })

  beforeEach(async () => {
    // Clear entities before each test
    await postgres('entities').where({ user_id: test_user.user_id }).delete()
  })

  describe('import_repository_from_git', () => {
    it('should import markdown files', async () => {
      // Clear database first
      await postgres('entities').where({ user_id: test_user.user_id }).delete()

      // Run the import using the registry-resolved directories
      const result = await import_repository_from_git({
        user_id: test_user.user_id,
        branch
      })

      // Check the results
      expect(result.imported).to.be.at.least(1)
      expect(result.errors).to.equal(0)

      // Verify entities were created in the database
      const entities = await postgres('entities')
        .where({ user_id: test_user.user_id })
        .select('*')

      expect(entities.length).to.equal(2) // 1 from user repo + 1 workflow from system repo
    })

    it('should mark removed entities as archived', async () => {
      // First, import all files
      await import_repository_from_git({
        user_id: test_user.user_id,
        branch
      })

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
          absolute_path: path.join(
            test_repo.system_path,
            'system/non-existent-file.md'
          ),
          git_sha: 'fake-sha',
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('entity_id')
        .then((rows) => rows[0].entity_id)

      // Run import with stale entity removal
      const result = await import_repository_from_git({
        user_id: test_user.user_id,
        branch
      })

      // Check that at least the temp entity was archived
      expect(result.removed).to.be.at.least(1)
      expect(result.errors).to.equal(0)

      // Verify the temp entity was archived
      const archived_entity = await postgres('entities')
        .where({ entity_id: temp_entity_id })
        .first()

      expect(archived_entity).to.be.undefined
    })
  })
})
