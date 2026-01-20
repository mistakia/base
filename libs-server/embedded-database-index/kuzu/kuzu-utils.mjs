/**
 * Kuzu Database Utilities
 *
 * Shared utility functions for Kuzu database operations.
 */

import debug from 'debug'

const log = debug('embedded-index:kuzu:utils')

/**
 * Execute a parameterized Kuzu query
 * Uses prepare + execute pattern required by Kuzu node library
 *
 * @param {Object} params Parameters
 * @param {Object} params.connection Kuzu database connection
 * @param {string} params.query Cypher query string with $param placeholders
 * @param {Object} params.params Parameter values
 * @returns {Promise<Object>} Query result
 */
export async function execute_parameterized_query({
  connection,
  query,
  params
}) {
  const prepared_statement = await connection.prepare(query)
  return await connection.execute(prepared_statement, params)
}
