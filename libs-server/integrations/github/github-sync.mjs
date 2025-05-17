import debug from 'debug'
import { update_github_issue } from './github-api.mjs'
import { find_entity_for_github_issue } from './task/index.mjs'
import { sync_github_issue_to_task } from './sync-github-issue-to-task.mjs'
import { format_external_id_for_github_issue } from './github-mapper.mjs'

const log = debug('github-sync')

/**
 * GitHub Issue Sync Module
 *
 * This module implements synchronization between GitHub issues and task entities.
 *
 * Architecture:
 * - Task entities are stored as markdown files on the filesystem
 * - These files are the source of truth for tasks
 * - GitHub issues are synchronized to these filesystem-based tasks
 * - The sync process:
 *   1. Normalizes GitHub issue data
 *   2. Checks if a corresponding task already exists
 *   3. Creates or updates the task file accordingly
 */

/**
 * Process GitHub issues for import
 *
 * @param {Object} options - Function options
 * @param {Array} options.issues - GitHub issues to process
 * @param {string} options.github_repository_owner - Repository owner
 * @param {string} options.github_repository_name - Repository name
 * @param {string} options.user_id - User ID
 * @param {string} options.user_base_directory - Base directory for user data
 * @param {Object} [options.project_items_map] - Project items map (optional)
 * @param {string} [options.import_history_base_directory] - Import history base directory (optional)
 * @param {string} [options.github_token] - GitHub token (optional)
 * @returns {Object} Import results
 */
export async function process_github_issues({
  issues,
  github_repository_owner,
  github_repository_name,
  user_id,
  user_base_directory,
  project_items_map,
  import_history_base_directory,
  github_token
}) {
  const import_results = {
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    errors: 0,
    processed_issues: []
  }

  for (const issue of issues) {
    try {
      // Skip pull requests
      if (issue.pull_request) {
        log(`Skipping PR #${issue.number}`)
        import_results.skipped++
        import_results.processed_issues.push({
          issue_number: issue.number,
          title: issue.title,
          action: 'skipped',
          reason: 'pull_request'
        })
        continue
      }

      // Get project item if available
      const project_item = project_items_map?.[issue.number]

      // Validate required parameters
      if (!github_repository_owner) {
        throw new Error('Missing repository owner')
      }

      if (!github_repository_name) {
        throw new Error('Missing repository name')
      }

      // Sync the GitHub issue to a task file directly
      const issue_result = await sync_github_issue_to_task({
        github_issue: issue,
        github_project_item: project_item,
        github_repository_owner,
        github_repository_name,
        user_base_directory,
        user_id,
        import_history_base_directory
      })

      // Update results
      import_results[issue_result.action]++
      import_results.processed_issues.push({
        issue_number: issue.number,
        title: issue.title,
        entity_id: issue_result.entity_id,
        action: issue_result.action,
        conflicts: issue_result.conflicts || []
      })

      if (issue_result.conflict) {
        import_results.conflicts++
      }
    } catch (error) {
      log(`Error processing issue #${issue.number}: ${error.message}`)
      log(error)
      import_results.errors++
      import_results.processed_issues.push({
        issue_number: issue.number,
        title: issue.title,
        action: 'error',
        error: error.message
      })
    }
  }

  return import_results
}

/**
 * Sync task back to GitHub
 *
 * @param {Object} options - Function options
 * @param {string} options.base_relative_path - Relative path to the task file
 * @param {string} options.github_repository_owner - Repository owner
 * @param {string} options.github_repository_name - Repository name
 * @param {Object} options.updates - Fields to update
 * @param {string} options.github_token - GitHub token
 * @returns {boolean} Success indicator
 */
export async function sync_task_back_to_github({
  base_relative_path,
  github_repository_owner,
  github_repository_name,
  updates,
  github_token
}) {
  try {
    const github_issue_number = Number(updates.github_issue_number)

    if (!github_issue_number) {
      log(`Task is missing GitHub issue number: ${base_relative_path}`)
      return false
    }

    const external_id = format_external_id_for_github_issue({
      github_repository_owner,
      github_repository_name,
      github_issue_number
    })

    // Read task from filesystem
    const task = await find_entity_for_github_issue({
      external_id,
      github_issue_number: parseInt(updates.github_issue_number || 0)
    })

    if (!task.success) {
      log(`Task not found for GitHub sync: ${base_relative_path}`)
      return false
    }

    // Prepare update data
    const github_update_data = prepare_github_update_data({ updates })

    // Skip update if no changes
    if (Object.keys(github_update_data).length === 0) {
      return false
    }

    // Update GitHub issue
    await update_github_issue({
      github_repository_owner,
      github_repository_name,
      github_issue_number,
      github_token,
      data: github_update_data
    })

    log(`Synced task to GitHub issue #${github_issue_number}`)
    return true
  } catch (error) {
    log(`Error syncing task to GitHub: ${error.message}`)
    return false
  }
}

/**
 * Prepare GitHub update data from task updates
 *
 * @param {Object} options - Function options
 * @param {Object} options.updates - Fields to update
 * @returns {Object} GitHub update data
 */
function prepare_github_update_data({ updates }) {
  const github_update_data = {}

  if ('title' in updates) {
    github_update_data.title = updates.title
  }

  if ('description' in updates) {
    github_update_data.body = updates.description
  }

  if ('status' in updates) {
    github_update_data.state =
      updates.status === 'Completed' ? 'closed' : 'open'
  }

  return github_update_data
}
