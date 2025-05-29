import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain, github } from '#libs-server'
import config from '#config'
const log = debug('import-github-issues')

/**
 * Fetches comments for issues that have comments
 * @param {Array} issues - List of GitHub issues
 * @param {string} github_repository_owner - Repository owner
 * @param {string} github_repository_name - Repository name
 * @param {string} github_token - GitHub API token
 * @param {Function} get_github_issue_comments - Function to get issue comments
 * @returns {Object} Map of issue numbers to their comments
 */
async function fetch_issue_comments({
  issues,
  github_repository_owner,
  github_repository_name,
  github_token,
  get_github_issue_comments = github.get_all_github_issue_comments
}) {
  const comments_map = {}

  log('Fetching comments for issues with comments_url')

  // Process issues in batches to avoid rate limiting
  const batch_size = 5
  for (let i = 0; i < issues.length; i += batch_size) {
    const batch = issues.slice(i, i + batch_size)

    await Promise.all(
      batch
        .filter((issue) => issue.comments > 0)
        .map(async (issue) => {
          try {
            log(`Fetching comments for issue #${issue.number}`)

            const comments = await get_github_issue_comments({
              github_repository_owner,
              github_repository_name,
              issue_number: issue.number,
              github_token
            })

            if (comments && comments.length > 0) {
              comments_map[issue.number] = comments
              log(
                `Fetched ${comments.length} comments for issue #${issue.number}`
              )
            }
          } catch (error) {
            log(
              `Error fetching comments for issue #${issue.number}: ${error.message}`
            )
          }
        })
    )
  }

  return comments_map
}

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
  force = false,
  // used to mock the get_github_repo_issues function for testing
  get_github_repo_issues = github.get_github_repo_issues,
  // used to mock the get_github_issue_comments function for testing
  get_github_issue_comments = github.get_all_github_issue_comments
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

      // Fetch comments if the issue has any
      let comments = []
      if (single_issue.comments > 0) {
        comments = await get_github_issue_comments({
          github_repository_owner,
          github_repository_name,
          issue_number: single_issue.number,
          github_token
        })

        // Transform comments to the desired format
        comments = comments.map((comment) => ({
          author: comment.user.login,
          date: comment.created_at,
          content: comment.body,
          url: comment.html_url,
          id: comment.id
        }))
      }

      const issue_result = await github.process_single_github_issue({
        issue: single_issue,
        github_repository_owner,
        github_repository_name,
        user_id,
        import_history_base_directory,
        github_token,
        force,
        comments
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

    // Fetch comments for issues that have them
    const comments_map = await fetch_issue_comments({
      issues: all_issues,
      github_repository_owner,
      github_repository_name,
      github_token,
      get_github_issue_comments
    })

    log(`Fetched comments for ${Object.keys(comments_map).length} issues`)

    // Process issues using the new sync system
    const processed_results = await github.sync_github_issues({
      issues: all_issues,
      github_repository_owner,
      github_repository_name,
      user_id,
      import_history_base_directory,
      github_token,
      force,
      comments_map
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
      .option('force', {
        alias: 'f',
        describe: 'Force update all tasks regardless of content',
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
      verbose: args.verbose,
      force: args.force
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
  debug.enable(
    'import-github-issues,sync-github-issues,normalize-github-issue,sync:*'
  )
  main()
}
