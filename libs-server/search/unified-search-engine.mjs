import debug from 'debug'

import { load_search_config } from './search-config.mjs'
import {
  search_file_contents,
  search_file_paths,
  check_ripgrep_availability
} from './ripgrep-file-search.mjs'
import { rank_results, check_fzf_availability } from './fzf-result-ranker.mjs'
import { search_threads } from './thread-metadata-search.mjs'

const log = debug('search:unified')

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
 * Categorize a file path result
 *
 * @param {string} file_path - File path
 * @returns {string} Category: 'entity', 'thread', or 'file'
 */
function categorize_result(file_path) {
  const normalized = normalize_path(file_path)

  if (normalized.startsWith('thread/')) {
    return 'thread'
  }

  // Entity files are markdown files in specific directories
  const entity_dirs = [
    'task/',
    'workflow/',
    'guideline/',
    'text/',
    'tag/',
    'person/',
    'physical-item/',
    'physical-location/'
  ]

  if (
    normalized.endsWith('.md') &&
    entity_dirs.some((dir) => normalized.startsWith(dir))
  ) {
    return 'entity'
  }

  return 'file'
}

/**
 * Search for files using paths mode (fast, for autocomplete)
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

  log(`Path search for: ${query}`)

  // Use ripgrep for path search
  const file_results = await search_file_paths({
    pattern: query,
    directory,
    max_results: limit * 2 // Get extra results for ranking
  })

  // Rank results using fzf
  const ranked_results = await rank_results({
    query,
    results: file_results,
    rank_field: 'file_path',
    limit
  })

  // Add categories to results and normalize paths
  return ranked_results.map((result) => ({
    ...result,
    file_path: normalize_path(result.file_path),
    category: categorize_result(result.file_path)
  }))
}

/**
 * Perform full content search across files and threads
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {string[]} [params.types=['files', 'threads', 'entities']] - Result types to include
 * @param {number} [params.limit=20] - Maximum results
 * @returns {Promise<Object>} Search results grouped by category
 */
export async function search_full({
  query,
  types = ['files', 'threads', 'entities'],
  limit = 20
}) {
  if (!query || !query.trim()) {
    return { files: [], threads: [], entities: [], total: 0 }
  }

  log(`Full search for: ${query}, types: ${types.join(',')}`)

  const search_config = await load_search_config()
  const results = {
    files: [],
    threads: [],
    entities: [],
    total: 0
  }

  // Calculate limits per category
  const type_count = types.length
  const per_type_limit = Math.ceil(limit / type_count)

  // Run searches in parallel
  const search_promises = []

  // File content search
  if (types.includes('files') || types.includes('entities')) {
    search_promises.push(
      search_file_contents({
        pattern: query,
        paths_only: true,
        max_results: per_type_limit * 2
      }).then((file_results) => {
        // Categorize results
        for (const result of file_results) {
          // Normalize file path
          result.file_path = normalize_path(result.file_path)
          const category = categorize_result(result.file_path)

          if (category === 'entity' && types.includes('entities')) {
            result.category = 'entity'
            result.type = 'entity'
            results.entities.push(result)
          } else if (category === 'file' && types.includes('files')) {
            result.category = 'file'
            result.type = 'file'
            results.files.push(result)
          }
        }
      })
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

  // Wait for all searches to complete
  await Promise.all(search_promises)

  // Rank results within each category
  const ranked_files = await rank_results({
    query,
    results: results.files,
    rank_field: 'file_path',
    limit: per_type_limit
  })

  const ranked_entities = await rank_results({
    query,
    results: results.entities,
    rank_field: 'file_path',
    limit: per_type_limit
  })

  results.files = ranked_files
  results.entities = ranked_entities
  results.threads = results.threads.slice(0, per_type_limit)

  // Calculate total
  results.total =
    results.files.length + results.threads.length + results.entities.length

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
  types = ['files', 'threads', 'entities'],
  limit = 20
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
    limit: effective_limit
  })

  return {
    mode: 'full',
    query,
    ...results
  }
}

/**
 * Get search engine capabilities
 *
 * @returns {Promise<Object>} Capabilities object
 */
export async function get_search_capabilities() {
  const [ripgrep_available, fzf_available] = await Promise.all([
    check_ripgrep_availability(),
    check_fzf_availability()
  ])

  return {
    ripgrep_available,
    fzf_available,
    supports_content_search: ripgrep_available,
    supports_fuzzy_ranking: fzf_available,
    supports_path_search: ripgrep_available,
    supports_thread_search: true
  }
}

export default {
  unified_search,
  search_paths,
  search_full,
  get_search_capabilities
}
