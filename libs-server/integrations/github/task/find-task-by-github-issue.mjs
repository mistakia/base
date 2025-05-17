import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/index.mjs'
import { get_sync_record } from '#libs-server/sync/database/index.mjs'
import { format_github_task_path } from '../github-constants.mjs'

const log = debug('github:task')

/**
 * Finds a task associated with a GitHub issue
 *
 * @param {Object} options - Function options
 * @param {string} options.external_id - The external ID of the task
 * @param {number} options.github_issue_number - The GitHub issue number
 * @param {string} options.user_base_directory - Base directory for user data
 * @param {Object} [options.trx=null] - Optional database transaction
 * @returns {Promise<Object|null>} - Task information or null if not found
 */
export async function find_task_by_github_issue({
  external_id,
  github_issue_number,
  user_base_directory,
  trx = null
}) {
  try {
    log(`Finding task for GitHub issue #${github_issue_number}`)

    if (!external_id) {
      throw new Error('Missing required parameter: external_id')
    }

    if (!github_issue_number) {
      throw new Error('Missing required parameter: github_issue_number')
    }

    if (!user_base_directory) {
      throw new Error('Missing required parameters')
    }

    // First try to find via sync records in database
    const sync_record = await get_sync_record({
      external_system: 'github',
      external_id,
      trx
    })

    if (sync_record) {
      const entity_id = sync_record.entity_id
      log(`Found sync record with entity_id: ${entity_id}`)

      // If user base directory is provided, try to find the corresponding file
      if (user_base_directory) {
        try {
          const github_task_directory = format_github_task_path({
            user_base_directory
          })
          const files = await fs.readdir(github_task_directory)

          // Look for files with the right entity_id
          for (const file of files) {
            if (!file.endsWith('.md')) continue

            const absolute_path = path.join(github_task_directory, file)

            try {
              const result = await read_entity_from_filesystem({
                absolute_path
              })

              if (
                result.success &&
                result.entity_properties.entity_id === entity_id
              ) {
                return {
                  entity_id,
                  task_path: absolute_path,
                  task_properties: result.entity_properties,
                  sync_data: sync_record.sync_data
                }
              }
            } catch (error) {
              // Skip files that can't be parsed
              continue
            }
          }
        } catch (error) {
          log(`Error scanning task directory: ${error.message}`)
        }
      }

      // Return minimal info if we couldn't find the file
      return { entity_id, sync_data: sync_record.sync_data }
    }

    // Fallback: Search by filename pattern
    if (user_base_directory) {
      try {
        const github_task_directory = format_github_task_path({
          user_base_directory
        })
        const files = await fs.readdir(github_task_directory)
        const potential_files = files.filter(
          (file) =>
            file.startsWith(`${github_issue_number}-`) && file.endsWith('.md')
        )

        if (potential_files.length > 0) {
          const file_path = path.join(github_task_directory, potential_files[0])
          const result = await read_entity_from_filesystem({
            absolute_path: file_path
          })

          if (result.success) {
            return {
              entity_id: result.entity_properties.entity_id,
              task_path: file_path,
              task_properties: result.entity_properties
            }
          }
        }
      } catch (error) {
        log(`Error in fallback search: ${error.message}`)
      }
    }

    log(`No task found for GitHub issue #${github_issue_number}`)
    return null
  } catch (error) {
    log(`Error finding task by GitHub issue: ${error.message}`)
    throw error
  }
}
