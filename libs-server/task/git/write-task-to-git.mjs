import debug from 'debug'
import { write_entity_to_git } from '#libs-server/entity/git/write-entity-to-git.mjs'

const log = debug('task:write-to-git')

/**
 * Write a task file to git
 *
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - Task ID in URI format (e.g., 'sys:task/name.md', 'user:task/name.md')
 * @param {Object} params.task_properties - Task properties object
 * @param {string} params.task_content - Task content (markdown)
 * @param {string} params.branch - Git branch to write to
 * @param {string} params.commit_message - Git commit message
 * @returns {Promise<Object>} - Write result
 */
export async function write_task_to_git({
  base_uri,
  task_properties,
  task_content,
  branch,
  commit_message
}) {
  try {
    log(`Writing task file to git: ${base_uri} (branch: ${branch})`)

    if (!base_uri) {
      return {
        success: false,
        error: 'Task ID is required',
        base_uri,
        branch
      }
    }

    if (!task_properties) {
      return {
        success: false,
        error: 'Task properties are required',
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

    if (!commit_message) {
      return {
        success: false,
        error: 'Commit message is required',
        base_uri,
        branch
      }
    }

    log(`Writing task to git using base_uri: ${base_uri}`)

    // Use the entity writer to write to git
    const write_result = await write_entity_to_git({
      base_uri,
      entity_properties: task_properties,
      entity_type: 'task',
      entity_content: task_content,
      branch,
      commit_message
    })

    if (!write_result.success) {
      return {
        success: false,
        error:
          write_result.error || `Failed to write task '${base_uri}' to git`,
        base_uri,
        branch
      }
    }

    // Return success with metadata
    return {
      success: true,
      base_uri,
      branch,
      commit_sha: write_result.commit_sha
    }
  } catch (error) {
    log(`Error writing task file to git: ${error.message}`)
    return {
      success: false,
      error: `Failed to write task file to git: ${error.message}`,
      base_uri,
      branch
    }
  }
}
