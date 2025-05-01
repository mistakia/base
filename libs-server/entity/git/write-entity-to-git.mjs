import debug from 'debug'

import { write_file_to_git } from '#libs-server/git/git-files/write-file-to-git.mjs'
import {
  format_entity_file_content,
  format_entity_frontmatter
} from '../format-entity-content.mjs'

const log = debug('write-entity-to-git')

/**
 * Writes an entity to Git as a markdown file with frontmatter
 *
 * @param {Object} options - Function options
 * @param {string} options.repo_path - The absolute path to the Git repository
 * @param {string} options.file_path - The relative path within the repository where the entity will be written
 * @param {Object} options.entity_data - The entity data to write
 * @param {string} options.entity_type - The type of entity being written
 * @param {string} options.branch - The Git branch to write to
 * @param {string} [options.content=''] - The markdown content to include after the frontmatter
 * @param {string} [options.commit_message] - Optional commit message to use when committing changes
 * @returns {Promise<Object>} - The result of the write operation
 */
export async function write_entity_to_git({
  repo_path,
  file_path,
  entity_data,
  entity_type,
  branch,
  content = '',
  commit_message
}) {
  try {
    log(
      `Writing ${entity_type} entity to Git at ${file_path} in branch ${branch}`
    )

    // Validate required parameters
    if (!repo_path) {
      throw new Error('Repository path is required')
    }

    if (!file_path) {
      throw new Error('File path is required')
    }

    if (!entity_data || typeof entity_data !== 'object') {
      throw new Error('Entity data must be a valid object')
    }

    if (!entity_type) {
      throw new Error('Entity type is required')
    }

    if (!branch) {
      throw new Error('Branch name is required')
    }

    // Prepare the frontmatter with base entity fields
    const frontmatter = format_entity_frontmatter({
      entity_data,
      entity_type
    })

    // Format the entire file content with frontmatter
    const formatted_content = format_entity_file_content({
      frontmatter,
      content
    })

    // Generate default commit message if not provided
    const default_commit_message =
      commit_message ||
      `Update ${entity_type}: ${entity_data.title || 'Untitled'}`

    // Write the formatted content to Git
    const result = await write_file_to_git({
      repo_path,
      file_path,
      content: formatted_content,
      branch,
      commit_message: default_commit_message
    })

    if (result.success) {
      log(
        `Successfully wrote ${entity_type} entity to ${file_path} in branch ${branch}`
      )
    } else {
      log(
        `Failed to write ${entity_type} entity to ${file_path}:`,
        result.error
      )
    }

    return result
  } catch (error) {
    log(`Error writing entity to Git at ${file_path}:`, error)
    return {
      success: false,
      error: error.message,
      file_path
    }
  }
}
