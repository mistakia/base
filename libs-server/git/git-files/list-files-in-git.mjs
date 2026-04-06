import debug from 'debug'
import { branch_exists } from '#libs-server/git/branch-operations.mjs'
import { list_files } from '#libs-server/git/file-operations.mjs'

const log = debug('libs-server:git:list-files-in-git')

/**
 * Lists files in a git repository from a specific branch
 * @param {Object} params - The parameters object
 * @param {string} params.repo_path - The path to the git repository
 * @param {string} params.branch - The branch to list files from
 * @param {string} [params.path_pattern=''] - Optional path pattern to filter files
 * @returns {Promise<Object>} - Returns an object with success status and list of files
 */
export async function list_files_in_git({
  repo_path,
  branch,
  path_pattern = ''
}) {
  if (!repo_path) {
    throw new Error('Repository path is required')
  }

  if (!branch) {
    throw new Error('Branch is required')
  }

  try {
    log(
      `Listing files in branch ${branch} at ${repo_path}${path_pattern ? ` with path pattern ${path_pattern}` : ''}`
    )

    // Check if branch exists - fail if it doesn't
    const branch_check = await branch_exists({
      repo_path,
      branch_name: branch,
      check_remote: false
    })

    if (!branch_check) {
      throw new Error(`Branch ${branch} does not exist`)
    }

    // List files using the list_files function from file-operations
    const files = await list_files({
      repo_path,
      ref: branch,
      path_pattern
    })

    log(`Successfully listed ${files.length} files from ${branch}`)

    return {
      success: true,
      files,
      branch,
      path_pattern
    }
  } catch (error) {
    log(`Error listing files from branch ${branch}:`, error)
    return {
      success: false,
      error: error.message,
      branch,
      path_pattern
    }
  }
}
