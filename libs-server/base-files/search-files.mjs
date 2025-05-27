/**
 * File search service
 *
 * Provides functionality to search for content within files across repositories
 */
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { search_repository } from '#libs-server/git/index.mjs'
import { get_target_branch } from '#libs-server/base-files/branch-utils.mjs'
import is_main from '#libs-server/utils/is-main.mjs'
import config from '#config'

const log = debug('files:search')

/**
 * Search for content in files
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - The text to search for
 * @param {string} [params.repo_path] - Repository path to search in
 * @param {string} [params.path] - Optional path within repo to limit search
 * @param {boolean} [params.case_sensitive=false] - Whether search is case sensitive
 * @param {string} [params.branch_name] - Branch name to use (takes precedence over thread_id)
 * @param {string} [params.thread_id] - Optional thread ID to determine branch
 * @returns {Promise<Object>} Search results grouped by repository
 */
export async function search_files({
  query,
  repo_path,
  path,
  case_sensitive = false,
  branch_name,
  thread_id
}) {
  if (!query || query.trim() === '') {
    throw new Error('Search query cannot be empty')
  }

  log(
    `search_files: Searching for "${query}" in repo ${repo_path || 'all repos'}`
  )

  const { branch_name: target_branch_name } = await get_target_branch({
    branch_name,
    thread_id,
    repo_path
  })

  // Perform the search
  const results = await search_repository({
    repo_path,
    query,
    git_ref: target_branch_name,
    path,
    case_sensitive
  })

  return {
    repository: repo_path,
    branch: target_branch_name,
    query,
    results
  }
}

// Default export for convenient importing
export default {
  search_files
}

// Add CLI functionality if run directly
if (is_main(import.meta.url)) {
  const argv = yargs(hideBin(process.argv))
    .option('query', {
      alias: 'q',
      description: 'Text to search for',
      type: 'string',
      demandOption: true
    })
    .option('repo_path', {
      alias: 'r',
      description: 'Repository path to search in',
      type: 'string',
      default: config.system_base_directory
    })
    .option('path', {
      alias: 'p',
      description: 'Path within repo to limit search',
      type: 'string'
    })
    .option('case_sensitive', {
      alias: 'c',
      description: 'Whether search is case sensitive',
      type: 'boolean',
      default: false
    })
    .option('branch_name', {
      alias: 'b',
      description: 'Branch name to use (takes precedence over thread_id)',
      type: 'string'
    })
    .option('thread_id', {
      alias: 't',
      description: 'Thread ID to determine branch',
      type: 'string'
    })
    .help().argv

  const main = async () => {
    let error
    try {
      const results = await search_files({
        query: argv.query,
        repo_path: argv.repo_path,
        path: argv.path,
        case_sensitive: argv.case_sensitive,
        branch_name: argv.branch_name,
        thread_id: argv.thread_id
      })
      console.log('Search results:')
      console.log(JSON.stringify(results, null, 2))
    } catch (err) {
      error = err
      console.error('Error:', error.message)
    }
    process.exit(error ? 1 : 0)
  }

  main()
}
