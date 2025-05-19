import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain, github } from '#libs-server'
import config from '#config'
const log = debug('import-github-issues')

// Main function to import issues from a GitHub repository
export default async function import_github_issues({
  github_repository_owner,
  github_repository_name,
  github_token,
  user_id,
  state = 'all',
  single_issue = null,
  start_page = 1,
  import_history_base_directory = null,
  // used to mock the get_github_repo_issues function for testing
  get_github_repo_issues = github.get_github_repo_issues
}) {
  try {
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      conflicts: 0,
      errors: 0
    }

    log(
      `Starting GitHub import for ${github_repository_owner}/${github_repository_name}`
    )

    if (single_issue) {
      // Process single issue directly
      log(`Processing single issue #${single_issue.number}`)

      const issue_result = await github.process_single_github_issue({
        issue: single_issue,
        github_repository_owner,
        github_repository_name,
        user_id,
        import_history_base_directory
      })

      results[issue_result.action]++

      if (issue_result.conflicts_found) {
        results.conflicts++
      }

      return results
    }

    // Fetch all issues
    let page = start_page
    let has_next_page = true
    let all_issues = []

    while (has_next_page) {
      try {
        log(
          `Fetching issues from ${github_repository_owner}/${github_repository_name} (page ${page}, state=${state})`
        )
        const {
          issues,
          has_next_page: more_pages,
          next_page
        } = await get_github_repo_issues({
          github_repository_owner,
          github_repository_name,
          github_token,
          state,
          page
        })

        log(`Fetched ${issues.length} issues (page ${page})`)

        all_issues = all_issues.concat(issues)
        has_next_page = more_pages
        page = next_page
      } catch (error) {
        log(`Error fetching issues: ${error.message}`)
        throw error
      }
    }

    log(`Processing ${all_issues.length} issues`)

    // Process issues using the new sync system
    const processed_results = await github.process_github_issues({
      issues: all_issues,
      github_repository_owner,
      github_repository_name,
      user_id,
      import_history_base_directory,
      github_token
    })

    Object.assign(results, processed_results)

    // Create summary of results
    const summary = {
      total_issues: all_issues.length,
      created: results.created,
      updated: results.updated,
      skipped: results.skipped,
      conflicts: results.conflicts,
      errors: results.errors
    }

    log(`Import complete: ${JSON.stringify(summary, null, 2)}`)

    return results
  } catch (error) {
    log(`Error in import_github_issues: ${error.message}`)
    console.error(error)
    throw error
  }
}

// Command-line interface
const main = async () => {
  let error

  try {
    const args = yargs(hideBin(process.argv))
      .option('owner', {
        alias: 'o',
        describe: 'GitHub repository owner',
        type: 'string',
        demandOption: true
      })
      .option('repo', {
        alias: 'r',
        describe: 'GitHub repository name',
        type: 'string',
        demandOption: true
      })
      .option('token', {
        alias: 't',
        describe: 'GitHub personal access token',
        type: 'string'
      })
      .option('user-id', {
        alias: 'u',
        describe: 'User ID to associate with imported tasks',
        type: 'string'
      })
      .option('state', {
        alias: 's',
        describe: 'GitHub issue state to import',
        choices: ['all', 'open', 'closed'],
        default: 'all'
      })
      .option('verbose', {
        alias: 'v',
        describe: 'Enable verbose logging',
        type: 'boolean',
        default: false
      })
      .help().argv

    const results = await import_github_issues({
      github_repository_owner: args.owner,
      github_repository_name: args.repo,
      github_token: args.token || config.github_access_token,
      user_id: args.userId,
      state: args.state,
      verbose: args.verbose
    })

    // Print concise result summary to console
    console.log('GitHub issues import summary:')
    console.log(`- Repository: ${args.owner}/${args.repo}`)
    console.log(`- Created: ${results.created}`)
    console.log(`- Updated: ${results.updated}`)
    console.log(`- Skipped: ${results.skipped}`)
    console.log(`- Conflicts: ${results.conflicts}`)
    console.log(`- Errors: ${results.errors}`)
  } catch (err) {
    error = err
    console.error('Error importing GitHub issues:', error)
  }

  process.exit(error ? 1 : 0)
}

if (isMain(import.meta.url)) {
  debug.enable('import-github-issues,github-sync,github-mapper,sync:*')
  main()
}
