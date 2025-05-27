import debug from 'debug'
import { write_entity_to_git } from '#libs-server/entity/git/write-entity-to-git.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import config from '#config'

const log = debug('task:write-to-git')

/**
 * Write a task file to a git branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_relative_path - Task ID in format [system|user]/<file_path>.md
 * @param {Object} params.task_properties - The task properties to write
 * @param {string} params.branch - Git branch to write to
 * @param {string} [params.task_content=''] - The markdown content to include after the frontmatter
 * @param {string} [params.commit_message] - Optional commit message
 * @param {string} [params.root_base_directory] - Custom root base directory
 * @returns {Promise<Object>} - Result with success, error and path info
 */
export async function write_task_to_git({
  base_relative_path,
  task_properties,
  branch,
  task_content = '',
  commit_message,
  root_base_directory = config.root_base_directory
}) {
  try {
    log(`Writing task to git: ${base_relative_path} (branch: ${branch})`)

    if (!base_relative_path) {
      return {
        success: false,
        error: 'Task ID is required',
        base_relative_path,
        branch
      }
    }

    if (!task_properties || typeof task_properties !== 'object') {
      return {
        success: false,
        error: 'Task properties must be a valid object',
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

    // Get file info using the shared helper
    const { repo_path, git_relative_path } = await get_base_file_info({
      base_relative_path,
      root_base_directory
    })

    log(
      `Writing task to git at path: ${git_relative_path} in repo: ${repo_path}`
    )

    // Generate default commit message if not provided
    const default_commit_message =
      commit_message || `Update task: ${task_properties.title || 'Untitled'}`

    // Use the entity writer to write to git
    const result = await write_entity_to_git({
      repo_path,
      git_relative_path,
      entity_properties: task_properties,
      entity_type: 'task',
      branch,
      entity_content: task_content,
      commit_message: default_commit_message
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to write task to git',
        base_relative_path,
        branch
      }
    }

    return {
      success: true,
      base_relative_path,
      git_relative_path,
      repo_path,
      branch,
      commit_sha: result.commit_sha
    }
  } catch (error) {
    log(`Error writing task to git: ${error.message}`)
    return {
      success: false,
      error: `Failed to write task to git: ${error.message}`,
      base_relative_path,
      branch
    }
  }
}
