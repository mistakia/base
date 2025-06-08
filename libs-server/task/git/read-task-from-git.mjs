import debug from 'debug'

import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { entity_exists_in_git } from '#libs-server/entity/git/entity-exists-in-git.mjs'
import { get_git_info_from_registry } from '#libs-server/base-uri/index.mjs'

const log = debug('task:read-from-git')

/**
 * Get the contents of a task file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - Task ID in URI format (e.g., 'sys:task/name.md', 'user:task/name.md')
 * @param {string} params.branch - Git branch to read from
 * @returns {Promise<Object>} - Task file contents and metadata
 */
export async function read_task_from_git({ base_uri, branch }) {
  try {
    log(`Reading task file from git: ${base_uri} (branch: ${branch})`)

    if (!base_uri) {
      return {
        success: false,
        error: 'Task ID is required',
        base_uri,
        branch
      }
    }

    if (!branch) {
      return {
        success: false,
        error: 'Branch name is required',
        base_uri
      }
    }

    // Check if task exists in git
    const task_exists_result = await entity_exists_in_git({
      base_uri,
      branch
    })

    if (!task_exists_result.success) {
      return {
        success: false,
        error:
          task_exists_result.error || 'Failed to check if task exists in git',
        base_uri,
        branch
      }
    }

    if (!task_exists_result.exists) {
      return {
        success: false,
        error: `Task '${base_uri}' does not exist in branch '${branch}'`,
        base_uri,
        branch
      }
    }

    // Get git info using registry
    const { git_relative_path, repo_path } =
      get_git_info_from_registry(base_uri)

    log(
      `Reading task from git at path: ${git_relative_path} in repo: ${repo_path}`
    )

    // Use the entity reader to get the file contents from git
    const entity_result = await read_entity_from_git({
      repo_path,
      git_relative_path,
      branch
    })

    if (!entity_result.success) {
      return {
        success: false,
        error: entity_result.error || `Failed to read task '${base_uri}'`,
        base_uri,
        branch
      }
    }

    // Return task with metadata
    return {
      success: true,
      base_uri,
      branch,
      entity_properties: entity_result.entity_properties,
      entity_content: entity_result.entity_content,
      raw_content: entity_result.raw_content
    }
  } catch (error) {
    log(`Error reading task file from git: ${error.message}`)
    return {
      success: false,
      error: `Failed to read task file from git: ${error.message}`,
      base_uri,
      branch
    }
  }
}
