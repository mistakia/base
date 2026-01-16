import express from 'express'
import debug from 'debug'

import {
  attach_permission_context,
  check_permissions_batch
} from '#server/middleware/permission/index.mjs'
import { apply_redaction_interceptor } from '#server/middleware/permissions.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'
import {
  unified_search,
  get_search_capabilities
} from '#libs-server/search/unified-search-engine.mjs'
import { load_search_config } from '#libs-server/search/search-config.mjs'

const router = express.Router()
const log = debug('api:search')

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

    // Include result if permission check passes or is not found (default allow)
    if (!permission || permission.read?.allowed !== false) {
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
 * GET /api/search/capabilities
 *
 * Get search engine capabilities (available tools, modes)
 */
router.get('/capabilities', async (req, res) => {
  try {
    const capabilities = await get_search_capabilities()
    const search_config = await load_search_config()

    res.json({
      ...capabilities,
      config: {
        default_limit: search_config.search?.default_limit || 20,
        max_limit: search_config.search?.max_limit || 100,
        debounce_ms: search_config.search?.debounce_ms || 300
      }
    })
  } catch (error) {
    log('Capabilities error:', error.message)

    res.status(500).json({
      error: 'Failed to get search capabilities',
      message: error.message
    })
  }
})

export default router
