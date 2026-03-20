import express from 'express'
import debug from 'debug'

import {
  attach_permission_context,
  check_permissions_batch
} from '#server/middleware/permission/index.mjs'
import { apply_redaction_interceptor } from '#server/middleware/permissions.mjs'
import { create_base_uri_from_path, resolve_base_uri, parse_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { unified_search } from '#libs-server/search/unified-search-engine.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { query_entities_from_duckdb } from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'
import { search_file_contents_with_context } from '#libs-server/search/ripgrep-file-search.mjs'
import { search_semantic } from '#libs-server/search/semantic-search-engine.mjs'
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

  // Collect all resource paths for batch permission checking
  // Use pre-computed base_uri when available (semantic search), otherwise derive from absolute_path
  const resource_paths = results
    .map((result) => {
      if (result.base_uri) {
        return result.base_uri
      }
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

    const resource_path =
      result.base_uri || create_base_uri_from_path(result.absolute_path)
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
    const entity_types_param = req.query.entity_types
    const tags_param = req.query.tags
    const exclude_param = req.query.exclude

    // Validate required query parameter
    if (!query || !query.trim()) {
      return res.status(400).json({
        error: 'Search query is required',
        param: 'q'
      })
    }

    // Validate mode
    const valid_modes = ['paths', 'full', 'content', 'semantic']
    if (!valid_modes.includes(mode)) {
      return res.status(400).json({
        error: `Invalid mode. Must be one of: ${valid_modes.join(', ')}`,
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

    // Parse comma-separated filter parameters
    const parse_csv_param = (value) =>
      value
        ? value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : null

    const entity_types = parse_csv_param(entity_types_param)
    const tags = parse_csv_param(tags_param)
    const exclude = parse_csv_param(exclude_param)

    // When entity_types includes 'thread', ensure threads are in result types
    if (
      entity_types &&
      entity_types.includes('thread') &&
      !types.includes('threads')
    ) {
      types.push('threads')
    }

    log(
      `Search request: q="${query}", mode=${mode}, types=${types.join(',')}, limit=${limit}`
    )

    // Get user public key for permission checking
    const user_public_key = req.user?.user_public_key || null

    // Entity type filter helper (shared across all modes)
    // For semantic results: filter by `type` field
    // For content/file results: filter by first path segment
    const apply_entity_types_filter = (results_list) => {
      if (!entity_types || entity_types.length === 0) return results_list
      const type_set = new Set(entity_types)
      return results_list.filter((item) => {
        // Semantic results have a `type` field
        if (item.type && type_set.has(item.type)) return true
        // File-based results: check first path segment
        const path = item.file_path || item.relative_path || ''
        const first_segment = path.replace(/^\.\//, '').split('/')[0]
        return type_set.has(first_segment)
      })
    }

    // Exclude filter helper (shared across all modes)
    const apply_exclude_filter = (results_list) => {
      if (!exclude || exclude.length === 0) return results_list
      const exclude_lower = exclude.map((t) => t.toLowerCase())
      return results_list.filter((item) => {
        const title = (item.title || '').toLowerCase()
        const path = (item.file_path || item.relative_path || '').toLowerCase()
        return !exclude_lower.some(
          (term) => title.includes(term) || path.includes(term)
        )
      })
    }

    // Content search mode
    if (mode === 'content') {
      const content_results = await search_file_contents_with_context({
        query,
        directory,
        max_results: limit
      })

      let filtered_content = await filter_results_by_permission(
        content_results.map((r) => ({ ...r, absolute_path: r.file_path })),
        user_public_key
      )
      filtered_content = apply_entity_types_filter(filtered_content)
      filtered_content = apply_exclude_filter(filtered_content)

      return res.json({
        content_results: filtered_content,
        total: filtered_content.length,
        mode: 'content'
      })
    }

    // Semantic search mode
    if (mode === 'semantic') {
      const { results: semantic_results, available } = await search_semantic({
        query,
        limit
      })

      let filtered_semantic = await filter_results_by_permission(
        semantic_results,
        user_public_key
      )
      filtered_semantic = apply_entity_types_filter(filtered_semantic)
      filtered_semantic = apply_exclude_filter(filtered_semantic)

      return res.json({
        semantic_results: filtered_semantic,
        total: filtered_semantic.length,
        available,
        mode: 'semantic'
      })
    }

    // In full mode, query entities from DuckDB directly instead of path-based scoring
    let duckdb_entity_results = null
    let unified_types = [...types]

    if (mode === 'full' && types.includes('entities')) {
      const duckdb_ready = embedded_index_manager.is_duckdb_ready()

      if (duckdb_ready) {
        // Build DuckDB filters for entity_types and tags
        const duckdb_filters = []
        if (entity_types && entity_types.length > 0) {
          const non_thread_types = entity_types.filter((t) => t !== 'thread')
          if (non_thread_types.length > 0) {
            duckdb_filters.push({
              column_id: 'type',
              operator: 'IN',
              value: non_thread_types
            })
          }
        }
        if (tags && tags.length > 0) {
          duckdb_filters.push({
            column_id: 'tags',
            operator: 'IN',
            value: tags
          })
        }

        const per_type_limit = Math.max(
          1,
          Math.ceil(limit / types.length)
        )

        try {
          const db_results = await query_entities_from_duckdb({
            filters: duckdb_filters,
            search: query,
            limit: per_type_limit
          })

          // Only use DuckDB results if we got matches; otherwise let unified_search handle entities
          if (db_results.length > 0) {
            // Shape results to match expected entity result format
            duckdb_entity_results = db_results.map((entity) => {
              const absolute_path = resolve_base_uri(entity.base_uri)
              const file_path = parse_base_uri(entity.base_uri).path
              return {
                file_path,
                absolute_path,
                base_uri: entity.base_uri,
                category: 'entity',
                type: 'entity',
                title: entity.title,
                description: entity.description
              }
            })

            // Remove entities from unified_search types since DuckDB handles them
            unified_types = unified_types.filter((t) => t !== 'entities')
          }
        } catch (err) {
          log('DuckDB entity search failed, falling back to path scoring: %s', err.message)
          // Fall through to unified_search with entities included
        }
      }
    }

    // Perform default search (paths or full mode)
    // Skip unified_search entirely when DuckDB handled all requested types
    const search_results = (mode === 'full' && unified_types.length === 0)
      ? { mode: 'full', query, files: [], threads: [], entities: [], directories: [], total: 0 }
      : await unified_search({
          query,
          mode,
          directory,
          types: unified_types,
          limit
        })

    // Merge DuckDB entity results if available
    if (duckdb_entity_results) {
      search_results.entities = duckdb_entity_results
    }

    const full_result_types = ['files', 'threads', 'entities', 'directories']

    // Filter results by permission and apply exclude filter
    if (mode === 'paths') {
      search_results.results = apply_exclude_filter(
        await filter_results_by_permission(
          search_results.results,
          user_public_key
        )
      )
      search_results.total = search_results.results.length
    } else {
      for (const type of full_result_types) {
        search_results[type] = apply_exclude_filter(
          await filter_results_by_permission(
            search_results[type],
            user_public_key
          )
        )
      }
      search_results.total = full_result_types.reduce(
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
