import { promisify } from 'util'
import { exec } from 'child_process'

const execute = promisify(exec)

/**
 * Get the current branch for a repository
 * @param {String} repo_path Path to the repository
 * @returns {String} Current branch name or null if can't be determined
 */
export async function get_current_branch(repo_path = '.') {
  try {
    const { stdout } = await execute('git rev-parse --abbrev-ref HEAD', {
      cwd: repo_path
    })
    return stdout.trim()
  } catch (error) {
    console.error(`Failed to get current branch for ${repo_path}:`, error)
    return null
  }
}

/**
 * Check if a repository is a git submodule
 * @param {String} repo_path Path to the repository
 * @returns {Boolean} True if the repository is a submodule
 */
export async function is_submodule(repo_path) {
  try {
    const { stdout } = await execute('git config --get-regexp ^submodule', {
      cwd: '.' // Run from parent repo directory
    })
    return stdout.includes(repo_path.replace(/^\.\//g, ''))
  } catch (error) {
    // If command fails, likely no submodules
    return false
  }
}

export default {
  get_current_branch,
  is_submodule
}
