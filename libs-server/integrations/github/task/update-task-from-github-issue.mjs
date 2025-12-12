import debug from 'debug'

import { update_entity_from_external_item } from '#libs-server/sync/index.mjs'
import { sync_task_to_github_issue } from '../sync-task-to-github-issue.mjs'

const log = debug('github:task')

/**
 * Updates an existing task from GitHub issue changes with conflict resolution
 *
 * @param {Object} options - Function options
 * @param {Object} options.github_issue - The GitHub issue data
 * @param {Object} options.normalized_github_issue - The normalized GitHub issue data
 * @param {Object} options.github_repository_owner - The GitHub repository owner
 * @param {Object} options.github_repository_name - The GitHub repository name
 * @param {string} options.external_id - The external ID of the task
 * @param {string} options.absolute_path - Absolute path to the task file
 * @param {string} options.user_base_directory - Base directory for user data
 * @param {Object} [options.trx=null] - Optional database transaction
 * @param {string} [options.import_cid=null] - Optional import correlation ID
 * @param {string} [options.import_history_base_directory=null] - Optional base directory for import history
 * @param {string} options.github_token - GitHub token
 * @param {string} [options.github_project_number=null] - GitHub project number
 * @param {boolean} [options.force=false] - Force update even if content matches
 * @returns {Promise<Object>} - The update result with conflict information
 */
export async function update_task_from_github_issue({
  github_issue,
  normalized_github_issue,
  github_repository_owner,
  github_repository_name,
  external_id,
  absolute_path,
  user_base_directory,
  trx = null,
  import_cid = null,
  import_history_base_directory = null,
  github_token,
  github_project_number = null,
  force = false
}) {
  try {
    log(`Updating task from GitHub issue #${github_issue.number}`)

    if (!github_issue) {
      throw new Error('Missing required parameter: github_issue')
    }

    if (!github_repository_owner) {
      throw new Error('Missing required parameter: github_repository_owner')
    }

    if (!github_repository_name) {
      throw new Error('Missing required parameter: github_repository_name')
    }

    if (!user_base_directory) {
      throw new Error('Missing required parameter: user_base_directory')
    }

    if (!external_id) {
      throw new Error('Missing required parameter: external_id')
    }

    if (!absolute_path) {
      throw new Error('Missing required parameter: absolute_path')
    }

    // Use the external update time from the GitHub issue
    const external_update_time = github_issue.updated_at

    // Determine import source based on whether project_number is provided
    // This separates import history for issues vs project imports
    const import_source = github_project_number ? 'project' : 'issues'

    // Use the generalized entity update function
    const update_result = await update_entity_from_external_item({
      external_item: github_issue,
      entity_properties: normalized_github_issue,
      entity_type: 'task',
      external_system: 'github',
      external_id,
      absolute_path,
      external_update_time,
      import_cid,
      import_history_base_directory,
      import_source,
      trx,
      force
    })

    // Sync local changes back to GitHub if they don't conflict with external changes
    // CRITICAL: Don't sync status back if it was just updated from GitHub
    // This prevents feedback loops when project status changes trigger webhooks
    // CRITICAL: Never sync status back if the issue is closed - this prevents reopening closed issues
    if (update_result.sync_to_external) {
      const sync_updates = { ...update_result.sync_to_external }

      // If status was updated from GitHub (internal_updates has status),
      // don't sync it back immediately to prevent feedback loops
      if (update_result.internal_updates?.status && sync_updates.status) {
        log(
          `Status was just updated from GitHub (${update_result.internal_updates.status.to}), skipping sync back to prevent feedback loop`
        )
        delete sync_updates.status
      }

      // CRITICAL: Never sync status changes back if the issue is closed
      // This prevents reopening closed issues when project status differs from issue state
      if (github_issue.state === 'closed' && sync_updates.status) {
        log(
          `Issue #${github_issue.number} is closed, skipping status sync back to prevent reopening (would sync: ${sync_updates.status.to || sync_updates.status})`
        )
        delete sync_updates.status
      }

      if (Object.keys(sync_updates).length > 0) {
        log(
          `Syncing local changes back to GitHub issue #${github_issue.number}`
        )
        await sync_task_to_github_issue({
          github_issue_number: github_issue.number,
          github_repository_owner,
          github_repository_name,
          updates: sync_updates,
          github_token,
          github_project_number
        })
      } else {
        log(
          `No changes to sync back to GitHub issue #${github_issue.number} (all changes were from GitHub)`
        )
      }
    }

    return update_result
  } catch (error) {
    console.log(error)
    log(`Error updating task from GitHub issue: ${error.message}`)
    throw error
  }
}
