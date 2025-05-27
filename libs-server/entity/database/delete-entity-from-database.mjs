import db from '#db'
import debug from 'debug'
import {
  ENTITY_TYPE_TABLES,
  has_dedicated_table
} from '#libs-shared/entity-constants.mjs'

const log = debug('entity:database:delete')

/**
 * Deletes an entity from the database along with all related data
 *
 * @param {Object} params Entity deletion parameters
 * @param {string} params.entity_id Entity ID to delete
 * @param {string} params.user_id User ID for permission checking
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<boolean>} Success indicator
 */
export async function delete_entity_from_database({
  entity_id,
  user_id,
  trx = null
}) {
  try {
    // Validate required parameters
    if (!entity_id) {
      throw new Error('Entity ID is required')
    }

    if (!user_id) {
      throw new Error('User ID is required')
    }

    log(`Starting deletion of entity: ${entity_id} for user: ${user_id}`)

    // If no transaction was provided, wrap in a transaction
    if (!trx) {
      return db.transaction(async (transaction) => {
        return await perform_deletion(transaction)
      })
    }

    // If transaction was provided, use it directly
    return await perform_deletion(trx)
  } catch (error) {
    log(`Error deleting entity ${entity_id}: ${error.message}`)
    throw error
  }

  /**
   * Performs the actual entity deletion using the provided database client
   * @param {Object} client - The database client (transaction or db) to use
   * @returns {Promise<boolean>} - Success indicator
   */
  async function perform_deletion(client) {
    // 1. Verify entity exists and user has permission
    const entity = await client('entities')
      .where({ entity_id, user_id })
      .first()

    if (!entity) {
      log(
        `Entity not found or access denied: ${entity_id} for user: ${user_id}`
      )
      return false
    }

    // 2. Delete all related data
    await delete_entity_relationships({ client, entity_id })

    // 3. Delete type-specific data
    await delete_type_specific_data({
      client,
      entity_id,
      entity_type: entity.type
    })

    // 4. Delete the entity record itself
    log(`Deleting entity record: ${entity_id}`)
    await client('entities').where({ entity_id }).delete()

    log(`Successfully deleted entity: ${entity_id}`)
    return true
  }
}

/**
 * Deletes all relationship data for an entity
 *
 * @param {Object} client Database client to use
 * @param {string} entity_id Entity ID
 * @returns {Promise<void>}
 */
async function delete_entity_relationships({ client, entity_id }) {
  // Entity tags (both directions)
  log(`Deleting tags for entity: ${entity_id}`)
  await client('entity_tags').where({ entity_id }).delete()
  await client('entity_tags').where({ tag_entity_id: entity_id }).delete()

  // Entity relations (both directions)
  log(`Deleting relations for entity: ${entity_id}`)
  await client('entity_relations')
    .where({ source_entity_id: entity_id })
    .delete()
  await client('entity_relations')
    .where({ target_entity_id: entity_id })
    .delete()

  // Entity metadata
  log(`Deleting metadata for entity: ${entity_id}`)
  await client('entity_metadata').where({ entity_id }).delete()

  // Entity observations
  log(`Deleting observations for entity: ${entity_id}`)
  await client('entity_observations').where({ entity_id }).delete()

  // Entity blocks
  log(`Deleting blocks for entity: ${entity_id}`)
  await client('entity_blocks').where({ entity_id }).delete()

  // External syncs
  log(`Deleting external syncs for entity: ${entity_id}`)
  await client('entity_sync_records').where({ entity_id }).delete()
}

/**
 * Deletes type-specific data for an entity
 *
 * @param {Object} client Database client to use
 * @param {string} entity_id Entity ID
 * @param {string} entity_type Entity type
 * @returns {Promise<void>}
 */
async function delete_type_specific_data({ client, entity_id, entity_type }) {
  if (!entity_type) {
    log(`No entity type specified for entity: ${entity_id}`)
    return
  }

  log(
    `Deleting type-specific data for entity: ${entity_id}, type: ${entity_type}`
  )

  // Check if this entity type has a dedicated table
  if (has_dedicated_table(entity_type)) {
    const table_name = ENTITY_TYPE_TABLES[entity_type]
    log(`Deleting from ${table_name} for entity: ${entity_id}`)
    await client(table_name).where({ entity_id }).delete()
  } else {
    log(
      `Entity type ${entity_type} has no dedicated table, main record will be deleted`
    )
  }
}

export default delete_entity_from_database
