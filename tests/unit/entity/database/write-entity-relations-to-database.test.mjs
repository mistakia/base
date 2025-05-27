import { expect } from 'chai'
import db from '#db'
import { write_entity_relations_to_database } from '#libs-server/entity/database/write/write-entity-relations-to-database.mjs'
import { reset_all_tables, create_test_user } from '#tests/utils/index.mjs'

describe('write_entity_relations_to_database', () => {
  let test_user
  let test_user_id
  let source_entity_id
  let target_entity_id1
  let target_entity_id2

  beforeEach(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
    test_user_id = test_user.user_id

    // Create a source entity
    const source_entity = await db('entities')
      .insert({
        title: 'Source Entity',
        description: 'A source entity for relation tests',
        type: 'task',
        user_id: test_user_id,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('entity_id')
    source_entity_id = source_entity[0].entity_id

    // Create two target entities
    const target_entity1 = await db('entities')
      .insert({
        title: 'Target Entity 1',
        description: 'A target entity for relation tests',
        type: 'task',
        user_id: test_user_id,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('entity_id')
    target_entity_id1 = target_entity1[0].entity_id

    const target_entity2 = await db('entities')
      .insert({
        title: 'Target Entity 2',
        description: 'Another target entity for relation tests',
        type: 'person',
        user_id: test_user_id,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('entity_id')
    target_entity_id2 = target_entity2[0].entity_id
  })

  afterEach(async () => {
    await reset_all_tables()
  })

  it('should write entity relations to the database', async () => {
    // Arrange
    const relations = {
      depends_on: [target_entity_id1],
      assigned_to: [target_entity_id2]
    }

    // Act
    await write_entity_relations_to_database({
      entity_id: source_entity_id,
      relations,
      user_id: test_user_id,
      db_client: db
    })

    // Assert
    const stored_relations = await db('entity_relations')
      .where({ source_entity_id })
      .orderBy('relation_type')

    expect(stored_relations).to.have.lengthOf(2)

    expect(stored_relations[0].relation_type).to.equal('assigned_to')
    expect(stored_relations[0].target_entity_id).to.equal(target_entity_id2)
    expect(stored_relations[0].source_entity_id).to.equal(source_entity_id)
    expect(stored_relations[0].created_at).to.exist

    expect(stored_relations[1].relation_type).to.equal('depends_on')
    expect(stored_relations[1].target_entity_id).to.equal(target_entity_id1)
    expect(stored_relations[1].source_entity_id).to.equal(source_entity_id)
    expect(stored_relations[1].created_at).to.exist
  })

  it('should delete existing relations when writing new ones', async () => {
    // Arrange - first write some relations
    const initial_relations = {
      depends_on: [target_entity_id1]
    }

    await write_entity_relations_to_database({
      entity_id: source_entity_id,
      relations: initial_relations,
      user_id: test_user_id,
      db_client: db
    })

    // Verify initial relations were written
    const initial_stored_relations = await db('entity_relations').where({
      source_entity_id
    })
    expect(initial_stored_relations).to.have.lengthOf(1)

    // Act - write new relations
    const new_relations = {
      assigned_to: [target_entity_id2]
    }

    await write_entity_relations_to_database({
      entity_id: source_entity_id,
      relations: new_relations,
      user_id: test_user_id,
      db_client: db
    })

    // Assert - verify old relations replaced with new ones
    const final_stored_relations = await db('entity_relations').where({
      source_entity_id
    })

    expect(final_stored_relations).to.have.lengthOf(1)
    expect(final_stored_relations[0].relation_type).to.equal('assigned_to')
    expect(final_stored_relations[0].target_entity_id).to.equal(
      target_entity_id2
    )
  })

  it('should handle multiple targets for same relation type', async () => {
    // Arrange
    const relations = {
      depends_on: [target_entity_id1, target_entity_id2]
    }

    // Act
    await write_entity_relations_to_database({
      entity_id: source_entity_id,
      relations,
      user_id: test_user_id,
      db_client: db
    })

    // Assert
    const stored_relations = await db('entity_relations')
      .where({
        source_entity_id,
        relation_type: 'depends_on'
      })
      .orderBy('target_entity_id')

    expect(stored_relations).to.have.lengthOf(2)
    expect(stored_relations[0].target_entity_id).to.equal(target_entity_id1)
    expect(stored_relations[1].target_entity_id).to.equal(target_entity_id2)
  })

  it('should handle empty relations object', async () => {
    // Arrange
    const relations = {}

    // Act
    await write_entity_relations_to_database({
      entity_id: source_entity_id,
      relations,
      user_id: test_user_id,
      db_client: db
    })

    // Assert
    const stored_relations = await db('entity_relations').where({
      source_entity_id
    })

    expect(stored_relations).to.have.lengthOf(0)
  })

  it('should handle empty target IDs array', async () => {
    // Arrange
    const relations = {
      depends_on: []
    }

    // Act
    await write_entity_relations_to_database({
      entity_id: source_entity_id,
      relations,
      user_id: test_user_id,
      db_client: db
    })

    // Assert
    const stored_relations = await db('entity_relations').where({
      source_entity_id
    })

    expect(stored_relations).to.have.lengthOf(0)
  })

  it('should work with a transaction', async () => {
    // Arrange
    const relations = {
      depends_on: [target_entity_id1],
      assigned_to: [target_entity_id2]
    }

    // Start a transaction
    const trx = await db.transaction()

    try {
      // Act
      await write_entity_relations_to_database({
        entity_id: source_entity_id,
        relations,
        user_id: test_user_id,
        db_client: trx
      })

      // Assert - within transaction
      const relations_in_trx = await trx('entity_relations').where({
        source_entity_id
      })
      expect(relations_in_trx).to.have.lengthOf(2)

      // Not visible in main DB yet
      const relations_in_db = await db('entity_relations').where({
        source_entity_id
      })
      expect(relations_in_db).to.have.lengthOf(0)

      // Commit the transaction
      await trx.commit()

      // Now should be visible in main DB
      const committed_relations = await db('entity_relations').where({
        source_entity_id
      })
      expect(committed_relations).to.have.lengthOf(2)
    } catch (error) {
      await trx.rollback()
      throw error
    }
  })
})
