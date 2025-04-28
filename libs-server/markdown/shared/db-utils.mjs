import debug from 'debug'
import postgres from '#db'

const log = debug('markdown:shared:db')

/**
 * Execute a callback within a database transaction
 * Handles commit and rollback automatically
 *
 * @param {Function} callback Function to execute within transaction
 * @returns {any} Result of the callback
 */
export async function with_transaction(callback) {
  const trx = await postgres.transaction()

  try {
    const result = await callback(trx)
    await trx.commit()
    return result
  } catch (error) {
    log('Transaction error, rolling back: %o', error)
    await trx.rollback()
    throw error
  }
}

/**
 * Find entity by ID
 *
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @returns {Object|null} Entity or null if not found
 */
export async function find_entity_by_id(trx, entity_id) {
  return await trx('entities').where({ entity_id }).first()
}

/**
 * Find entity by file path and user ID
 *
 * @param {Object} trx Database transaction
 * @param {String} file_path File path
 * @param {String} user_id User ID
 * @returns {Object|null} Entity or null if not found
 */
export async function find_entity_by_file_path(trx, file_path, user_id) {
  return await trx('entities')
    .where({
      file_path,
      user_id
    })
    .first()
}

export default {
  with_transaction,
  find_entity_by_id,
  find_entity_by_file_path
}
