import debug from 'debug'

import { process_repositories_from_git } from '#libs-server/markdown/repository/process-repository.mjs'
import {
  import_markdown_entity,
  remove_stale_entities
} from '#root/libs-server/markdown/entity-import/import-markdown-entity.mjs'

const log = debug('markdown:repository:import')

/**
 * Import markdown files from git repositories
 * @param {Object} options Configuration options
 * @param {String} user_id User ID
 * @returns {Object} Import statistics
 */
export async function import_repositories_from_git(options, user_id) {
  // Validate input parameters
  if (!options || typeof options !== 'object') {
    throw new Error('Options must be an object')
  }

  if (!user_id) {
    throw new Error('User ID must be provided')
  }

  const result = await process_repositories_from_git({
    ...options,
    process_file: async ({ formatted_markdown_entity, schemas }) => {
      // Check if entity processing was successful
      if (formatted_markdown_entity.valid) {
        // Import the processed entity to the database
        await import_markdown_entity(
          formatted_markdown_entity,
          formatted_markdown_entity.file_info,
          user_id,
          {
            force_update: options.force_update,
            schemas
          }
        )
        return true
      } else {
        log(
          `Validation failed for ${formatted_markdown_entity.file_info.git_relative_path}:`,
          formatted_markdown_entity.errors
        )
        return false
      }
    }
  })

  result.files.forEach((file) => {
    file.errors.forEach((error) => {
      console.log(error)
    })
  })

  // Archive entities that no longer exist if enabled
  const removed = await remove_stale_entities(
    result.files, // Pass all scanned files for cleanup
    user_id
  )

  return {
    imported: result.processed,
    skipped: result.skipped,
    errors: result.errors,
    removed
  }
}
