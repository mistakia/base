// Fuzzy-match the user query against enumerated file paths.

import debug from 'debug'

import { get_file_paths } from '#libs-server/search/file-path-cache.mjs'
import { score_and_rank_results } from '#libs-server/search/fuzzy-scorer.mjs'
import { resolve_search_scope } from '#libs-server/search/resolve-search-scope.mjs'

const log = debug('search:sources:path')

const SOURCE_NAME = 'path'

export async function search({
  query,
  candidate_limit = 100,
  scope_uri = null
}) {
  if (!query || !query.trim()) return []

  let resolved_directory_path = null
  if (scope_uri) {
    try {
      ;({ resolved_path: resolved_directory_path } = resolve_search_scope({
        scope_uri
      }))
    } catch (error) {
      log('path source rejected scope %s: %s', scope_uri, error.message)
      return []
    }
  }

  let all_paths
  try {
    all_paths = await get_file_paths(
      resolved_directory_path ? { resolved_directory_path } : {}
    )
  } catch (error) {
    log('path source failed to enumerate paths: %s', error.message)
    return []
  }

  if (!Array.isArray(all_paths) || all_paths.length === 0) return []

  const ranked = score_and_rank_results({
    query,
    results: all_paths,
    rank_field: 'file_path',
    limit: candidate_limit
  })

  return ranked
    .filter(
      (result) => typeof result.file_path === 'string' && result.file_path
    )
    .map((result) => ({
      entity_uri: `user:${result.file_path}`,
      raw_score: result.score,
      matched_field: 'file_path',
      snippet: result.file_path,
      extras: {
        file_path: result.file_path,
        absolute_path: result.absolute_path
      },
      source: SOURCE_NAME
    }))
}

export default { search }
