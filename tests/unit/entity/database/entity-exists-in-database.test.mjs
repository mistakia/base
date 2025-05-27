import { expect } from 'chai'
import db from '#db'
import { v4 as uuid } from 'uuid'

import entity_exists_in_database from '#libs-server/entity/database/entity-exists-in-database.mjs'
import write_entity_to_database from '#libs-server/entity/database/write/write-entity-to-database.mjs'
import { create_test_user, reset_all_tables } from '#tests/utils/index.mjs'
import { ENTITY_TYPES } from '#libs-shared/entity-constants.mjs'

describe('entity_exists_in_database', () => {
  let test_user
  let test_user_id
  let entity_id
  let archived_entity_id

  before(async () => {
    // Reset database tables and create test user
    await reset_all_tables()
    test_user = await create_test_user()
    test_user_id = test_user.user_id

    // Create a test entity
    entity_id = await write_entity_to_database({
      entity_properties: {
        title: 'Test Entity for Existence Check',
        description: 'Entity to test existence check functionality',
        user_id: test_user_id,
        entity_id: uuid()
      },
      entity_type: ENTITY_TYPES.TASK,
      user_id: test_user_id
    })

    // Create an archived entity
    archived_entity_id = await write_entity_to_database({
      entity_properties: {
        title: 'Archived Entity',
        description: 'Archived entity for testing',
        user_id: test_user_id,
        archived_at: new Date(),
        entity_id: uuid()
      },
      entity_type: ENTITY_TYPES.TASK,
      user_id: test_user_id
    })
  })

  it('should return true when entity exists', async () => {
    const exists = await entity_exists_in_database({ entity_id })
    expect(exists).to.be.true
  })

  it('should return false when entity does not exist', async () => {
    const non_existent_id = uuid()
    const exists = await entity_exists_in_database({
      entity_id: non_existent_id
    })
    expect(exists).to.be.false
  })

  it('should exclude archived entities by default', async () => {
    const exists = await entity_exists_in_database({
      entity_id: archived_entity_id
    })
    expect(exists).to.be.false
  })

  it('should include archived entities when specified', async () => {
    const exists = await entity_exists_in_database({
      entity_id: archived_entity_id,
      include_archived: true
    })
    expect(exists).to.be.true
  })

  it('should check user ownership when user_id is provided', async () => {
    // Check with correct user_id
    const exists_with_correct_user = await entity_exists_in_database({
      entity_id,
      user_id: test_user_id
    })
    expect(exists_with_correct_user).to.be.true

    // Check with incorrect user_id
    const incorrect_user_id = uuid()
    const exists_with_incorrect_user = await entity_exists_in_database({
      entity_id,
      user_id: incorrect_user_id
    })
    expect(exists_with_incorrect_user).to.be.false
  })

  it('should throw an error when entity_id is not provided', async () => {
    try {
      await entity_exists_in_database({})
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Entity ID is required')
    }
  })

  it('should work with a transaction', async () => {
    // Start a transaction
    const trx = await db.transaction()

    try {
      // Create a new entity within the transaction
      const new_entity_id = await write_entity_to_database({
        entity_properties: {
          title: 'Transaction Entity',
          description: 'Entity created within a transaction',
          user_id: test_user_id,
          entity_id: uuid()
        },
        entity_type: ENTITY_TYPES.TASK,
        user_id: test_user_id,
        trx
      })

      // Check existence within the transaction
      const exists_in_trx = await entity_exists_in_database({
        entity_id: new_entity_id,
        trx
      })
      expect(exists_in_trx).to.be.true

      // Check existence in the main database (should be false as not committed)
      const exists_in_db = await entity_exists_in_database({
        entity_id: new_entity_id
      })
      expect(exists_in_db).to.be.false

      // Commit the transaction
      await trx.commit()

      // Now should exist in the main database
      const exists_after_commit = await entity_exists_in_database({
        entity_id: new_entity_id
      })
      expect(exists_after_commit).to.be.true
    } catch (error) {
      await trx.rollback()
      throw error
    }
  })
})
