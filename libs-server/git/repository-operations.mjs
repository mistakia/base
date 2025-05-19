import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('git:repository-operations')

/**
 * Get repository info
 * @param {String} repo_path Path to the repository
 * @returns {Object} Repository info including owner and name
 */
export async function get_repo_info(repo_path) {
  try {
    log(`Getting remote URL for ${repo_path}`)
    const { stdout: remote_url } = await execute_shell_command(
      'git config --get remote.origin.url',
      {
        cwd: repo_path
      }
    )

    // Parse the URL to extract owner and repo name
    const url = remote_url.trim()
    let owner = ''
    let name = ''

    // Handle different URL formats
    if (url.startsWith('git@')) {
      // SSH format: git@github.com:owner/repo.git
      const match = url.match(/git@github\.com:([^/]+)\/([^.]+)/)
      if (match) {
        owner = match[1]
        name = match[2]
      }
    } else if (url.startsWith('https://')) {
      // HTTPS format: https://github.com/owner/repo.git
      const match = url.match(/https:\/\/github\.com\/([^/]+)\/([^.]+)/)
      if (match) {
        owner = match[1]
        name = match[2]
      }
    }

    return { owner, name, url }
  } catch (error) {
    log(`Failed to get repo info for ${repo_path}:`, error)
    return { owner: '', name: '', url: '' }
  }
}

/**
 * Initialize a git repository in a directory
 *
 * @param {Object} params Parameters
 * @param {String} params.directory Path to directory to initialize
 * @param {Boolean} [params.bare=false] Initialize as bare repository
 * @returns {Promise<Boolean>} True if successful
 */
export async function git_init({ directory, bare = false }) {
  try {
    const bare_option = bare ? '--bare' : ''
    log(`Initializing git repository in ${directory}`)
    await execute_shell_command(`git init ${bare_option}`, {
      cwd: directory
    })
    return true
  } catch (error) {
    log(`Failed to initialize git repository in ${directory}:`, error)
    throw new Error(
      `Failed to initialize git repository: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * List all submodules in a repository
 *
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @returns {Promise<Array>} List of submodules with path, commit and branch
 */
export async function list_submodules({ repo_path = '.' }) {
  try {
    log(`Listing submodules in ${repo_path}`)
    const { stdout } = await execute_shell_command('git submodule', {
      cwd: repo_path
    })

    if (!stdout.trim()) {
      return []
    }

    const submodules = []
    const lines = stdout.trim().split('\n')

    for (const line of lines) {
      const match = line.match(/^[\s]*([^\s]+)\s+([^\s]+)(?:\s+\(([^)]+)\))?/)
      if (match) {
        submodules.push({
          commit: match[1],
          path: match[2],
          branch: match[3] || null
        })
      }
    }

    return submodules
  } catch (error) {
    log(`Failed to list submodules in ${repo_path}:`, error)
    // If command fails, likely no submodules or not a git repo
    return []
  }
}

export default {
  get_repo_info,
  git_init,
  list_submodules
}
