import debug from 'debug'

import {
  write_entity_to_filesystem,
  read_entity_from_filesystem
} from '#libs-server/entity/filesystem/index.mjs'
import {
  detect_conflicts,
  determine_update_strategy,
  detect_field_changes,
  get_or_create_sync_record,
  update_sync_record,
  save_import_data,
  record_import_history,
  find_previous_import_files
} from '#libs-server/sync/index.mjs'
import { find_task_by_github_issue } from './find-task-by-github-issue.mjs'

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
 * @param {string} [options.task_path] - Optional absolute path to the task file
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
  task_path,
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

    if (!task_path) {
      throw new Error('Missing required parameter: task_path')
    }

    if (!user_base_directory) {
      throw new Error('Missing required parameter: user_base_directory')
    }

    if (!external_id) {
      throw new Error('Missing required parameter: external_id')
    }

    // Find the task if path not provided
    let task_file_path = task_path
    let entity_id

    if (!task_file_path) {
      const task = await find_task_by_github_issue({
        github_issue_number: github_issue.number,
        external_id,
        user_base_directory,
        trx
      })

      if (!task) {
        throw new Error(
          `Task not found for GitHub issue #${github_issue.number}`
        )
      }

      task_file_path = task.task_path
      entity_id = task.entity_id
    }

    // Read the existing task
    const task_result = await read_entity_from_filesystem({
      absolute_path: task_file_path
    })

    if (!task_result.success) {
      throw new Error(
        `Failed to read task file at ${task_file_path}: ${task_result.error}`
      )
    }

    if (!entity_id) {
      entity_id = task_result.entity_properties.entity_id
    }

    // Find previous import to detect changes if import history is enabled
    let detected_changes = null
    const previous_import = await find_previous_import_files({
      external_system: 'github',
      entity_id,
      import_history_base_directory
    })

    if (previous_import && previous_import.processed_data) {
      detected_changes = detect_field_changes({
        current_data: normalized_github_issue,
        previous_data: previous_import.processed_data
      })
    }

    // Save import data if changes detected or first import
    if (detected_changes || !previous_import) {
      await save_import_data({
        external_system: 'github',
        entity_id,
        raw_data: github_issue,
        processed_data: normalized_github_issue,
        import_history_base_directory
      })
    }

    // If no changes detected, skip update
    if (!detected_changes || Object.keys(detected_changes).length === 0) {
      log(
        `No changes detected for issue #${github_issue.number}, skipping update`
      )
      return {
        entity_id,
        task_path: task_file_path,
        updated: false,
        conflict: false,
        action: 'skipped'
      }
    }

    // const sync_record = await get_or_create_sync_record({
    //   entity_id,
    //   external_system: 'github',
    //   external_id,
    //   trx
    // })

    // await record_import_history({
    //   sync_id: sync_record.sync_id,
    //   raw_data: github_issue,
    //   import_cid,
    //   trx
    // })

    // Use our conflict detection utilities
    const conflict_result = await detect_conflicts({
      entity_id,
      entity_properties: task_result.entity_properties,
      external_system: 'github',
      external_update_time: github_issue.updated_at,
      external_data: normalized_github_issue,
      field_changes: detected_changes,
      trx
    })

    // Determine update strategy
    const update_strategy = determine_update_strategy({
      has_conflicts: conflict_result.has_conflicts,
      has_local_changes: conflict_result.has_local_changes,
      has_external_changes: conflict_result.has_external_changes,
      force_external: force_update
    })

    if (update_strategy === 'none') {
      // No changes to apply
      return {
        entity_id,
        task_path: task_file_path,
        updated: false,
        conflict: false,
        action: 'skipped'
      }
    }

    if (update_strategy === 'conflict' && !force_update) {
      // Return conflict information without updating
      return {
        entity_id,
        task_path: task_file_path,
        updated: false,
        conflict: true,
        github_update_time: conflict_result.external_update_time,
        local_update_time: conflict_result.local_update_time,
        detected_conflicts: conflict_result.detected_conflicts,
        action: 'conflict_detected'
      }
    }

    if (update_strategy === 'external' || force_update) {
      // Preserve entity_id and creation timestamp
      normalized_github_issue.entity_id = entity_id
      normalized_github_issue.created_at =
        task_result.entity_properties.created_at

      // Write updated task to filesystem
      await write_entity_to_filesystem({
        absolute_path: task_file_path,
        entity_properties: normalized_github_issue,
        entity_type: 'task',
        entity_content: normalized_github_issue.description || ''
      })

      // Update sync record
      await update_sync_record({
        entity_id,
        external_system: 'github',
        external_id,
        sync_data: {
          last_update_time: github_issue.updated_at
        },
        trx
      })

      log(`Successfully updated task for GitHub issue #${github_issue.number}`)

      return {
        entity_id,
        task_path: task_file_path,
        updated: true,
        conflict: update_strategy === 'conflict',
        force_applied: force_update && update_strategy === 'conflict',
        action: 'updated',
        detected_changes
      }
    }

    // If we get here, strategy is 'local' - no changes needed
    return {
      entity_id,
      task_path: task_file_path,
      updated: false,
      conflict: false,
      local_preserved: true,
      action: 'local_preserved'
    }
  } catch (error) {
    log(`Error updating task from GitHub issue: ${error.message}`)
    throw error
  }
}
