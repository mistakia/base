import debug from 'debug'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { write_entity_to_database } from '#libs-server/entity/database/write/write-entity-to-database.mjs'
import { with_transaction } from '#libs-server/utils/with-transaction.mjs'
import { get_file_git_sha } from '#libs-server/git/file-operations.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'

const log = debug('entity:database:import-from-git')

/**
 * Imports an entity from git into the database
 *
 * @param {Object} options - Function options
 * @param {string} options.base_relative_path - The path relative to the root base directory
 * @param {string} options.root_base_directory - The absolute path to the root base directory
 * @param {string} options.branch - The git branch to read from
 * @param {string} options.user_id - The user ID to associate with the entity
 * @param {boolean} [options.force_update=false] - Whether to force update even if git_sha matches
 * @returns {Promise<Object>} - Result object with entity_id and status information
 */
export async function import_entity_from_git({
  base_relative_path,
  root_base_directory,
  branch,
  user_id,
  force_update = false
}) {
  try {
    log(`Importing entity from git: ${base_relative_path} (branch: ${branch})`)

    // Validate required parameters
    if (!base_relative_path) {
      throw new Error('Base relative path is required')
    }

    if (!root_base_directory) {
      throw new Error('Root base directory is required')
    }

    if (!branch) {
      throw new Error('Branch name is required')
    }

    if (!user_id) {
      throw new Error('User ID is required')
    }

    // Get file information using get_base_file_info
    const file_info = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    const { repo_path, git_relative_path } = file_info

    // Step 1: Get the git SHA for the file
    const git_sha = await get_file_git_sha({
      repo_path,
      file_path: git_relative_path,
      branch
    })

    if (!git_sha) {
      return {
        success: false,
        error: `Failed to get git SHA for ${git_relative_path}`,
        base_relative_path,
        branch
      }
    }

    // Step 2: Read the entity from git
    const read_result = await read_entity_from_git({
      repo_path,
      file_path: git_relative_path,
      branch
    })

    if (!read_result.success) {
      return {
        success: false,
        error: read_result.error || 'Failed to read entity from git',
        base_relative_path,
        branch
      }
    }

    // Extract entity type and properties
    const { entity_properties, entity_content } = read_result
    const entity_type = entity_properties.type

    if (!entity_type) {
      return {
        success: false,
        error: `No entity type found in properties for ${git_relative_path}`,
        base_relative_path,
        branch
      }
    }

    // Create complete file info object for database storage
    const complete_file_info = {
      absolute_path: file_info.absolute_path,
      base_relative_path,
      git_sha
    }

    // Check if entity exists by file path before writing
    let result_entity_id
    let is_new = false

    // Use a transaction for the database operation
    await with_transaction(async (trx) => {
      // Check if entity exists with this file path
      const existing = await trx('entities')
        .where({
          absolute_path: complete_file_info.absolute_path,
          user_id
        })
        .first()

      // If entity exists and git SHA matches, skip update unless forced
      if (existing && existing.git_sha === git_sha && !force_update) {
        result_entity_id = existing.entity_id
        log(`Entity unchanged: ${git_relative_path} (SHA: ${git_sha})`)
      } else {
        // Write entity to database
        result_entity_id = await write_entity_to_database({
          entity_properties,
          entity_type,
          user_id,
          entity_content,
          entity_id: existing ? existing.entity_id : null,
          file_info: complete_file_info,
          trx
        })

        is_new = !existing
        log(`${is_new ? 'Created' : 'Updated'} entity: ${git_relative_path}`)
      }
    })

    return {
      success: true,
      entity_id: result_entity_id,
      entity_type,
      is_new,
      git_sha,
      git_relative_path,
      branch,
      base_relative_path
    }
  } catch (error) {
    log(`Error importing entity from git at ${base_relative_path}:`, error)
    return {
      success: false,
      error: error.message,
      base_relative_path,
      branch
    }
  }
}

export default import_entity_from_git
