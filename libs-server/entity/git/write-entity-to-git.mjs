import debug from 'debug'

import { write_file_to_git } from '#libs-server/git/git-files/write-file-to-git.mjs'
import { format_entity_properties_to_frontmatter } from '#libs-server/entity/format/index.mjs'
import { format_document_to_file_content } from '#libs-server/markdown/format-document-to-file-content.mjs'
import { get_git_info_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('write-entity-to-git')

/**
 * Writes an entity to Git as a markdown file with frontmatter
 *
 * @param {Object} options - Function options
 * @param {string} options.base_uri - URI identifying the entity (e.g., 'sys:entity/name.md', 'user:task/task.md')
 * @param {Object} options.entity_properties - The entity properties to write
 * @param {string} options.entity_type - The type of entity being written
 * @param {string} options.branch - The Git branch to write to
 * @param {string} [options.entity_content=''] - The markdown content to include after the frontmatter
 * @param {string} options.commit_message - Commit message to use when committing changes
 * @returns {Promise<Object>} - The result of the write operation
 */
export async function write_entity_to_git({
  base_uri,
  entity_properties,
  entity_type,
  branch,
  entity_content = '',
  commit_message
}) {
  try {
    log(
      `Writing ${entity_type} entity to Git at ${base_uri} in branch ${branch}`
    )

    // Validate required parameters
    if (!base_uri) {
      throw new Error('Base URI is required')
    }

    if (!entity_properties || typeof entity_properties !== 'object') {
      throw new Error('Entity properties must be a valid object')
    }

    if (!entity_type) {
      throw new Error('Entity type is required')
    }

    if (!branch) {
      throw new Error('Branch name is required')
    }

    if (!commit_message) {
      throw new Error('Commit message is required')
    }

    // Get git info using registry
    const { git_relative_path, repo_path } =
      get_git_info_from_registry(base_uri)

    // Prepare the frontmatter with base entity fields
    const frontmatter = format_entity_properties_to_frontmatter({
      entity_properties,
      entity_type
    })

    // Format the entire file content with frontmatter
    const formatted_content = format_document_to_file_content({
      document_properties: frontmatter,
      document_content: entity_content
    })

    // Write the formatted content to Git
    const result = await write_file_to_git({
      repo_path,
      git_relative_path,
      content: formatted_content,
      branch,
      commit_message
    })

    if (result.success) {
      log(
        `Successfully wrote ${entity_type} entity to ${base_uri} in branch ${branch}`
      )
    } else {
      log(`Failed to write ${entity_type} entity to ${base_uri}:`, result.error)
    }

    return result
  } catch (error) {
    log(`Error writing entity to Git at ${base_uri}:`, error)
    return {
      success: false,
      error: error.message,
      base_uri
    }
  }
}
