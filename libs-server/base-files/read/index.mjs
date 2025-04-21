/**
 * File reading operations
 *
 * This module provides functionality for reading files from Git repositories.
 */

import debug from 'debug'
import * as git_ops from '#libs-server/git/index.mjs'
import { get_target_branch } from '../utils/branch.mjs'

// Setup logger
const log = debug('files:read')

/**
 * Read a file from a specific branch
 *
 * @param {Object} params - Parameters
 * @param {string} params.path - Path to the file relative to the repository root
 * @param {string} [params.thread_id] - Thread ID to determine branch
 * @param {string} [params.branch_name] - Branch name to use (takes precedence over thread_id)
 * @param {string} [params.repo_path] - Repository path (for testing)
 * @param {Object} [params.context={}] - Context object that may contain thread_id
 * @returns {Promise<Object>} Object containing file content
 */
export async function read_file({
  path: file_path,
  thread_id,
  branch_name,
  repo_path,
  context = {}
}) {
  try {
    const { branch_name: target_branch_name, repo_path: target_repo_path } =
      await get_target_branch({
        thread_id,
        branch_name,
        context,
        repo_path
      })

    log(
      `Reading file ${file_path} from branch ${target_branch_name} in repo ${target_repo_path}`
    )

    const content = await git_ops.read_file_from_ref({
      repo_path: target_repo_path,
      ref: target_branch_name,
      file_path
    })

    return { content }
  } catch (error) {
    log(`Error reading file ${file_path}:`, error)

    // Provide a more specific error message if possible
    if (
      error.message.includes('fatal: path') &&
      error.message.includes('does not exist')
    ) {
      throw new Error(
        `File not found at path "${file_path}" in the specified branch. ${error.message}`
      )
    }

    throw new Error(`Failed to read file: ${error.message}`)
  }
}
