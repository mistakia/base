import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import debug from 'debug'
import front_matter from 'front-matter'

import { load_search_config } from './search-config.mjs'
import { search_file_contents } from './ripgrep-file-search.mjs'
import { score_and_rank_results } from './fuzzy-scorer.mjs'
import { search_directories } from './directory-search.mjs'
import { search_threads } from './thread-metadata-search.mjs'
import { get_file_paths } from './file-path-cache.mjs'
import {
  is_valid_base_uri,
  parse_base_uri
} from '#libs-server/base-uri/index.mjs'
import config from '#config'

const log = debug('search:unified')

/**
 * Resolve a directory parameter that may be a base URI to a relative filesystem path
 *
 * Handles both base URI format (e.g., 'user:', 'user:task/') and plain filesystem
 * paths (e.g., 'task/', 'repository/'). Returns a path suitable for ripgrep search.
 *
 * @param {string|null} directory - Directory to resolve (base URI or filesystem path)
 * @returns {string|null} Relative filesystem path or null
 */
function resolve_directory_parameter(directory) {
  if (!directory) {
    return null
  }

  // Check if the directory is a base URI (e.g., 'user:', 'user:task/')
  if (!is_valid_base_uri(directory)) {
    // Not a base URI, return as-is (assumed to be a relative filesystem path)
    return directory
  }

  log(`Resolving base URI directory parameter: ${directory}`)

  try {
    const parsed = parse_base_uri(directory)

    // Only user: URIs are supported for search (searching within user base directory)
    if (parsed.scheme === 'user') {
      // Return the path portion (empty string for 'user:', 'task/' for 'user:task/')
      // An empty string or null will cause ripgrep to search the entire user base
      const resolved_path = parsed.path || null
      log(`Resolved user: URI to path: ${resolved_path || '(root)'}`)
      return resolved_path
    }

    // sys: URIs would require different base directory - not currently supported for search
    if (parsed.scheme === 'sys') {
      log(`sys: URIs not supported for search, falling back to null`)
      return null
    }

    // Remote URIs (ssh://, git://, etc.) cannot be searched locally
    log(`Remote URI scheme '${parsed.scheme}' not supported for local search`)
    return null
  } catch (error) {
    log(`Failed to parse base URI '${directory}': ${error.message}`)
    // If parsing fails, return as-is and let downstream validation handle it
    return directory
  }
}

/**
 * Normalize file path by removing leading ./
 *
 * @param {string} file_path - File path
 * @returns {string} Normalized path
 */
function normalize_path(file_path) {
  if (file_path.startsWith('./')) {
    return file_path.slice(2)
  }
  return file_path
}

/**
 * Build entity directory prefixes from search config entity types
 *
 * @param {Object} search_config - Search configuration
 * @returns {string[]} Entity directory prefixes (e.g., ['task/', 'workflow/'])
 */
function get_entity_dirs(search_config) {
  const entity_types = search_config.result_types?.entities?.types || []
  return entity_types.map((entity_type) => `${entity_type}/`)
}

/**
 * Categorize a file path result
 *
 * @param {Object} params - Parameters
 * @param {string} params.file_path - File path
 * @param {string[]} params.entity_dirs - Entity directory prefixes
 * @param {string} [params.type] - Optional type hint from result
 * @returns {string} Category: 'entity', 'thread', 'directory', or 'file'
 */
function categorize_result({ file_path, entity_dirs = [], type = null }) {
  const normalized = normalize_path(file_path)

  // Check for directory type
  if (type === 'directory' || normalized.endsWith('/')) {
    return 'directory'
  }

  if (normalized.startsWith('thread/')) {
    return 'thread'
  }

  if (
    normalized.endsWith('.md') &&
    entity_dirs.some((dir) => normalized.startsWith(dir))
  ) {
    return 'entity'
  }

  return 'file'
}

/**
 * Search for files and directories using paths mode (fast, for autocomplete)
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {string} [params.directory] - Optional directory scope
 * @param {number} [params.limit=20] - Maximum results
 * @returns {Promise<Array<Object>>} Search results
 */
export async function search_paths({ query, directory = null, limit = 20 }) {
  if (!query || !query.trim()) {
    return []
  }

  // Resolve base URI directory parameter to filesystem path
  const resolved_directory = resolve_directory_parameter(directory)

  log(`Path search for: ${query}, directory: ${resolved_directory || '(all)'}`)

  const search_config = await load_search_config()
  const entity_dirs = get_entity_dirs(search_config)

  // Following VS Code's approach: collect all results first, then score and limit
  // VS Code uses DEFAULT_MAX_SEARCH_RESULTS = 20000 internally
  const file_results = await get_file_paths({
    directory: resolved_directory,
    max_results: 20000
  })

  // Extract directories from file paths (fast - no filesystem traversal)
  const directory_results = await search_directories({
    file_results,
    limit: 5000
  })

  // Combine results
  const all_results = [...file_results, ...directory_results]

  // Score and rank using native fuzzy scorer
  const ranked_results = score_and_rank_results({
    query,
    results: all_results,
    rank_field: 'file_path',
    limit
  })

  // Add categories to results and normalize paths
  return ranked_results.map((result) => ({
    ...result,
    file_path: normalize_path(result.file_path),
    category: categorize_result({
      file_path: result.file_path,
      entity_dirs,
      type: result.type
    })
  }))
}

/**
 * Add a result to the appropriate category with deduplication
 *
 * @param {Object} params - Parameters
 * @param {Object} params.result - Result to add
 * @param {string} params.category - Category for the result
 * @param {Object} params.results - Results object with category arrays
 * @param {Set<string>} params.seen_paths - Set of already-seen file paths
 * @param {string[]} params.types - Requested result types
 */
function add_categorized_result({
  result,
  category,
  results,
  seen_paths,
  types
}) {
  if (seen_paths.has(result.file_path)) {
    return
  }

  if (category === 'entity' && types.includes('entities')) {
    results.entities.push({ ...result, category: 'entity', type: 'entity' })
    seen_paths.add(result.file_path)
  } else if (category === 'file' && types.includes('files')) {
    results.files.push({ ...result, category: 'file', type: 'file' })
    seen_paths.add(result.file_path)
  }
}

/**
 * Perform full content search across files, threads, and directories
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {string[]} [params.types=['files', 'threads', 'entities', 'directories']] - Result types to include
 * @param {number} [params.limit=20] - Maximum results
 * @returns {Promise<Object>} Search results grouped by category
 */
export async function search_full({
  query,
  types = ['files', 'threads', 'entities', 'directories'],
  limit = 20,
  entity_types = null,
  tags = null
}) {
  if (!query || !query.trim()) {
    return { files: [], threads: [], entities: [], directories: [], total: 0 }
  }

  log(`Full search for: ${query}, types: ${types.join(',')}`)

  const search_config = await load_search_config()
  const entity_dirs = get_entity_dirs(search_config)
  const results = {
    files: [],
    threads: [],
    entities: [],
    directories: [],
    total: 0
  }

  // Use Set for O(1) deduplication instead of O(n) .some() checks
  const seen_paths = new Set()

  // Calculate limits per category (use ceil to maximize slot utilization)
  const type_count = types.length
  const per_type_limit = Math.max(1, Math.ceil(limit / type_count))

  // Get all file paths first (needed for both file search and directory extraction)
  const all_files =
    types.includes('files') ||
    types.includes('entities') ||
    types.includes('directories')
      ? await get_file_paths({ max_results: 20000 })
      : []

  // Run all searches in parallel to avoid race conditions on shared state
  const search_promises = []

  // File path search (fuzzy matching on paths - VS Code approach)
  if (types.includes('files') || types.includes('entities')) {
    search_promises.push(
      (async () => {
        // Score all file paths with fuzzy scorer
        const scored_files = score_and_rank_results({
          query,
          results: all_files,
          rank_field: 'file_path',
          limit: 500
        })

        // Categorize results from path search
        for (const result of scored_files) {
          const normalized_path = normalize_path(result.file_path)
          const category = categorize_result({
            file_path: normalized_path,
            entity_dirs,
            type: result.type
          })
          add_categorized_result({
            result: { ...result, file_path: normalized_path },
            category,
            results,
            seen_paths,
            types
          })
        }

        // Also search file contents for matches inside files
        const content_results = await search_file_contents({
          pattern: query,
          paths_only: true,
          max_results: 200
        })

        // Normalize paths and filter out already-seen
        const unseen_content = content_results
          .map((r) => ({ ...r, file_path: normalize_path(r.file_path) }))
          .filter((r) => !seen_paths.has(r.file_path))

        // Batch score all content matches at once (instead of N individual calls)
        if (unseen_content.length > 0) {
          const scored_content = score_and_rank_results({
            query,
            results: unseen_content,
            rank_field: 'file_path',
            limit: 200
          })

          for (const result of scored_content) {
            const category = categorize_result({
              file_path: result.file_path,
              entity_dirs,
              type: result.type
            })
            add_categorized_result({
              result: { ...result, match_source: 'content' },
              category,
              results,
              seen_paths,
              types
            })
          }
        }
      })()
    )
  }

  // Thread search
  if (types.includes('threads')) {
    search_promises.push(
      search_threads({
        query,
        max_results: per_type_limit,
        include_archived: true,
        search_timeline: search_config.result_types?.threads?.search_timeline
      }).then((thread_results) => {
        results.threads = thread_results.map((r) => ({
          ...r,
          category: 'thread'
        }))
      })
    )
  }

  // Directory search - extract from file paths (fast, no filesystem traversal)
  if (types.includes('directories')) {
    search_promises.push(
      (async () => {
        const dir_results = await search_directories({
          file_results: all_files,
          limit: 5000
        })
        results.directories = dir_results.map((r) => ({
          ...r,
          category: 'directory'
        }))
      })()
    )
  }

  // Wait for all searches to complete
  await Promise.all(search_promises)

  // Trim results to per-type limit (already scored/ranked by search functions above)
  results.files = results.files.slice(0, per_type_limit)
  results.entities = results.entities.slice(0, per_type_limit)
  results.directories = results.directories.slice(0, per_type_limit)
  results.threads = results.threads.slice(0, per_type_limit)

  // Apply entity_types filter (filter by first path segment = entity type)
  if (entity_types && entity_types.length > 0) {
    const type_set = new Set(entity_types.filter((t) => t !== 'thread'))
    if (type_set.size > 0) {
      results.entities = results.entities.filter((entity) => {
        const first_segment = (entity.file_path || '').split('/')[0]
        return type_set.has(first_segment)
      })
    }
  }

  // Apply tags filter (requires reading frontmatter)
  if (tags && tags.length > 0) {
    const user_base_dir =
      config.user_base_directory || process.env.USER_BASE_DIRECTORY
    const tag_checks = await Promise.all(
      results.entities.map(async (entity) => {
        try {
          const abs_path = join(user_base_dir, entity.file_path)
          const content = await readFile(abs_path, 'utf-8')
          const { attributes } = front_matter(content)
          const entity_tags = attributes.tags || []
          return tags.some((tag) => entity_tags.includes(tag))
        } catch {
          return false
        }
      })
    )
    results.entities = results.entities.filter((_, i) => tag_checks[i])
  }

  // Calculate total (may slightly exceed limit due to ceil-based per-type allocation)
  results.total =
    results.files.length +
    results.threads.length +
    results.entities.length +
    results.directories.length

  return results
}

/**
 * Unified search function supporting both paths and full modes
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {string} [params.mode='full'] - Search mode: 'paths' or 'full'
 * @param {string} [params.directory] - Directory scope (for paths mode)
 * @param {string[]} [params.types] - Result types to include (for full mode)
 * @param {number} [params.limit=20] - Maximum results
 * @returns {Promise<Object>} Search results
 */
export async function unified_search({
  query,
  mode = 'full',
  directory = null,
  types = ['files', 'threads', 'entities', 'directories'],
  limit = 20,
  entity_types = null,
  tags = null
}) {
  const search_config = await load_search_config()
  const effective_limit = Math.min(
    limit,
    search_config.search?.max_limit || 100
  )

  if (mode === 'paths') {
    const results = await search_paths({
      query,
      directory,
      limit: effective_limit
    })

    return {
      mode: 'paths',
      query,
      results,
      total: results.length
    }
  }

  // Full search mode
  const results = await search_full({
    query,
    types,
    limit: effective_limit,
    entity_types,
    tags
  })

  return {
    mode: 'full',
    query,
    ...results
  }
}

export default {
  unified_search,
  search_paths,
  search_full
}
