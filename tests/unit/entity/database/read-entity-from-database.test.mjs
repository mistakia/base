import { expect } from 'chai'
import db from '#db'
import { read_entity_from_database } from '#libs-server/entity/database/read/read-entity-from-database.mjs'
import { write_entity_relations_to_database } from '#libs-server/entity/database/write/write-entity-relations-to-database.mjs'
import { write_entity_tags_to_database } from '#libs-server/entity/database/write/write-entity-tags-to-database.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_test_task,
  create_test_tag
} from '#tests/utils/index.mjs'

describe('read_entity_from_database', () => {
  let test_user
  let test_user_id
  let entity_id

  // Setup test data
  beforeEach(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
    test_user_id = test_user.user_id

    // Create a test entity to read
    entity_id = await create_test_task({
      user_id: test_user_id,
      additional_properties: { custom_field: 'custom value' }
    })
  })

  afterEach(async () => {
    await reset_all_tables()
  })

  it('should read an entity from the database', async () => {
    // Act
    const entity = await read_entity_from_database({
      entity_id
    })

    // Assert
    expect(entity).to.exist
    expect(entity.success).to.be.true
    expect(entity.entity_id).to.equal(entity_id)
    expect(entity.title).to.equal('Test Task')
    expect(entity.description).to.equal('Test description')
    expect(entity.type).to.equal('task')
    expect(entity.user_id).to.equal(test_user_id)
    expect(entity.markdown).to.equal('# Test Task\n\nContent body')

    // Verify properties are correctly assigned
    expect(entity.properties).to.exist
    expect(entity.properties.title).to.equal('Test Task')
    expect(entity.properties.description).to.equal('Test description')
    expect(entity.properties.custom_field).to.equal('custom value')

    // Check task-specific fields are directly merged
    expect(entity.status).to.equal('No status')
    expect(entity.priority).to.equal('Medium')
  })

  it('should merge type-specific fields directly into the entity result', async () => {
    // Act
    const entity = await read_entity_from_database({
      entity_id
    })

    // Assert
    expect(entity).to.exist
    expect(entity.status).to.equal('No status')
    expect(entity.priority).to.equal('Medium')
  })

  it('should filter by user_id if provided', async () => {
    // Create another user
    const another_user = await create_test_user()

    // Act - Try to read the entity with the wrong user ID
    const entity = await read_entity_from_database({
      entity_id,
      user_id: another_user.user_id
    })

    // Assert - Should not find the entity
    expect(entity).to.be.null

    // Act - Read with correct user ID
    const entity_with_correct_user = await read_entity_from_database({
      entity_id,
      user_id: test_user_id
    })

    // Assert - Should find the entity
    expect(entity_with_correct_user).to.exist
    expect(entity_with_correct_user.success).to.be.true
  })

  it('should include relations when include_relations is true', async () => {
    // Arrange - Create a related entity
    const related_entity_id = await create_test_task({
      user_id: test_user_id,
      title: 'Related Entity'
    })

    // Create a relation between the entities
    await write_entity_relations_to_database({
      entity_id,
      relations: {
        references: [related_entity_id]
      },
      user_id: test_user_id,
      db_client: db
    })

    // Act - Read with include_relations
    const entity = await read_entity_from_database({
      entity_id,
      include_relations: true
    })

    // Assert
    expect(entity).to.exist
    expect(entity.relations).to.exist
    expect(entity.relations.references).to.be.an('array')
    expect(entity.relations.references).to.include(related_entity_id)
  })

  it('should include tags when include_tags is true', async () => {
    // Arrange - Create a tag
    const tag_entity_id = await create_test_tag({
      user_id: test_user_id
    })

    // Add tag to entity
    await write_entity_tags_to_database({
      entity_id,
      tags: [tag_entity_id],
      db_client: db
    })

    // Act - Read with include_tags
    const entity = await read_entity_from_database({
      entity_id,
      include_tags: true
    })

    // Assert
    expect(entity).to.exist
    expect(entity.tags).to.exist
    expect(entity.tags).to.be.an('array')
    expect(entity.tags).to.have.length.at.least(1)
  })

  it('should return null for non-existent entity', async () => {
    // Generate a random UUID for non-existent entity
    const non_existent_id = '00000000-0000-0000-0000-000000000000'

    // Act
    const entity = await read_entity_from_database({
      entity_id: non_existent_id
    })

    // Assert
    expect(entity).to.be.null
  })

  it('should throw an error when entity_id is not provided', async () => {
    try {
      await read_entity_from_database({})
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.include('Entity ID is required')
    }
  })

  it('should use a transaction object when provided', async () => {
    // Arrange - Start a transaction
    const trx = await db.transaction()

    try {
      // Act - Read using the transaction
      const entity = await read_entity_from_database({
        entity_id,
        trx
      })

      // Assert
      expect(entity).to.exist
      expect(entity.entity_id).to.equal(entity_id)

      // Commit the transaction
      await trx.commit()
    } catch (error) {
      await trx.rollback()
      throw error
    }
  })
})
