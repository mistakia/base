import debug from 'debug'
import db from '#db'
import {
  create_task_from_github_issue,
  update_task_from_github_issue,
  find_task_by_github_issue
} from './task/index.mjs'
import {
  normalize_github_issue,
  format_external_id_for_github_issue
} from './github-mapper.mjs'
import { create_content_identifier } from '../sync/sync-core.mjs'

const log = debug('github:sync-github-issue-to-task')

/**
 * Main entry point to sync GitHub issues to tasks
 * Handles transaction management and orchestrates the sync process
 *
 * @param {Object} options - Function options
 * @param {Object} options.github_issue - The GitHub issue data
 * @param {Object} options.github_project_item - The GitHub project item data
 * @param {string} options.github_repository_owner - Repository owner
 * @param {string} options.github_repository_name - Repository name
 * @param {string} options.user_base_directory - Base directory for user data
 * @param {string} options.user_id - User ID for task ownership
 * @param {boolean} [options.force_update=false] - Whether to force update regardless of conflicts
 * @param {string} [options.import_history_base_directory] - Base directory for import history
 * @returns {Promise<Object>} - The sync result
 */
export async function sync_github_issue_to_task({
  github_issue,
  github_project_item,
  github_repository_owner,
  github_repository_name,
  user_base_directory,
  user_id,
  force_update = false,
  import_history_base_directory = null
}) {
  let trx

  try {
    log(`Syncing GitHub issue #${github_issue.number} to task`)

    // Validate required parameters
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
    if (!user_id) {
      throw new Error('Missing required parameter: user_id')
    }

    // Start a transaction for database operations
    trx = await db.transaction()

    // Create external ID
    const external_id = format_external_id_for_github_issue({
      github_repository_owner,
      github_repository_name,
      github_issue_number: github_issue.number
    })

    // Normalize the GitHub issue data
    const normalized_github_issue = normalize_github_issue({
      issue: github_issue,
      external_id,
      github_repository_owner,
      github_repository_name,
      project_item: github_project_item,
      user_id
    })
    log('Using normalized GitHub issue format')

    // Calculate import content identifier
    const import_cid = await create_content_identifier(normalized_github_issue)

    // Find if the task already exists
    const existing_task = await find_task_by_github_issue({
      external_id,
      github_issue_number: github_issue.number,
      user_base_directory,
      trx
    })

    let result

    if (!existing_task) {
      // Create new task if it doesn't exist
      result = await create_task_from_github_issue({
        github_issue,
        normalized_github_issue,
        github_repository_owner,
        github_repository_name,
        user_base_directory,
        user_id,
        external_id,
        import_cid,
        import_history_base_directory,
        trx
      })

      await trx.commit()

      return {
        action: 'created',
        entity_id: result.entity_id,
        task_path: result.task_path,
        conflict: false
      }
    } else {
      // Update existing task
      result = await update_task_from_github_issue({
        github_issue,
        normalized_github_issue,
        github_repository_owner,
        github_repository_name,
        task_path: existing_task.task_path,
        user_base_directory,
        force_update,
        import_cid,
        import_history_base_directory,
        external_id,
        trx
      })

      await trx.commit()

      // Return appropriate result based on update outcome
      if (result.conflict && !force_update) {
        return {
          action: 'conflict_detected',
          entity_id: result.entity_id,
          task_path: result.task_path,
          conflict: true,
          github_update_time: result.github_update_time,
          local_update_time: result.local_update_time
        }
      }

      if (result.updated) {
        return {
          action: 'updated',
          entity_id: result.entity_id,
          task_path: result.task_path,
          conflict: result.conflict,
          force_applied: result.force_applied
        }
      } else {
        return {
          action: 'no_changes',
          entity_id: result.entity_id,
          task_path: result.task_path,
          conflict: false
        }
      }
    }
  } catch (error) {
    log(`Error syncing GitHub issue to task: ${error.message}`)

    // Rollback transaction if it exists
    if (trx) {
      await trx.rollback()
    }

    throw error
  }
}
