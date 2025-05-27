import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import config from '#config'
import { isMain, github } from '#libs-server'

const log = debug('import-github-project-issues')

debug.enable('import-github-project-issues,github')

/**
 * Import issues from a GitHub project
 */
export default async function import_github_project_issues({
  username,
  project_number,
  github_token,
  user_id,
  user_base_directory = config.user_base_directory,
  force = false,
  // used to mock the get_github_project function for testing
  get_github_project = github.get_github_project
}) {
  try {
    log(`Importing issues from GitHub project: ${username}/${project_number}`)

    let all_issues = []
    const all_project_items_by_issue = {}
    let has_next_page = true
    let cursor = null
    let page_count = 0
    let project_id

    // Fetch all project items using pagination
    while (has_next_page) {
      page_count++
      log(
        `Fetching project issues page ${page_count}${cursor ? ` (cursor: ${cursor})` : ''}`
      )

      // Get project data with comprehensive issue information
      const project_data = await get_github_project({
        username,
        project_number,
        github_token,
        cursor
      })

      if (page_count === 1) {
        project_id = project_data.data.user.projectV2.id
      }

      if (!project_data.data?.user?.projectV2) {
        throw new Error(`Project ${username}/${project_number} not found`)
      }

      // Check if there are more pages
      has_next_page =
        project_data.data.user.projectV2.items.pageInfo.hasNextPage
      cursor = project_data.data.user.projectV2.items.pageInfo.endCursor

      // Extract issues from project data (with project items mapping)
      const { issues, project_items_by_issue } =
        github.extract_issues_from_project_graphql(project_data)

      // Add issues and project items from this page to the combined results
      all_issues = all_issues.concat(issues)

      // Merge project items by issue
      for (const github_repository_name in project_items_by_issue) {
        if (!all_project_items_by_issue[github_repository_name]) {
          all_project_items_by_issue[github_repository_name] = {}
        }

        for (const issue_number in project_items_by_issue[
          github_repository_name
        ]) {
          all_project_items_by_issue[github_repository_name][issue_number] =
            project_items_by_issue[github_repository_name][issue_number]
        }
      }
    }

    log(`Found ${all_issues.length} issues in project`)

    // Group issues by repository
    const issues_by_repo = github.group_issues_by_repo(all_issues)

    // For each repository, process its issues
    const results = {}
    const totals = {
      created: 0,
      updated: 0,
      skipped: 0,
      conflicts: 0,
      errors: 0
    }

    for (const [repo_full_name, repo_data] of Object.entries(issues_by_repo)) {
      log(`Processing ${repo_data.issues.length} issues for ${repo_full_name}`)

      // For each issue in the repo, find its project item
      const project_items_map = {}
      for (const issue of repo_data.issues) {
        if (
          all_project_items_by_issue[repo_full_name] &&
          all_project_items_by_issue[repo_full_name][issue.number]
        ) {
          project_items_map[issue.number] =
            all_project_items_by_issue[repo_full_name][issue.number]
        }
      }

      // Process issues for this repository
      const repo_results = await github.sync_github_issues({
        issues: repo_data.issues,
        github_repository_owner: repo_data.github_repository_owner,
        github_repository_name: repo_data.github_repository_name,
        user_id,
        user_base_directory,
        project_items_map,
        github_token,
        force
      })

      // Add results to overall totals
      totals.created += repo_results.created
      totals.updated += repo_results.updated
      totals.skipped += repo_results.skipped
      totals.conflicts += repo_results.conflicts
      totals.errors += repo_results.errors

      // Store detailed results for this repository
      results[repo_full_name] = {
        issues_count: repo_data.issues.length,
        created: repo_results.created,
        updated: repo_results.updated,
        skipped: repo_results.skipped,
        conflicts: repo_results.conflicts,
        errors: repo_results.errors,
        processed_issues: repo_results.processed_issues
      }
    }

    // Return combined results
    return {
      totals,
      project: {
        username,
        project_number,
        id: project_id,
        item_count: all_issues.length
      },
      results
    }
  } catch (error) {
    log(`Error importing GitHub project: ${error.message}`)
    console.error(error)
    throw error
  }
}

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
      .option('since', {
        alias: 'd',
        describe:
          'Only import issues updated since this date (ISO format, e.g. 2023-01-01T00:00:00Z)',
        type: 'string'
      })
      .option('force', {
        alias: 'f',
        describe: 'Force update all tasks regardless of content',
        type: 'boolean',
        default: false
      })
      .help().argv

    const results = await import_github_project_issues({
      username: argv.username,
      project_number: argv.project,
      github_token: config.github_access_token,
      user_id: config.user_id,
      user_base_directory: config.user_base_directory,
      force: argv.force
    })

    // Print concise result summary to console
    console.log('GitHub project issues import summary:')
    console.log(`- Project: ${argv.username}/${argv.project}`)
    console.log(`- Created: ${results.totals.created}`)
    console.log(`- Updated: ${results.totals.updated}`)
    console.log(`- Skipped: ${results.totals.skipped}`)
    console.log(`- Conflicts: ${results.totals.conflicts}`)
    console.log(`- Errors: ${results.totals.errors}`)
    console.log(`- Repositories: ${Object.keys(results.results).length}`)

    process.exit(0)
  } catch (error) {
    console.error('Error importing GitHub project issues:', error.message)
    process.exit(1)
  }
}

if (isMain(import.meta.url)) {
  debug.enable(
    'import-github-project-issues,sync-github-issues,normalize-github-issue,sync:*'
  )
  main()
}
