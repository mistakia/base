import debug from 'debug'

import { update_entity_from_external_item } from '#libs-server/sync/index.mjs'
import { sync_task_to_github_issue } from '../sync-task-to-github-issue.mjs'

const log = debug('github:task')

/**
 * Validates required parameters
 */
function validate_required_params({
  github_issue,
  github_repository_owner,
  github_repository_name,
  external_id,
  absolute_path,
  user_base_directory
}) {
  const required = {
    github_issue,
    github_repository_owner,
    github_repository_name,
    external_id,
    absolute_path,
    user_base_directory
  }

  for (const [name, value] of Object.entries(required)) {
    if (!value) {
      throw new Error(`Missing required parameter: ${name}`)
    }
  }
}

/**
 * Prepares sync updates by filtering out status when it shouldn't be synced back
 */
function prepare_sync_updates({
  sync_to_external,
  internal_updates,
  github_issue
}) {
  if (!sync_to_external) {
    return null
  }

  const sync_updates = { ...sync_to_external }
  const issue_state = github_issue.state?.toLowerCase()

  // Don't sync status back if it was just updated from GitHub (prevents feedback loops)
  if (internal_updates?.status && sync_updates.status) {
    log(
      `Status was just updated from GitHub (${internal_updates.status.to}), skipping sync back to prevent feedback loop`
    )
    delete sync_updates.status
  }

  // Never sync status back if issue is closed (prevents reopening closed issues)
  if (issue_state === 'closed' && sync_updates.status) {
    log(
      `Issue #${github_issue.number} is closed, skipping status sync back to prevent reopening (would sync: ${sync_updates.status.to || sync_updates.status})`
    )
    delete sync_updates.status
  }

  return Object.keys(sync_updates).length > 0 ? sync_updates : null
}

/**
 * Syncs local changes back to GitHub if needed
 */
async function sync_changes_to_github({
  sync_updates,
  github_issue,
  github_repository_owner,
  github_repository_name,
  github_token,
  github_project_number
}) {
  if (!sync_updates) {
    log(
      `No changes to sync back to GitHub issue #${github_issue.number} (all changes were from GitHub)`
    )
    return
  }

  log(`Syncing local changes back to GitHub issue #${github_issue.number}`)
  await sync_task_to_github_issue({
    github_issue_number: github_issue.number,
    github_repository_owner,
    github_repository_name,
    updates: sync_updates,
    github_token,
    github_project_number
  })
}

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
  log(`Updating task from GitHub issue #${github_issue.number}`)

  validate_required_params({
    github_issue,
    github_repository_owner,
    github_repository_name,
    external_id,
    absolute_path,
    user_base_directory
  })

  const import_source = github_project_number ? 'project' : 'issues'

  const update_result = await update_entity_from_external_item({
    external_item: github_issue,
    entity_properties: normalized_github_issue,
    entity_type: 'task',
    external_system: 'github',
    external_id,
    absolute_path,
    external_update_time: github_issue.updated_at,
    import_cid,
    import_history_base_directory,
    import_source,
    trx,
    force
  })

  const sync_updates = prepare_sync_updates({
    sync_to_external: update_result.sync_to_external,
    internal_updates: update_result.internal_updates,
    github_issue
  })

  await sync_changes_to_github({
    sync_updates,
    github_issue,
    github_repository_owner,
    github_repository_name,
    github_token,
    github_project_number
  })

  return update_result
}
