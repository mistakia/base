import db from '#db'
import debug from 'debug'

const log = debug('entity:database:exists')

/**
 * Checks if an entity exists in the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID to check
 * @param {string} [params.user_id=null] Optional user ID for permission checking
 * @param {boolean} [params.include_archived=false] Whether to include archived entities
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<boolean>} True if entity exists, false otherwise
 */
export async function entity_exists_in_database({
  entity_id,
  user_id = null,
  include_archived = false,
  trx = null
}) {
  try {
    if (!entity_id) {
      throw new Error('Entity ID is required')
    }

    log(`Checking if entity exists in database: ${entity_id}`)

    const db_client = trx || db

    // Build query
    let query = db_client('entities').where({ entity_id })

    // Add user_id filter if provided
    if (user_id) {
      query = query.where({ user_id })
    }

    // Exclude archived entities unless specified
    if (!include_archived) {
      query = query.whereNull('archived_at')
    }

    // Check if entity exists
    const entity = await query.first()
    const exists = Boolean(entity)

    log(`Entity ${entity_id} exists in database: ${exists}`)
    return exists
  } catch (error) {
    log(`Error checking if entity ${entity_id} exists in database:`, error)
    throw error
  }
}

export default entity_exists_in_database
