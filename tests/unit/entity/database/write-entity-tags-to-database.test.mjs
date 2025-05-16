import { expect } from 'chai'
import db from '#db'
import { write_entity_tags_to_database } from '#libs-server/entity/database/write/write-entity-tags-to-database.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('write_entity_tags_to_database', () => {
  let test_user
  let test_user_id
  let entity_id
  let tag_entity_id1
  let tag_entity_id2

  beforeEach(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
    test_user_id = test_user.user_id

    // Create a test entity
    const entity = await db('entities')
      .insert({
        title: 'Test Entity',
        description: 'An entity for tag tests',
        type: 'task',
        user_id: test_user_id,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('entity_id')
    entity_id = entity[0].entity_id

    // Create tag entities
    const tag1 = await db('entities')
      .insert({
        title: 'Test Tag 1',
        description: 'First test tag',
        type: 'tag',
        user_id: test_user_id,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('entity_id')
    tag_entity_id1 = tag1[0].entity_id

    // Insert into tags table
    await db('tags').insert({ entity_id: tag_entity_id1 })

    const tag2 = await db('entities')
      .insert({
        title: 'Test Tag 2',
        description: 'Second test tag',
        type: 'tag',
        user_id: test_user_id,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('entity_id')
    tag_entity_id2 = tag2[0].entity_id

    // Insert into tags table
    await db('tags').insert({ entity_id: tag_entity_id2 })
  })

  afterEach(async () => {
    await reset_all_tables()
  })

  it('should write entity tags to the database', async () => {
    // Arrange
    const tags = [tag_entity_id1, tag_entity_id2]

    // Act
    await write_entity_tags_to_database({
      entity_id,
      tags,
      db_client: db
    })

    // Assert
    const stored_tags = await db('entity_tags')
      .where({ entity_id })
      .orderBy('tag_entity_id')

    expect(stored_tags).to.have.lengthOf(2)
    expect(stored_tags[0].tag_entity_id).to.equal(tag_entity_id1)
    expect(stored_tags[1].tag_entity_id).to.equal(tag_entity_id2)
  })

  it('should delete existing tags when writing new ones', async () => {
    // Arrange - first write some tags
    const initial_tags = [tag_entity_id1]

    await write_entity_tags_to_database({
      entity_id,
      tags: initial_tags,
      db_client: db
    })

    // Verify initial tags were written
    const initial_stored_tags = await db('entity_tags').where({ entity_id })
    expect(initial_stored_tags).to.have.lengthOf(1)

    // Act - write new tags
    const new_tags = [tag_entity_id2]

    await write_entity_tags_to_database({
      entity_id,
      tags: new_tags,
      db_client: db
    })

    // Assert - verify old tags replaced with new ones
    const final_stored_tags = await db('entity_tags').where({ entity_id })

    expect(final_stored_tags).to.have.lengthOf(1)
    expect(final_stored_tags[0].tag_entity_id).to.equal(tag_entity_id2)
  })

  it('should handle empty tags array', async () => {
    // First add some tags
    await write_entity_tags_to_database({
      entity_id,
      // TODO should probably be base_relative_path
      tags: [tag_entity_id1, tag_entity_id2],
      db_client: db
    })

    // Verify tags were added
    const initial_stored_tags = await db('entity_tags').where({ entity_id })
    expect(initial_stored_tags).to.have.lengthOf(2)

    // Act - write empty tags array
    await write_entity_tags_to_database({
      entity_id,
      tags: [],
      db_client: db
    })

    // Assert
    const stored_tags = await db('entity_tags').where({ entity_id })

    expect(stored_tags).to.have.lengthOf(0)
  })

  it('should do nothing when tags is null or undefined', async () => {
    // Act with null tags
    await write_entity_tags_to_database({
      entity_id,
      tags: null,
      db_client: db
    })

    // Assert no tags added
    const stored_tags_after_null = await db('entity_tags').where({ entity_id })
    expect(stored_tags_after_null).to.have.lengthOf(0)

    // Act with undefined tags
    await write_entity_tags_to_database({
      entity_id,
      tags: undefined,
      db_client: db
    })

    // Assert still no tags added
    const stored_tags_after_undefined = await db('entity_tags').where({
      entity_id
    })
    expect(stored_tags_after_undefined).to.have.lengthOf(0)
  })

  it('should work with a transaction', async () => {
    // Arrange
    // TODO should probably be base_relative_path
    const tags = [tag_entity_id1, tag_entity_id2]

    // Start a transaction
    const trx = await db.transaction()

    try {
      // Act
      await write_entity_tags_to_database({
        entity_id,
        tags,
        db_client: trx
      })

      // Assert - within transaction
      const tags_in_trx = await trx('entity_tags').where({ entity_id })
      expect(tags_in_trx).to.have.lengthOf(2)

      // Not visible in main DB yet
      const tags_in_db = await db('entity_tags').where({ entity_id })
      expect(tags_in_db).to.have.lengthOf(0)

      // Commit the transaction
      await trx.commit()

      // Now should be visible in main DB
      const committed_tags = await db('entity_tags').where({ entity_id })
      expect(committed_tags).to.have.lengthOf(2)
    } catch (error) {
      await trx.rollback()
      throw error
    }
  })
})
