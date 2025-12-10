import debug from 'debug'

import config from '#config'
import { sync_github_issue_to_task } from './sync-github-issue-to-task.mjs'

const log = debug('github:process-single-github-issue')

/**
 * Process a single GitHub issue from a webhook event or CLI import
 *
 * This is the main entry point called by the webhook handler and CLI to process
 * GitHub issue events. It bridges the webhook payload to the sync engine
 * by injecting configuration values.
 *
 * @param {Object} options - Function options
 * @param {Object} options.issue - The GitHub issue data from webhook payload
 * @param {string} options.github_repository_owner - Repository owner
 * @param {string} options.github_repository_name - Repository name
 * @param {string} options.github_token - GitHub API token for fetching additional data
 * @param {string} options.user_public_key - User public key for task ownership
 * @param {Object} [options.project_item] - GitHub project item data (optional)
 * @param {string} [options.import_history_base_directory] - Base directory for import history (optional)
 * @param {boolean} [options.force=false] - Force update regardless of content changes (optional)
 * @param {Array} [options.comments=[]] - GitHub issue comments (optional)
 * @returns {Promise<Object>} Result with action, entity_id, and conflicts_found
 */
export async function process_single_github_issue({
  issue,
  github_repository_owner,
  github_repository_name,
  github_token,
  user_public_key,
  project_item = null,
  import_history_base_directory = null,
  force = false,
  comments = []
}) {
  log(
    `Processing GitHub issue #${issue?.number} from ${github_repository_owner}/${github_repository_name}`
  )

  // Validate required parameters
  if (!issue) {
    throw new Error('Missing required parameter: issue')
  }

  if (!github_repository_owner) {
    throw new Error('Missing required parameter: github_repository_owner')
  }

  if (!github_repository_name) {
    throw new Error('Missing required parameter: github_repository_name')
  }

  if (!github_token) {
    throw new Error('Missing required parameter: github_token')
  }

  if (!user_public_key) {
    throw new Error('Missing required parameter: user_public_key')
  }

  // Get user_base_directory from config
  const user_base_directory = config.user_base_directory
  if (!user_base_directory) {
    throw new Error('Missing config: user_base_directory')
  }

  try {
    const sync_result = await sync_github_issue_to_task({
      github_issue: issue,
      github_project_item: project_item,
      github_repository_owner,
      github_repository_name,
      user_base_directory,
      user_public_key,
      github_token,
      import_history_base_directory,
      force,
      comments
    })

    log(
      `Issue #${issue.number} processed: action=${sync_result.action}, entity_id=${sync_result.entity_id}`
    )

    return {
      action: sync_result.action,
      entity_id: sync_result.entity_id,
      conflicts_found: sync_result.conflicts_found || false
    }
  } catch (error) {
    log(`Error processing issue #${issue.number}: ${error.message}`)
    throw error
  }
}
