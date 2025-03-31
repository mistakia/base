import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import config from '#config'
import { isMain, github, github_tasks, normalize_user_id } from '#libs-server'

const log = debug('import-github-project-issues')
debug.enable('import-github-project-issues,github-tasks,github')

// Import issues from a GitHub project
const import_github_project_issues = async ({
  username,
  project_number,
  github_token,
  user_id,
  bidirectional = false,
  state = 'all',
  sync_existing = false
}) => {
  try {
    // Convert user_id using the normalize helper
    user_id = normalize_user_id(user_id)

    log(`Importing issues from GitHub project: ${username}/${project_number}`)

    let all_issues = []
    const all_project_items_by_issue = {}
    let has_next_page = true
    let cursor = null
    let page_count = 0
    let project

    // Fetch all project items using pagination
    while (has_next_page) {
      page_count++
      log(
        `Fetching project issues page ${page_count}${cursor ? ` (cursor: ${cursor})` : ''}`
      )

      // Get project data with comprehensive issue information
      const project_data = await github.get_github_project({
        username,
        project_number,
        github_token,
        cursor
      })

      if (page_count === 1) {
        project = project_data.data.user.projectV2
      }

      if (!project_data.data?.user?.projectV2) {
        throw new Error(`Project ${username}/${project_number} not found`)
      }

      // Check if there are more pages
      has_next_page =
        project_data.data.user.projectV2.items.pageInfo.hasNextPage
      cursor = project_data.data.user.projectV2.items.pageInfo.endCursor

      // Extract and normalize issues from the GraphQL response
      const { issues, project_items_by_issue } =
        github.extract_issues_from_project_graphql(project_data)

      log(`Found ${issues.length} issues on page ${page_count}`)

      // Add to our collections
      all_issues = [...all_issues, ...issues]

      // Merge project_items_by_issue into all_project_items_by_issue
      for (const repo in project_items_by_issue) {
        if (!all_project_items_by_issue[repo]) {
          all_project_items_by_issue[repo] = {}
        }

        for (const issue_number in project_items_by_issue[repo]) {
          all_project_items_by_issue[repo][issue_number] =
            project_items_by_issue[repo][issue_number]
        }
      }
    }

    log(
      `Found a total of ${all_issues.length} issues in project across ${page_count} pages`
    )

    // Group issues by repository
    const issues_by_repo = github.group_issues_by_repo(all_issues)
    const repos = Object.keys(issues_by_repo)

    log(`Found issues from ${repos.length} repositories`)

    // Process issues by repository
    const results = {}
    const all_processed_issues = []
    let total_created = 0
    let total_updated = 0
    let total_skipped = 0
    let total_synced = 0
    let total_errors = 0

    for (const repo_name of repos) {
      const [owner, repo] = repo_name.split('/')
      const repo_issues = issues_by_repo[repo_name]
      const repo_info = { owner, repo, github_token }

      // Create project_items_map for this repository's issues
      const project_items_map = {}
      if (all_project_items_by_issue[repo_name]) {
        for (const issue_number in all_project_items_by_issue[repo_name]) {
          project_items_map[issue_number] =
            all_project_items_by_issue[repo_name][issue_number]
        }
      }

      // Process issues using github_tasks utility
      const repo_results = await github_tasks.process_github_issues({
        issues: repo_issues,
        repo_info,
        user_id,
        bidirectional,
        sync_existing,
        project_items_map
      })

      // Add to overall results
      results[repo_name] = repo_results

      // Add repo field to each processed issue
      const repo_processed_issues = repo_results.processed_issues.map(
        (issue) => ({
          ...issue,
          repo: repo_name
        })
      )

      all_processed_issues.push(...repo_processed_issues)

      // Update totals
      total_created += repo_results.created
      total_updated += repo_results.updated
      total_skipped += repo_results.skipped
      total_synced += repo_results.synced_to_github
      total_errors += repo_results.errors
    }

    const summary = {
      project: {
        username,
        project_number,
        id: project.id,
        item_count: all_issues.length,
        pages_fetched: page_count
      },
      results,
      totals: {
        created: total_created,
        updated: total_updated,
        skipped: total_skipped,
        synced_to_github: total_synced,
        errors: total_errors,
        processed: all_processed_issues.length
      },
      processed_issues: all_processed_issues
    }

    log(`Project import complete: ${JSON.stringify(summary.totals, null, 2)}`)

    return summary
  } catch (error) {
    log(`Error importing GitHub project issues: ${error.message}`)
    throw error
  }
}

export default import_github_project_issues

// Command-line interface
const main = async () => {
  try {
    const argv = yargs(hideBin(process.argv))
      .option('username', {
        alias: 'u',
        describe: 'GitHub username who owns the project',
        type: 'string',
        demandOption: true
      })
      .option('project', {
        alias: 'p',
        describe: 'GitHub project number',
        type: 'number',
        demandOption: true
      })
      .option('token', {
        alias: 't',
        describe: 'GitHub personal access token',
        type: 'string',
        default: config.github_access_token
      })
      .option('user-id', {
        describe: 'User ID to associate with imported tasks',
        type: 'string',
        default: config.github?.default_user_id
      })
      .option('bidirectional', {
        alias: 'b',
        describe:
          'Enable bidirectional sync (updates to tasks sync back to GitHub)',
        type: 'boolean',
        default: false
      })
      .option('state', {
        alias: 's',
        describe: 'Issue state to import (all, open, closed)',
        choices: ['all', 'open', 'closed'],
        default: 'all'
      })
      .option('sync', {
        describe: 'Force sync all issues even if they have not changed',
        type: 'boolean',
        default: false
      })
      .option('since', {
        alias: 'd',
        describe:
          'Only import issues updated since this date (ISO format, e.g. 2023-01-01T00:00:00Z)',
        type: 'string'
      })
      .help().argv

    const results = await import_github_project_issues({
      username: argv.username,
      project_number: argv.project,
      github_token: argv.token || process.env.GITHUB_TOKEN,
      user_id: argv.userId,
      bidirectional: argv.bidirectional,
      state: argv.state,
      sync_existing: argv.sync,
      since_date: argv.since
    })

    // Print concise result summary to console
    console.log('GitHub project issues import summary:')
    console.log(`- Project: ${argv.username}/${argv.project}`)
    console.log(`- Created: ${results.totals.created}`)
    console.log(`- Updated: ${results.totals.updated}`)
    console.log(`- Skipped: ${results.totals.skipped}`)
    console.log(`- Synced to GitHub: ${results.totals.synced_to_github}`)
    console.log(`- Errors: ${results.totals.errors}`)
    console.log(`- Repositories: ${Object.keys(results.results).length}`)

    process.exit(0)
  } catch (error) {
    console.error('Error importing GitHub project issues:', error.message)
    process.exit(1)
  }
}

if (isMain) {
  main()
}
