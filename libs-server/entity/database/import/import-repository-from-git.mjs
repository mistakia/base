import debug from 'debug'

import { import_entity_from_git } from '#libs-server/entity/database/import-entity-from-git.mjs'
import { process_repositories_from_git } from '#libs-server/repository/git/process-git-repository.mjs'
import config from '#config'

const log = debug('entity:database:import:repository')

/**
 * Import all entities from git repositories into database
 *
 * @param {Object} options - Import options
 * @param {string} options.user_id - User ID to associate with imported entities
 * @param {boolean} [options.archive_missing=true] - Whether to archive entities that no longer exist
 * @param {string} [options.branch] - Branch for validation
 * @param {string} [options.root_base_directory] - Root base directory
 * @returns {Promise<Object>} - Import statistics
 */
export async function import_repository_from_git({
  user_id,
  archive_missing = true,
  branch,
  root_base_directory = config.root_base_directory
}) {
  // Validate input parameters
  if (!user_id) {
    throw new Error('User ID must be provided')
  }

  log(`Importing entities from git repositories at ${root_base_directory}`)

  try {
    // Process repositories using the common processing function
    const processing_result = await process_repositories_from_git({
      root_base_directory,
      branch,
      skip_schema_files: false,
      entity_processor: async ({ entity, file, repository, schemas }) => {
        try {
          // Skip processing if the file doesn't have a git_sha (which would be unusual)
          if (!file.file_info.git_sha) {
            file.errors.push('Missing git SHA, skipping')
            return false
          }

          // Import the entity to the database
          const import_result = await import_entity_from_git({
            base_relative_path: file.base_relative_path,
            root_base_directory,
            branch: file.file_info.branch,
            user_id
          })

          if (import_result.success) {
            log(
              `Imported entity: ${file.git_relative_path} with base_relative_path: ${import_result.base_relative_path}`
            )
            return true // Processed successfully
          } else {
            file.errors.push(`Import failed: ${import_result.error}`)
            return false // Skip counting as processed
          }
        } catch (error) {
          log(
            `Error importing file ${file.base_relative_path || file.file_info.git_relative_path}:`,
            error
          )
          file.errors.push(`Import error: ${error.message}`)
          return false
        }
      }
    })

    // Handle entities that no longer exist in repositories
    if (archive_missing && processing_result.files.length > 0) {
      // TODO: Implement entity cleanup for entities missing from git repositories
      // Since archived entities should still exist in the repo, entities missing from
      // the repository but existing in the database should probably be deleted rather
      // than archived. This would need to find entities in the database that aren't
      // found in the current_files list (files.map(f => f.absolute_path)).
      log(
        `Would handle ${processing_result.files.length} missing entities for user ${user_id}`
      )
    }

    return {
      imported: processing_result.processed,
      skipped: processing_result.skipped,
      errors: processing_result.errors,
      removed: 0, // Not implemented yet
      files: processing_result.files
    }
  } catch (error) {
    log('Error importing repositories:', error)
    throw error
  }
}

export default import_repository_from_git
