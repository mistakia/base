import express from 'express'
import debug from 'debug'

import { safe_error_message } from '#server/utils/error-response.mjs'
import {
  attach_permission_context,
  check_permissions_batch
} from '#server/middleware/permission/index.mjs'
import { apply_redaction_interceptor } from '#server/middleware/permissions.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { search as orchestrator_search } from '#libs-server/search/orchestrator.mjs'
import {
  get_recent_entity_files,
  get_recent_files_config
} from '#libs-server/search/recent-files.mjs'
import { load_search_config } from '#libs-server/search/search-config.mjs'
import { discover_external_search_sources } from '#libs-server/search/discover-external-sources.mjs'

const router = express.Router()
const log = debug('api:search')

const BUILTIN_SOURCES = [
  'entity',
  'thread_metadata',
  'thread_timeline',
  'path',
  'semantic'
]

async function get_valid_sources() {
  const external = await discover_external_search_sources()
  return [...BUILTIN_SOURCES, ...external.map((e) => e.name)]
}

router.use(attach_permission_context())
router.use(apply_redaction_interceptor())

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

function parse_non_negative_int_param(value, param_name) {
  if (!value) return { value: undefined, error: null }
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 0) {
    return {
      value: undefined,
      error: `${param_name} must be a non-negative integer`
    }
  }
  return { value: parsed, error: null }
}

function reject_repeated_param(res, param_name, raw_value) {
  if (!Array.isArray(raw_value)) return false
  res.status(400).json({
    error: `Parameter '${param_name}' must be a single CSV value, not repeated. Use '?${param_name}=a,b' instead of '?${param_name}=a&${param_name}=b'.`,
    param: param_name
  })
  return true
}

function parse_csv_list(value) {
  if (!value) return null
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * GET /api/search
 *
 * Unified source-first search over entities and threads.
 *
 * Query parameters:
 *   q       (required)  Search query.
 *   source              CSV of sources (entity, thread_metadata, thread_timeline, path, semantic).
 *                       Default is config.sources.enabled_by_default.
 *   type                CSV of entity types to filter on (task, workflow, thread, ...).
 *   tag                 CSV of tag base_uris.
 *   status              CSV of status values.
 *   path                Glob against entity_uri.
 *   directory           Filesystem path scoping applied to the `path` source
 *                       (absolute or relative to USER_BASE_DIRECTORY).
 *   limit               Positive integer, capped by search.max_limit.
 *   offset              Non-negative integer.
 *
 * All list params are CSV-only. Repeated-param form (?type=a&type=b) returns 400.
 * Response shape: { query, total, results[] } where total === results.length.
 */
router.get('/', async (req, res) => {
  try {
    const query = req.query.q

    if (!query || !query.trim()) {
      return res.status(400).json({
        error: 'Search query is required',
        param: 'q'
      })
    }

    for (const param of [
      'source',
      'type',
      'tag',
      'status',
      'path',
      'directory'
    ]) {
      if (reject_repeated_param(res, param, req.query[param])) return
    }

    const source_list = parse_csv_list(req.query.source)
    if (source_list) {
      const valid_sources = await get_valid_sources()
      const invalid = source_list.filter((s) => !valid_sources.includes(s))
      if (invalid.length > 0) {
        return res.status(400).json({
          error: `Invalid source values: ${invalid.join(', ')}. Valid: ${valid_sources.join(', ')}`,
          param: 'source'
        })
      }
    }

    const search_config = await load_search_config()
    const default_limit = search_config.search?.default_limit || 20
    const max_limit = search_config.search?.max_limit || 100

    const limit_result = parse_positive_int_param(req.query.limit, 'limit')
    if (limit_result.error) {
      return res.status(400).json({ error: limit_result.error, param: 'limit' })
    }
    const limit = Math.min(limit_result.value || default_limit, max_limit)

    const offset_result = parse_non_negative_int_param(
      req.query.offset,
      'offset'
    )
    if (offset_result.error) {
      return res
        .status(400)
        .json({ error: offset_result.error, param: 'offset' })
    }
    const offset = offset_result.value || 0

    const filters = {
      type: parse_csv_list(req.query.type),
      tag: parse_csv_list(req.query.tag),
      status: parse_csv_list(req.query.status),
      path: req.query.path || null
    }

    const user_public_key = req.user?.user_public_key || null

    log(
      'search q="%s" sources=%s type=%s limit=%d offset=%d',
      query,
      source_list ? source_list.join(',') : 'default',
      filters.type ? filters.type.join(',') : 'any',
      limit,
      offset
    )

    const directory = req.query.directory || null
    const source_options = directory ? { path: { directory } } : {}

    const response = await orchestrator_search({
      query,
      sources: source_list || undefined,
      filters,
      limit,
      offset,
      user_public_key,
      source_options
    })

    res.json(response)
  } catch (error) {
    log('search error: %s', error.message)
    res.status(500).json({
      error: 'Search failed',
      message: safe_error_message(error)
    })
  }
})

/**
 * GET /api/search/recent
 *
 * Recently modified entity files (unchanged from legacy route).
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
      'recent files hours=%s limit=%s',
      hours || 'default',
      limit || 'default'
    )

    const user_public_key = req.user?.user_public_key || null

    const recent_files = await get_recent_entity_files({ hours, limit })
    const results_with_uris = recent_files.map((file) => ({
      ...file,
      base_uri: create_base_uri_from_path(file.absolute_path),
      modified: file.mtime.toISOString()
    }))

    const resource_paths = results_with_uris.map((r) => r.base_uri)
    const permission_results = await check_permissions_batch({
      user_public_key,
      resource_paths
    })

    const filtered = results_with_uris.filter(
      (file) => permission_results[file.base_uri]?.read?.allowed === true
    )

    const recent_config = await get_recent_files_config()

    res.json({
      results: filtered.map((file) => ({
        file_path: file.relative_path,
        base_uri: file.base_uri,
        modified: file.modified,
        entity_type: file.entity_type
      })),
      ...(user_public_key ? { total: filtered.length } : {}),
      config: {
        hours: hours || recent_config.hours,
        limit: limit || recent_config.limit
      }
    })
  } catch (error) {
    log('recent files error: %s', error.message)
    res.status(500).json({
      error: 'Failed to get recent files',
      message: safe_error_message(error)
    })
  }
})

export default router
