import { expect } from 'chai'
import db from '#db'
import { v4 as uuid } from 'uuid'

import { delete_entity_from_database } from '#libs-server/entity/database/delete-entity-from-database.mjs'
import { read_entity_from_database } from '#libs-server/entity/database/read/read-entity-from-database.mjs'
import write_entity_to_database from '#libs-server/entity/database/write/write-entity-to-database.mjs'
import { write_entity_tags_to_database } from '#libs-server/entity/database/write/write-entity-tags-to-database.mjs'
import { write_entity_relations_to_database } from '#libs-server/entity/database/write/write-entity-relations-to-database.mjs'
import { create_test_user, reset_all_tables } from '#tests/utils/index.mjs'
import { ENTITY_TYPES } from '#libs-shared/entity-constants.mjs'

describe('delete_entity_from_database', () => {
  let test_user
  let test_user_id
  let entity_id
  let related_entity_id
  let tag_entity_id
  let text_entity_id

  beforeEach(async () => {
    // Reset database tables and create test user
    await reset_all_tables()
    test_user = await create_test_user()
    test_user_id = test_user.user_id

    // Create a test entity
    entity_id = await write_entity_to_database({
      entity_properties: {
        title: 'Test Entity for Deletion',
        description: 'Entity to test deletion functionality',
        user_id: test_user_id,
        entity_id: uuid()
      },
      entity_type: ENTITY_TYPES.TASK,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Create a related entity
    related_entity_id = await write_entity_to_database({
      entity_properties: {
        title: 'Related Entity',
        description: 'Entity related to test entity',
        user_id: test_user_id,
        entity_id: uuid()
      },
      entity_type: ENTITY_TYPES.TASK,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Create a tag entity
    tag_entity_id = await write_entity_to_database({
      entity_properties: {
        title: 'Test Tag',
        description: 'Tag for testing',
        user_id: test_user_id,
        entity_id: uuid()
      },
      entity_type: ENTITY_TYPES.TAG,
      user_id: test_user_id,
      absolute_path: '/dummy/path.md',
      base_relative_path: 'dummy/base/path',
      git_sha: 'dummysha1'
    })

    // Create a text entity
    // Note: For text type, frontmatter, markdown, and file_path are required by the DB constraint
    const text_content = '# Test Text\n\nThis is test text content.'
    const text_frontmatter = {
      title: 'Test Text Entity',
      description: 'Text entity for testing',
      user_id: test_user_id
    }

    text_entity_id = await write_entity_to_database({
      entity_properties: {
        title: 'Test Text Entity',
        description: 'Text entity for testing',
        user_id: test_user_id,
        frontmatter: text_frontmatter,
        entity_id: uuid()
      },
      entity_type: ENTITY_TYPES.TEXT,
      entity_content: text_content,
      user_id: test_user_id,
      absolute_path: 'test/text-entity.md',
      base_relative_path: 'test/text-entity',
      git_sha: 'dummysha1'
    })

    // Create entity relation
    await write_entity_relations_to_database({
      entity_id,
      relations: {
        related_to: [related_entity_id]
      },
      user_id: test_user_id,
      db_client: db
    })

    // Add tag to entity
    await write_entity_tags_to_database({
      entity_id,
      tag_entity_ids: [tag_entity_id],
      db_client: db
    })
  })

  it('should delete an entity permanently from the database', async () => {
    // Verify entity exists before deletion
    const entity_before = await read_entity_from_database({ entity_id })
    expect(entity_before).to.exist
    expect(entity_before.entity_id).to.equal(entity_id)

    // Delete the entity
    const result = await delete_entity_from_database({
      entity_id,
      user_id: test_user_id
    })
    expect(result).to.be.true

    // Verify entity doesn't exist after deletion
    const entity_after = await read_entity_from_database({ entity_id })
    expect(entity_after).to.be.null

    // Verify relations are deleted
    const relations = await db('entity_relations')
      .where({ source_entity_id: entity_id })
      .orWhere({ target_entity_id: entity_id })
    expect(relations).to.have.lengthOf(0)

    // Verify tags are deleted
    const tags = await db('entity_tags').where({ entity_id })
    expect(tags).to.have.lengthOf(0)
  })

  it('should delete a text entity from the database', async () => {
    // Verify text entity exists before deletion
    const entity_before = await read_entity_from_database({
      entity_id: text_entity_id
    })
    expect(entity_before).to.exist
    expect(entity_before.entity_id).to.equal(text_entity_id)
    expect(entity_before.type).to.equal(ENTITY_TYPES.TEXT)

    // Delete the text entity
    const result = await delete_entity_from_database({
      entity_id: text_entity_id,
      user_id: test_user_id
    })
    expect(result).to.be.true

    // Verify entity doesn't exist after deletion
    const entity_after = await read_entity_from_database({
      entity_id: text_entity_id
    })
    expect(entity_after).to.be.null
  })

  it('should verify user ownership when user_id is provided', async () => {
    // Try to delete with incorrect user_id
    const incorrect_user_id = uuid()
    const result = await delete_entity_from_database({
      entity_id,
      user_id: incorrect_user_id
    })
    expect(result).to.be.false

    // Entity should still exist
    const entity = await db('entities').where({ entity_id }).first()
    expect(entity).to.exist
  })

  it('should return false when entity does not exist', async () => {
    const non_existent_id = uuid()
    const result = await delete_entity_from_database({
      entity_id: non_existent_id,
      user_id: test_user_id
    })
    expect(result).to.be.false
  })

  it('should throw an error when entity_id is not provided', async () => {
    try {
      await delete_entity_from_database({
        user_id: test_user_id
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Entity ID is required')
    }
  })

  it('should throw an error when user_id is not provided', async () => {
    try {
      await delete_entity_from_database({
        entity_id
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('User ID is required')
    }
  })

  it('should work with a transaction', async () => {
    // Start a transaction
    const trx = await db.transaction()

    try {
      // Delete the entity within the transaction
      const result = await delete_entity_from_database({
        entity_id,
        user_id: test_user_id,
        trx
      })
      expect(result).to.be.true

      // Entity should be deleted within the transaction
      const entity_in_trx = await trx('entities').where({ entity_id }).first()
      expect(entity_in_trx).to.be.undefined

      // But should still exist in the main database (uncommitted)
      const entity_in_db = await db('entities').where({ entity_id }).first()
      expect(entity_in_db).to.exist

      // Commit the transaction
      await trx.commit()

      // Now entity should be deleted from the main database
      const entity_after_commit = await db('entities')
        .where({ entity_id })
        .first()
      expect(entity_after_commit).to.be.undefined
    } catch (error) {
      await trx.rollback()
      throw error
    }
  })
})
