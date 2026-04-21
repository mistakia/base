/**
 * Path Source Adapter
 *
 * Fuzzy-matches the user query against all known file paths (via the cached
 * enumerator). Emits one hit per matching file path. The entity_uri is
 * derived from the relative path; non-entity files surface as sys or user
 * URIs according to their location.
 */

import debug from 'debug'

import { get_file_paths } from '#libs-server/search/file-path-cache.mjs'
import { score_and_rank_results } from '#libs-server/search/fuzzy-scorer.mjs'

const log = debug('search:sources:path')

const SOURCE_NAME = 'path'

function relative_path_to_user_uri(relative_path) {
  if (!relative_path) return null
  return `user:${relative_path}`
}

export async function search({ query, candidate_limit = 100 }) {
  if (!query || !query.trim()) return []

  let all_paths
  try {
    all_paths = await get_file_paths()
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

  return ranked.map((result) => ({
    entity_uri: relative_path_to_user_uri(result.file_path),
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
