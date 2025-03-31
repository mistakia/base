import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain, github, github_tasks, normalize_user_id } from '#libs-server'

const log = debug('import-github-issues')
debug.enable('import-github-issues,github-tasks')

// Main function to import issues from a GitHub repository
const import_github_issues = async ({
  owner,
  repo,
  github_token,
  user_id,
  bidirectional = false,
  state = 'all',
  sync_existing = false,
  single_issue = null,
  verbose = false
}) => {
  if (!owner) {
    throw new Error('Missing required parameter: owner')
  }

  if (!repo) {
    throw new Error('Missing required parameter: repo')
  }

  if (!github_token) {
    throw new Error('Missing required parameter: github_token')
  }

  if (!user_id) {
    throw new Error('Missing required parameter: user_id')
  }

  if (verbose) {
    debug.enable('import-github-issues,github-tasks,*')
  }

  // Convert user_id using the normalize helper
  user_id = normalize_user_id(user_id)

  log(`Importing GitHub issues from ${owner}/${repo}`)

  const repo_info = { owner, repo, github_token }
  let page = 1
  let has_next_page = true
  let all_issues = []
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    synced_to_github: 0,
    errors: 0,
    processed_issues: []
  }

  // If we have a single issue (from webhook), process just that one
  if (single_issue) {
    log(`Processing single issue #${single_issue.number}`)
    all_issues = [single_issue]
  } else {
    // Fetch all issues
    while (has_next_page) {
      try {
        log(
          `Fetching issues from ${owner}/${repo} (page ${page}, state=${state})`
        )
        const {
          issues,
          has_next_page: more_pages,
          next_page
        } = await github.get_github_repo_issues({
          owner,
          repo,
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
  }

  log(`Processing ${all_issues.length} issues`)

  // Process issues using the github_tasks library
  const processed_results = await github_tasks.process_github_issues({
    issues: all_issues,
    repo_info,
    user_id,
    bidirectional,
    sync_existing
  })

  Object.assign(results, processed_results)

  // Create summary of results
  const summary = {
    total_issues: all_issues.length,
    created: results.created,
    updated: results.updated,
    skipped: results.skipped,
    synced_to_github: results.synced_to_github,
    errors: results.errors
  }

  log(`Import complete: ${JSON.stringify(summary, null, 2)}`)

  return results
}

export default import_github_issues

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
      .option('bidirectional', {
        alias: 'b',
        describe: 'Enable bidirectional sync',
        type: 'boolean',
        default: false
      })
      .option('state', {
        alias: 's',
        describe: 'GitHub issue state to import',
        choices: ['all', 'open', 'closed'],
        default: 'all'
      })
      .option('sync', {
        describe: 'Force sync all issues even if not changed',
        type: 'boolean',
        default: false
      })
      .option('verbose', {
        alias: 'v',
        describe: 'Enable verbose logging',
        type: 'boolean',
        default: false
      })
      .help().argv

    const results = await import_github_issues({
      owner: args.owner,
      repo: args.repo,
      github_token: args.token || process.env.GITHUB_TOKEN,
      user_id: args.userId,
      bidirectional: args.bidirectional,
      state: args.state,
      sync_existing: args.sync,
      verbose: args.verbose
    })

    // Print concise result summary to console
    console.log('GitHub issues import summary:')
    console.log(`- Repository: ${args.owner}/${args.repo}`)
    console.log(`- Created: ${results.created}`)
    console.log(`- Updated: ${results.updated}`)
    console.log(`- Skipped: ${results.skipped}`)
    console.log(`- Synced to GitHub: ${results.synced_to_github}`)
    console.log(`- Errors: ${results.errors}`)
  } catch (err) {
    error = err
    console.error('Error importing GitHub issues:', error)
  }

  process.exit(error ? 1 : 0)
}

if (isMain) {
  main()
}
