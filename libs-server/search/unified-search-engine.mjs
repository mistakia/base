import debug from 'debug'

import { load_search_config } from './search-config.mjs'
import {
  search_file_contents,
  search_all_file_paths,
  check_ripgrep_availability
} from './ripgrep-file-search.mjs'
import { score_and_rank_results } from './fuzzy-scorer.mjs'
import { search_directories } from './directory-search.mjs'
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
 * @param {Object} params - Parameters
 * @param {string} params.file_path - File path
 * @param {string} [params.type] - Optional type hint from result
 * @returns {string} Category: 'entity', 'thread', 'directory', or 'file'
 */
function categorize_result({ file_path, type = null }) {
  const normalized = normalize_path(file_path)

  // Check for directory type
  if (type === 'directory' || normalized.endsWith('/')) {
    return 'directory'
  }

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

  log(`Path search for: ${query}`)

  // Following VS Code's approach: collect all results first, then score and limit
  // VS Code uses DEFAULT_MAX_SEARCH_RESULTS = 20000 internally
  const file_results = await search_all_file_paths({
    directory,
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
    result.category = 'entity'
    result.type = 'entity'
    results.entities.push(result)
    seen_paths.add(result.file_path)
  } else if (category === 'file' && types.includes('files')) {
    result.category = 'file'
    result.type = 'file'
    results.files.push(result)
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
  limit = 20
}) {
  if (!query || !query.trim()) {
    return { files: [], threads: [], entities: [], directories: [], total: 0 }
  }

  log(`Full search for: ${query}, types: ${types.join(',')}`)

  const search_config = await load_search_config()
  const results = {
    files: [],
    threads: [],
    entities: [],
    directories: [],
    total: 0
  }

  // Use Set for O(1) deduplication instead of O(n) .some() checks
  const seen_paths = new Set()

  // Calculate limits per category (use floor to ensure total doesn't exceed limit)
  const type_count = types.length
  const per_type_limit = Math.max(1, Math.floor(limit / type_count))

  // Get all file paths first (needed for both file search and directory extraction)
  const all_files =
    types.includes('files') ||
    types.includes('entities') ||
    types.includes('directories')
      ? await search_all_file_paths({ max_results: 20000 })
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
          result.file_path = normalize_path(result.file_path)
          const category = categorize_result({
            file_path: result.file_path,
            type: result.type
          })
          add_categorized_result({
            result,
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

        for (const result of content_results) {
          result.file_path = normalize_path(result.file_path)
          const category = categorize_result({
            file_path: result.file_path,
            type: result.type
          })

          // Skip if already seen (O(1) check via Set)
          if (seen_paths.has(result.file_path)) {
            continue
          }

          // Score content match for ranking
          const scored = score_and_rank_results({
            query,
            results: [result],
            rank_field: 'file_path',
            limit: 1
          })
          result.score = scored[0]?.score || 0
          result.match_source = 'content'

          add_categorized_result({
            result,
            category,
            results,
            seen_paths,
            types
          })
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

  // Rank results within each category using native fuzzy scorer
  results.files = score_and_rank_results({
    query,
    results: results.files,
    rank_field: 'file_path',
    limit: per_type_limit
  })

  results.entities = score_and_rank_results({
    query,
    results: results.entities,
    rank_field: 'file_path',
    limit: per_type_limit
  })

  results.directories = score_and_rank_results({
    query,
    results: results.directories,
    rank_field: 'file_path',
    limit: per_type_limit
  })

  results.threads = results.threads.slice(0, per_type_limit)

  // Calculate total (guaranteed not to exceed limit due to floor calculation)
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
  const ripgrep_available = await check_ripgrep_availability()

  return {
    ripgrep_available,
    supports_content_search: ripgrep_available,
    supports_fuzzy_ranking: true, // Native fuzzy scorer always available
    supports_path_search: ripgrep_available,
    supports_directory_search: true,
    supports_thread_search: true
  }
}

export default {
  unified_search,
  search_paths,
  search_full,
  get_search_capabilities
}
