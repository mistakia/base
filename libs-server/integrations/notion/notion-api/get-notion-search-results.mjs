/**
 * Get paginated search results from Notion
 *
 * Provides enhanced search functionality with filtering and pagination
 */

import debug from 'debug'

import { get_notion_api_client } from './create-notion-client.mjs'

const log = debug('integrations:notion:search')

/**
 * Search for pages and databases in Notion with pagination support
 * @param {Object} options - Search options
 * @param {string} [options.query] - Search query string
 * @param {string} [options.filter_object_type] - Filter by object type ('page' or 'database')
 * @param {string} [options.sort_direction='descending'] - Sort direction ('ascending' or 'descending')
 * @param {string} [options.sort_timestamp='last_edited_time'] - Timestamp to sort by
 * @param {string} [options.start_cursor] - Pagination cursor
 * @param {number} [options.page_size=100] - Number of results per page
 * @param {string} [options.notion_token] - Notion API token
 * @param {number} [options.timeout_ms] - Request timeout in milliseconds
 * @param {Object} [options.retry_config] - Retry configuration
 * @returns {Promise<Object>} Search results with pagination info
 */
export async function get_notion_search_results({
  query,
  filter_object_type,
  sort_direction = 'descending',
  sort_timestamp = 'last_edited_time',
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

    // Build search parameters
    const search_params = {
      page_size,
      ...(start_cursor && { start_cursor }),
      ...(query && { query })
    }

    // Add filter if specified
    if (filter_object_type) {
      search_params.filter = {
        property: 'object',
        value: filter_object_type
      }
    }

    // Add sort if specified
    if (sort_direction && sort_timestamp) {
      search_params.sort = {
        direction: sort_direction,
        timestamp: sort_timestamp
      }
    }

    log(`Searching Notion with params: ${JSON.stringify(search_params)}`)

    // Execute search
    const response = await notion.search(search_params)

    log(
      `Found ${response.results.length} results, has_more: ${response.has_more}`
    )

    return {
      results: response.results,
      has_more: response.has_more,
      next_cursor: response.next_cursor,
      request_id: response.request_id
    }
  } catch (error) {
    log(`Error searching Notion: ${error.message}`)
    throw error
  }
}

/**
 * Get all search results across multiple pages
 * @param {Object} options - Search options (same as get_notion_search_results)
 * @returns {Promise<Array>} All search results
 */
export async function get_all_notion_search_results(options = {}) {
  const all_results = []
  let has_more = true
  let start_cursor = null

  while (has_more) {
    const response = await get_notion_search_results({
      ...options,
      start_cursor
    })

    all_results.push(...response.results)
    has_more = response.has_more
    start_cursor = response.next_cursor

    if (has_more) {
      log(
        `Fetched ${response.results.length} results, continuing with cursor: ${start_cursor}`
      )
    }
  }

  log(`Completed search, total results: ${all_results.length}`)
  return all_results
}
