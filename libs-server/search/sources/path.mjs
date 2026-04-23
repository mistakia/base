// Fuzzy-match the user query against enumerated file paths.

import debug from 'debug'

import { get_file_paths } from '#libs-server/search/file-path-cache.mjs'
import { score_and_rank_results } from '#libs-server/search/fuzzy-scorer.mjs'

const log = debug('search:sources:path')

const SOURCE_NAME = 'path'

export async function search({
  query,
  candidate_limit = 100,
  directory = null
}) {
  if (!query || !query.trim()) return []

  let all_paths
  try {
    all_paths = await get_file_paths(directory ? { directory } : {})
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
