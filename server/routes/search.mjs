import express from 'express'
import debug from 'debug'

import {
  attach_permission_context,
  check_permissions_batch
} from '#server/middleware/permission/index.mjs'
import { apply_redaction_interceptor } from '#server/middleware/permissions.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { unified_search } from '#libs-server/search/unified-search-engine.mjs'
import {
  get_recent_entity_files,
  get_recent_files_config
} from '#libs-server/search/recent-files.mjs'
import { load_search_config } from '#libs-server/search/search-config.mjs'

const router = express.Router()
const log = debug('api:search')

/**
 * Parse and validate a positive integer query parameter
 *
 * @param {string} value - Query parameter value
 * @param {string} param_name - Parameter name for error messages
 * @returns {{ value: number|undefined, error: string|null }}
 */
function parse_positive_int_param(value, param_name) {
  if (!value) return { value: undefined, error: null }
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 1) {
    return {
      value: undefined,
      error: `${param_name} must be a positive integer`
    }
  }
  return { value: parsed, error: null }
}

// Apply permission middleware to all search routes
router.use(attach_permission_context())
router.use(apply_redaction_interceptor())

/**
 * Filter search results based on user permissions
 *
 * @param {Array<Object>} results - Search results to filter
 * @param {string|null} user_public_key - User's public key
 * @returns {Promise<Array<Object>>} Filtered results
 */
async function filter_results_by_permission(results, user_public_key) {
  if (!results || results.length === 0) {
    return []
  }

  // Collect all absolute paths for batch permission checking
  const resource_paths = results
    .map((result) => {
      if (result.absolute_path) {
        return create_base_uri_from_path(result.absolute_path)
      }
      return null
    })
    .filter(Boolean)

  if (resource_paths.length === 0) {
    return results
  }

  // Batch check permissions
  const permission_results = await check_permissions_batch({
    user_public_key,
    resource_paths
  })

  // Filter results based on permissions
  const filtered_results = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]

    if (!result.absolute_path) {
      // If no absolute path, include the result (may be external or special)
      filtered_results.push(result)
      continue
    }

    const resource_path = create_base_uri_from_path(result.absolute_path)
    const permission = permission_results[resource_path]

    // Include result only if permission explicitly allows read access
    if (permission?.read?.allowed === true) {
      filtered_results.push(result)
    }
  }

  return filtered_results
}

/**
 * GET /api/search
 *
 * Search across files, threads, and entities
 *
 * Query parameters:
 *   - q (required): Search query
 *   - mode: 'paths' (fast, filename search) or 'full' (content search, default)
 *   - directory: Directory scope for paths mode
 *   - types: Comma-separated list of result types (files, threads, entities)
 *   - limit: Maximum results (default 20, max 100)
 */
router.get('/', async (req, res) => {
  try {
    const query = req.query.q
    const mode = req.query.mode || 'full'
    const directory = req.query.directory || null
    const types_param = req.query.types
    const limit_param = req.query.limit

    // Validate required query parameter
    if (!query || !query.trim()) {
      return res.status(400).json({
        error: 'Search query is required',
        param: 'q'
      })
    }

    // Validate mode
    if (mode !== 'paths' && mode !== 'full') {
      return res.status(400).json({
        error: 'Invalid mode. Must be "paths" or "full"',
        param: 'mode'
      })
    }

    // Parse types
    let types = ['files', 'threads', 'entities', 'directories']
    if (types_param) {
      types = types_param
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const valid_types = ['files', 'threads', 'entities', 'directories']
      const invalid_types = types.filter((t) => !valid_types.includes(t))
      if (invalid_types.length > 0) {
        return res.status(400).json({
          error: `Invalid types: ${invalid_types.join(', ')}. Valid types: files, threads, entities, directories`,
          param: 'types'
        })
      }
    }

    // Parse and validate limit
    const search_config = await load_search_config()
    let limit = search_config.search?.default_limit || 20

    if (limit_param) {
      limit = parseInt(limit_param, 10)
      if (isNaN(limit) || limit < 1) {
        return res.status(400).json({
          error: 'Limit must be a positive integer',
          param: 'limit'
        })
      }
      limit = Math.min(limit, search_config.search?.max_limit || 100)
    }

    log(
      `Search request: q="${query}", mode=${mode}, types=${types.join(',')}, limit=${limit}`
    )

    // Get user public key for permission checking
    const user_public_key = req.user?.user_public_key || null

    // Perform search
    const search_results = await unified_search({
      query,
      mode,
      directory,
      types,
      limit
    })

    // Filter results by permission
    if (mode === 'paths') {
      search_results.results = await filter_results_by_permission(
        search_results.results,
        user_public_key
      )
      search_results.total = search_results.results.length
    } else {
      // Full mode - filter each category
      const result_types = ['files', 'threads', 'entities', 'directories']
      for (const type of result_types) {
        search_results[type] = await filter_results_by_permission(
          search_results[type],
          user_public_key
        )
      }
      search_results.total = result_types.reduce(
        (sum, type) => sum + search_results[type].length,
        0
      )
    }

    res.json(search_results)
  } catch (error) {
    log('Search error:', error.message)

    res.status(500).json({
      error: 'Search failed',
      message: error.message
    })
  }
})

/**
 * GET /api/search/recent
 *
 * Get recently modified entity files
 *
 * Query parameters:
 *   - hours: Time window in hours (default from config)
 *   - limit: Maximum results (default from config)
 */
router.get('/recent', async (req, res) => {
  try {
    const hours_result = parse_positive_int_param(req.query.hours, 'Hours')
    if (hours_result.error) {
      return res.status(400).json({ error: hours_result.error, param: 'hours' })
    }

    const limit_result = parse_positive_int_param(req.query.limit, 'Limit')
    if (limit_result.error) {
      return res.status(400).json({ error: limit_result.error, param: 'limit' })
    }

    const hours = hours_result.value
    const limit = limit_result.value

    log(
      `Recent files request: hours=${hours || 'default'}, limit=${limit || 'default'}`
    )

    // Get user public key for permission checking
    const user_public_key = req.user?.user_public_key || null

    // Get recent files from filesystem
    const recent_files = await get_recent_entity_files({ hours, limit })

    // Convert to results with base URIs for permission checking
    const results_with_uris = recent_files.map((file) => ({
      ...file,
      base_uri: create_base_uri_from_path(file.absolute_path),
      modified: file.mtime.toISOString()
    }))

    // Filter by permissions
    const filtered_results = await filter_results_by_permission(
      results_with_uris,
      user_public_key
    )

    // Get config for response
    const recent_config = await get_recent_files_config()

    res.json({
      results: filtered_results.map((file) => ({
        file_path: file.relative_path,
        base_uri: file.base_uri,
        modified: file.modified,
        entity_type: file.entity_type
      })),
      total: filtered_results.length,
      config: {
        hours: hours || recent_config.hours,
        limit: limit || recent_config.limit
      }
    })
  } catch (error) {
    log('Recent files error:', error.message)

    res.status(500).json({
      error: 'Failed to get recent files',
      message: error.message
    })
  }
})


export default router
