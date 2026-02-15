import debug from 'debug'
import { sync_github_issue_to_task } from './sync-github-issue-to-task.mjs'

const log = debug('sync-github-issues')

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
 * @param {string} options.user_public_key - User public key
 * @param {string} options.user_base_directory - Base directory for user data
 * @param {Object} [options.project_items_map] - Project items map (optional)
 * @param {Object} [options.comments_map] - Map of issue numbers to comments (optional)
 * @param {string} [options.import_history_base_directory] - Import history base directory (optional)
 * @param {number} [options.github_project_number] - GitHub project number (optional)
 * @param {boolean} [options.force=false] - Force update all tasks regardless of content
 * @returns {Object} Import results
 */
export async function sync_github_issues({
  issues,
  github_repository_owner,
  github_repository_name,
  user_public_key,
  user_base_directory,
  project_items_map,
  comments_map = {},
  import_history_base_directory,
  github_project_number,
  force = false
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

      // Get comments if available
      const comments = comments_map?.[issue.number] || []

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
        user_public_key,
        import_history_base_directory,
        github_project_number,
        force,
        comments
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
