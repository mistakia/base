/**
 * Get databases accessible by the Notion integration
 *
 * Provides functionality to list and filter databases
 */

import debug from 'debug'

import { get_notion_api_client } from './create-notion-client.mjs'

const log = debug('integrations:notion:databases')

/**
 * List all databases accessible by the integration
 * @param {Object} options - Options for listing databases
 * @param {string} [options.start_cursor] - Pagination cursor
 * @param {number} [options.page_size=100] - Number of results per page
 * @param {string} [options.notion_token] - Notion API token
 * @param {number} [options.timeout_ms] - Request timeout in milliseconds
 * @param {Object} [options.retry_config] - Retry configuration
 * @returns {Promise<Object>} Database list with pagination info
 */
export async function get_notion_databases({
  start_cursor,
  page_size = 100,
  notion_token,
  timeout_ms,
  retry_config
} = {}) {
  try {
    const notion = get_notion_api_client({
      notion_token,
      timeout_ms,
      retry_config
    })

    const query_params = {
      page_size,
      ...(start_cursor && { start_cursor })
    }

    log(`Listing databases with params: ${JSON.stringify(query_params)}`)

    // Use the search API with database filter to get databases
    const response = await notion.search({
      ...query_params,
      filter: {
        property: 'object',
        value: 'database'
      },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time'
      }
    })

    log(
      `Found ${response.results.length} databases, has_more: ${response.has_more}`
    )

    return {
      results: response.results,
      has_more: response.has_more,
      next_cursor: response.next_cursor,
      request_id: response.request_id
    }
  } catch (error) {
    log(`Error listing databases: ${error.message}`)
    throw error
  }
}

/**
 * Get all databases across multiple pages
 * @param {Object} options - Options (same as get_notion_databases)
 * @returns {Promise<Array>} All databases
 */
export async function get_all_notion_databases(options = {}) {
  const all_databases = []
  let has_more = true
  let start_cursor = null

  while (has_more) {
    const response = await get_notion_databases({
      ...options,
      start_cursor
    })

    all_databases.push(...response.results)
    has_more = response.has_more
    start_cursor = response.next_cursor

    if (has_more) {
      log(
        `Fetched ${response.results.length} databases, continuing with cursor: ${start_cursor}`
      )
    }
  }

  log(`Completed database listing, total: ${all_databases.length}`)
  return all_databases
}

/**
 * Get database items with pagination
 * @param {Object} options - Query options
 * @param {string} options.database_id - Database ID to query
 * @param {Object} [options.filter] - Query filter
 * @param {Array} [options.sorts] - Sort criteria
 * @param {string} [options.start_cursor] - Pagination cursor
 * @param {number} [options.page_size=100] - Number of results per page
 * @param {string} [options.notion_token] - Notion API token
 * @param {number} [options.timeout_ms] - Request timeout in milliseconds
 * @param {Object} [options.retry_config] - Retry configuration
 * @returns {Promise<Object>} Database items with pagination info
 */
export async function get_notion_database_items({
  database_id,
  filter,
  sorts,
  start_cursor,
  page_size = 100,
  notion_token,
  timeout_ms,
  retry_config
} = {}) {
  try {
    const notion = get_notion_api_client({
      notion_token,
      timeout_ms,
      retry_config
    })

    const query_params = {
      page_size,
      ...(start_cursor && { start_cursor }),
      ...(filter && { filter }),
      ...(sorts && { sorts })
    }

    log(
      `Querying database ${database_id} with params: ${JSON.stringify(query_params)}`
    )

    const response = await notion.databases.query({
      database_id,
      ...query_params
    })

    log(
      `Found ${response.results.length} items, has_more: ${response.has_more}`
    )

    return {
      results: response.results,
      has_more: response.has_more,
      next_cursor: response.next_cursor,
      request_id: response.request_id
    }
  } catch (error) {
    log(`Error querying database ${database_id}: ${error.message}`)
    throw error
  }
}

/**
 * Get all items from a database across multiple pages
 * @param {Object} options - Query options (same as get_notion_database_items)
 * @returns {Promise<Array>} All database items
 */
export async function get_all_notion_database_items(options = {}) {
  const all_items = []
  let has_more = true
  let start_cursor = null

  while (has_more) {
    const response = await get_notion_database_items({
      ...options,
      start_cursor
    })

    all_items.push(...response.results)
    has_more = response.has_more
    start_cursor = response.next_cursor

    if (has_more) {
      log(
        `Fetched ${response.results.length} items, continuing with cursor: ${start_cursor}`
      )
    }
  }

  log(`Completed database query, total items: ${all_items.length}`)
  return all_items
}
