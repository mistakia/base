import debug from 'debug'
import { branch_exists } from '../branch-operations.mjs'
import { read_file_from_ref } from '../file-operations.mjs'

const log = debug('libs-server:git:read-file-from-git')

/**
 * Reads a file from a specific branch in a git repository
 * @param {Object} params - The parameters object
 * @param {string} params.repo_path - The path to the git repository
 * @param {string} params.file_path - The path to the file within the repository
 * @param {string} params.branch - The branch to read from
 * @returns {Promise<Object>} - Returns an object with success status and file content
 */
export async function read_file_from_git({ repo_path, file_path, branch }) {
  if (!repo_path) {
    throw new Error('Repository path is required')
  }

  if (!file_path) {
    throw new Error('File path is required')
  }

  if (!branch) {
    throw new Error('Branch is required')
  }

  try {
    log(`Reading file ${file_path} from branch ${branch} at ${repo_path}`)

    // Check if branch exists - fail if it doesn't
    const branch_check = await branch_exists({
      repo_path,
      branch_name: branch,
      check_remote: false
    })

    if (!branch_check) {
      throw new Error(`Branch ${branch} does not exist`)
    }

    // Read file content directly using git show
    const content = await read_file_from_ref({
      repo_path,
      ref: branch,
      file_path
    })

    log(`Successfully read content from ${file_path}`)

    return {
      success: true,
      content,
      branch,
      file_path
    }
  } catch (error) {
    log(`Error reading file ${file_path}:`, error)
    return {
      success: false,
      error: error.message,
      file_path
    }
  }
}
