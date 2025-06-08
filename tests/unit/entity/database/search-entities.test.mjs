import { expect } from 'chai'
import db from '#db'
import search_entities from '#libs-server/entity/database/search-entities.mjs'
import { write_entity_tags_to_database } from '#libs-server/entity/database/write/write-entity-tags-to-database.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_test_task,
  create_test_tag
} from '#tests/utils/index.mjs'
import { setup_test_directories } from '#tests/utils/setup-test-directories.mjs'

describe('search_entities', () => {
  let test_user
  let test_user_id
  let another_user
  let another_user_id
  let tag_base_uris = []
  let tag_entity_ids = []
  let test_directories

  // Setup test data
  before(async () => {
    await reset_all_tables()

    // Setup test directories and registry
    test_directories = setup_test_directories()

    // Create test users
    test_user = await create_test_user()
    test_user_id = test_user.user_id

    another_user = await create_test_user()
    another_user_id = another_user.user_id

    // Create test tags
    // These will create tag entities and return their entity_ids
    const tag_creation_results = await Promise.all([
      await create_test_tag({
        user_id: test_user_id,
        title: 'Project A',
        color: '#FF0000'
      }),
      await create_test_tag({
        user_id: test_user_id,
        title: 'Priority',
        color: '#00FF00'
      }),
      await create_test_tag({
        user_id: test_user_id,
        title: 'Personal',
        color: '#0000FF'
      })
    ])

    // Store the tag entity IDs and base_uris
    tag_base_uris = tag_creation_results.map((tag) => tag.base_uri)

    tag_entity_ids = tag_creation_results.map((tag) => tag.tag_entity_id)

    // Create test tasks with different titles and descriptions
    const tasks = [
      {
        title: 'Task 1 - Project A',
        description: 'Description for task 1',
        tags: [tag_entity_ids[0]] // Project A
      },
      {
        title: 'Task 2 - Project A High Priority',
        description: 'Description for task 2',
        tags: [tag_entity_ids[0], tag_entity_ids[1]] // Project A, Priority
      },
      {
        title: 'Task 3 - Personal',
        description: 'Description for task 3',
        tags: [tag_entity_ids[2]] // Personal
      },
      {
        title: 'Task 4 - Personal High Priority',
        description: 'Description for task 4',
        tags: [tag_entity_ids[1], tag_entity_ids[2]] // Priority, Personal
      },
      {
        title: 'Archived Task',
        description: 'This is an archived task',
        tags: [tag_entity_ids[0]],
        archived: true
      },
      {
        title: 'Task for another user',
        description: 'This task belongs to another user',
        user_id: another_user_id,
        tags: []
      }
    ]

    // Create tasks and assign tags
    for (const task of tasks) {
      const user_id = task.user_id || test_user_id
      const { task_entity_id } = await create_test_task({
        user_id,
        title: task.title,
        description: task.description,
        status: 'No status',
        priority: 'None',
        created_at: new Date(),
        updated_at: new Date(),
        archived_at: task.archived ? new Date() : null
      })

      if (task.tags.length > 0) {
        await write_entity_tags_to_database({
          entity_id: task_entity_id,
          tag_entity_ids: task.tags,
          db_client: db
        })
      }
    }
  })

  after(async () => {
    await reset_all_tables()
    if (test_directories) {
      test_directories.cleanup()
    }
  })

  it('should return all entities for a user without filters', async () => {
    // Act
    const results = await search_entities({
      user_id: test_user_id,
      entity_types: ['task'] // Filter to only tasks
    })

    // Assert
    expect(results).to.be.an('array')
    expect(results).to.have.length(4) // All non-archived tasks for the test user

    // Verify all entities belong to the test user
    results.forEach((entity) => {
      expect(entity.user_id).to.equal(test_user_id)
      expect(entity.archived_at).to.be.null
      expect(entity.type).to.equal('task')
    })
  })

  it('should filter entities by tag using base_uri', async () => {
    // Act - Search for entities with the "Project A" tag
    const results = await search_entities({
      user_id: test_user_id,
      tag_base_uris: [tag_base_uris[0]], // Project A tag
      entity_types: ['task'] // Filter to only tasks
    })

    // Assert
    expect(results).to.be.an('array')
    expect(results).to.have.length(2) // 2 non-archived tasks with Project A tag

    // Verify all returned entities have the Project A tag
    results.forEach((entity) => {
      expect(entity.title).to.include('Project A')
      expect(entity.type).to.equal('task')
    })
  })

  it('should filter entities by multiple tags using base_uri (AND logic)', async () => {
    // Act - Search for entities with both "Project A" and "Priority" tags
    const results = await search_entities({
      user_id: test_user_id,
      tag_base_uris: [tag_base_uris[0], tag_base_uris[1]], // Project A and Priority tags
      entity_types: ['task'] // Filter to only tasks
    })

    // Assert
    expect(results).to.be.an('array')
    expect(results).to.have.length(1) // Only one task has both tags
    expect(results[0].title).to.equal('Task 2 - Project A High Priority')
    expect(results[0].type).to.equal('task')
  })

  it('should filter entities by search term', async () => {
    // Act - Search for entities with "Personal" in the title
    const results = await search_entities({
      user_id: test_user_id,
      search_term: 'Personal',
      entity_types: ['task'] // Filter to only tasks
    })

    // Assert
    expect(results).to.be.an('array')
    expect(results).to.have.length(2) // 2 tasks with "Personal" in the title
    results.forEach((entity) => {
      expect(entity.title).to.include('Personal')
      expect(entity.type).to.equal('task')
    })
  })

  it('should filter entities by entity type', async () => {
    // Act - Search for task entities
    const results = await search_entities({
      user_id: test_user_id,
      entity_types: ['task']
    })

    // Assert
    expect(results).to.be.an('array')
    expect(results).to.have.length(4) // All non-archived tasks for the test user
    results.forEach((entity) => {
      expect(entity.type).to.equal('task')
    })
  })

  it('should include archived entities when requested', async () => {
    // Act - Search including archived entities
    const results = await search_entities({
      user_id: test_user_id,
      include_archived: true,
      entity_types: ['task'] // Filter to only tasks
    })

    // Assert
    expect(results).to.be.an('array')
    expect(results).to.have.length(1) // Only the archived task
    expect(results[0].title).to.equal('Archived Task')
    expect(results[0].archived_at).to.not.be.null
    expect(results[0].type).to.equal('task')
  })

  it('should respect pagination with limit and offset', async () => {
    // Act - Get first page (2 items)
    const page1 = await search_entities({
      user_id: test_user_id,
      limit: 2,
      offset: 0,
      entity_types: ['task'] // Filter to only tasks
    })

    // Act - Get second page (2 items)
    const page2 = await search_entities({
      user_id: test_user_id,
      limit: 2,
      offset: 2,
      entity_types: ['task'] // Filter to only tasks
    })

    // Assert
    expect(page1).to.be.an('array')
    expect(page1).to.have.length(2)
    expect(page2).to.be.an('array')
    expect(page2).to.have.length(2)

    // Verify no overlap between pages
    const page1_ids = page1.map((entity) => entity.entity_id)
    const page2_ids = page2.map((entity) => entity.entity_id)
    const intersection = page1_ids.filter((id) => page2_ids.includes(id))
    expect(intersection).to.have.length(0)
  })

  it('should combine multiple filters', async () => {
    // Act - Search with tag and search term
    const results = await search_entities({
      user_id: test_user_id,
      tag_base_uris: [tag_base_uris[1]], // Priority tag
      search_term: 'Personal',
      entity_types: ['task'] // Filter to only tasks
    })

    // Assert
    expect(results).to.be.an('array')
    expect(results).to.have.length(1) // Only one task matches both criteria
    expect(results[0].title).to.equal('Task 4 - Personal High Priority')
    expect(results[0].type).to.equal('task')
  })

  it('should throw an error when user_id is not provided', async () => {
    try {
      await search_entities({})
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.include('user_id')
    }
  })

  it('should use a transaction object when provided', async () => {
    // Arrange - Start a transaction
    const trx = await db.transaction()

    try {
      // Act - Search within the transaction
      const results = await search_entities({
        user_id: test_user_id,
        entity_types: ['task'], // Filter to only tasks
        trx
      })

      // Assert
      expect(results).to.be.an('array')
      expect(results.length).to.be.at.least(1)
      results.forEach((entity) => {
        expect(entity.type).to.equal('task')
      })

      // Commit the transaction
      await trx.commit()
    } catch (error) {
      await trx.rollback()
      throw error
    }
  })

  it('should return empty array when tag_base_uris do not match any tags', async () => {
    // Act - Search with non-existent base_uri
    const results = await search_entities({
      user_id: test_user_id,
      tag_base_uris: ['non-existent/path'],
      entity_types: ['task']
    })

    // Assert
    expect(results).to.be.an('array')
    expect(results).to.have.length(0)
  })
})
