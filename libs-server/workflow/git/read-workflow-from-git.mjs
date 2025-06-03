import debug from 'debug'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { entity_exists_in_git } from '#libs-server/entity/git/entity-exists-in-git.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('workflow:read-from-git')

/**
 * Get the contents of a workflow file from a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Workflow ID in format [system|user]/<file_path>.md
 * @param {string} params.branch - Git branch to read from
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - Workflow file contents and metadata
 */
export async function read_workflow_from_git({
  base_relative_path,
  branch,
  root_base_directory = config.root_base_directory
}) {
  try {
    log(
      `Reading workflow file from git: ${base_relative_path} (branch: ${branch})`
    )

    if (!base_relative_path) {
      return {
        success: false,
        error: 'Workflow ID is required',
        base_relative_path,
        branch
      }
    }

    if (!branch) {
      return {
        success: false,
        error: 'Branch name is required',
        base_relative_path
      }
    }

    // Check if workflow exists in git
    const workflow_exists_result = await entity_exists_in_git({
      base_relative_path,
      branch,
      root_base_directory
    })

    if (!workflow_exists_result.success) {
      return {
        success: false,
        error:
          workflow_exists_result.error ||
          'Failed to check if workflow exists in git',
        base_relative_path,
        branch
      }
    }

    if (!workflow_exists_result.exists) {
      return {
        success: false,
        error: `Workflow '${base_relative_path}' does not exist in branch '${branch}'`,
        base_relative_path,
        branch
      }
    }

    // Use the shared helper to get file info
    const { repo_path, git_relative_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    log(
      `Reading workflow from git at path: ${git_relative_path} in repo: ${repo_path}`
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
        error:
          entity_result.error ||
          `Failed to read workflow '${base_relative_path}'`,
        base_relative_path,
        branch
      }
    }

    // Return workflow with metadata
    return {
      success: true,
      base_relative_path,
      branch,
      entity_properties: entity_result.entity_properties,
      entity_content: entity_result.entity_content,
      raw_content: entity_result.raw_content
    }
  } catch (error) {
    log(`Error reading workflow file from git: ${error.message}`)
    return {
      success: false,
      error: `Failed to read workflow file from git: ${error.message}`,
      base_relative_path,
      branch
    }
  }
}
