import debug from 'debug'
import { branch_exists } from '../branch-operations.mjs'
import { get_diff } from '../search-operations.mjs'

const log = debug('libs-server:git:file-diff-in-git')

/**
 * Gets the diff for a file or directory between two branch/ref points
 * @param {Object} params - The parameters object
 * @param {string} params.repo_path - The path to the git repository
 * @param {string} params.file_path - The path to the file or directory to get diff for
 * @param {string} params.from_branch - The base branch to compare from
 * @param {string} params.to_branch - The target branch to compare to
 * @param {string} [params.format='unified'] - Diff format ('unified', 'name-only', 'stat')
 * @returns {Promise<Object>} - Returns an object with success status and diff content
 */
export async function file_diff_in_git({
  repo_path,
  file_path,
  from_branch,
  to_branch,
  format = 'unified'
}) {
  if (!repo_path) {
    throw new Error('Repository path is required')
  }

  if (!from_branch) {
    throw new Error('From branch is required')
  }

  if (!to_branch) {
    throw new Error('To branch is required')
  }

  try {
    log(
      `Getting diff for ${file_path || 'all files'} between ${from_branch} and ${to_branch} in ${repo_path}`
    )

    // Check if from_branch exists
    const from_branch_check = await branch_exists({
      repo_path,
      branch_name: from_branch,
      check_remote: false
    })

    if (!from_branch_check) {
      throw new Error(`From branch ${from_branch} does not exist`)
    }

    // Check if to_branch exists
    const to_branch_check = await branch_exists({
      repo_path,
      branch_name: to_branch,
      check_remote: false
    })

    if (!to_branch_check) {
      throw new Error(`To branch ${to_branch} does not exist`)
    }

    // Get the diff using the get_diff function from search-operations
    const diff_content = await get_diff({
      repo_path,
      from_ref: from_branch,
      to_ref: to_branch,
      path: file_path,
      format
    })

    log(`Successfully retrieved diff between ${from_branch} and ${to_branch}`)

    return {
      success: true,
      diff: diff_content,
      from_branch,
      to_branch,
      file_path,
      format
    }
  } catch (error) {
    log(`Error getting diff between ${from_branch} and ${to_branch}:`, error)
    return {
      success: false,
      error: error.message,
      from_branch,
      to_branch,
      file_path
    }
  }
}
