import debug from 'debug'
import { create_entity_from_external_item } from '#libs-server/entity/index.mjs'
import { format_entity_absolute_path_for_github_issue } from './format-task-path-for-github-issue.mjs'

const log = debug('github:task')

/**
 * Creates a new task in the filesystem from a GitHub issue and records sync info in the database
 *
 * @param {Object} options - Function options
 * @param {Object} options.github_issue - The GitHub issue data
 * @param {Object} options.normalized_github_issue - The normalized GitHub issue data
 * @param {string} options.github_repository_owner - Repository owner
 * @param {string} options.github_repository_name - Repository name
 * @param {string} options.user_base_directory - Base directory for user data
 * @param {string} options.user_public_key - The user public key creating the task
 * @param {string} options.external_id - External identifier for the issue
 * @param {string} options.import_cid - Content identifier for import
 * @param {string} [options.import_history_base_directory] - Base directory for import history
 * @param {string} [options.github_project_number] - GitHub project number (if importing from project)
 * @param {Object} [options.trx=null] - Optional database transaction
 * @returns {Promise<Object>} - The created task data with entity_id
 */
export async function create_task_from_github_issue({
  github_issue,
  normalized_github_issue,
  github_repository_owner,
  github_repository_name,
  user_base_directory,
  user_public_key,
  external_id,
  import_cid,
  import_history_base_directory = null,
  github_project_number = null,
  trx = null
}) {
  try {
    log(`Creating task from GitHub issue #${github_issue.number}`)

    if (!github_issue) {
      throw new Error('Missing github_issue parameter')
    }

    if (!github_repository_owner) {
      throw new Error('Missing github_repository_owner parameter')
    }

    if (!github_repository_name) {
      throw new Error('Missing github_repository_name parameter')
    }

    if (!user_base_directory) {
      throw new Error('Missing user_base_directory parameter')
    }

    if (!user_public_key) {
      throw new Error('Missing user_public_key parameter')
    }

    // Use normalized issue data from the github_issue object
    const task_entity_properties = normalized_github_issue

    if (!task_entity_properties) {
      throw new Error('Missing normalized GitHub issue data')
    }

    // Generate task filename
    const absolute_path = format_entity_absolute_path_for_github_issue({
      github_repository_owner,
      github_repository_name,
      github_issue_number: github_issue.number,
      user_base_directory,
      github_issue_title: github_issue.title
    })

    // Determine import source based on whether project_number is provided
    // This separates import history for issues vs project imports
    const import_source = github_project_number ? 'project' : 'issues'

    // Use the generic entity creation function
    const result = await create_entity_from_external_item({
      external_item: github_issue,
      entity_properties: normalized_github_issue,
      entity_type: 'task',
      external_system: 'github',
      external_id,
      absolute_path,
      user_public_key,
      import_cid,
      import_history_base_directory,
      import_source,
      trx
    })

    return result
  } catch (error) {
    log(`Error creating task from GitHub issue: ${error.message}`)
    throw error
  }
}
