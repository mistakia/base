import debug from 'debug'

import { update_entity_from_external_item } from '#libs-server/sync/index.mjs'

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
 * @param {boolean} [options.force_update=false] - Whether to force update regardless of conflicts
 * @param {Object} [options.trx=null] - Optional database transaction
 * @param {string} [options.import_cid=null] - Optional import correlation ID
 * @param {string} [options.import_history_base_directory=null] - Optional base directory for import history
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
  force_update = false,
  trx = null,
  import_cid = null,
  import_history_base_directory = null
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

    // Use the generalized entity update function
    return await update_entity_from_external_item({
      external_item: github_issue,
      entity_properties: normalized_github_issue,
      entity_type: 'task',
      external_system: 'github',
      external_id,
      absolute_path,
      external_update_time,
      import_cid,
      import_history_base_directory,
      force_update,
      trx
    })
  } catch (error) {
    log(`Error updating task from GitHub issue: ${error.message}`)
    throw error
  }
}
