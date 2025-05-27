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

export default with_transaction
