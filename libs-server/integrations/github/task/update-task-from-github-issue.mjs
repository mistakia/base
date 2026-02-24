import debug from 'debug'

import { update_entity_from_external_item } from '#libs-server/sync/index.mjs'

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
 * Updates an existing task from GitHub issue changes with conflict resolution.
 *
 * This is a one-way sync: GitHub -> local only. Changes to the external
 * source (GitHub) should be made directly via their APIs, then
 * an import triggered to sync the local state.
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

  return update_result
}
