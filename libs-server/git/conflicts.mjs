import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('git:conflicts')

/**
 * Get the current branch name
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<string|null>} Current branch name or null
 */
export async function get_current_branch_name({ repo_path }) {
  try {
    const { stdout } = await execute_shell_command(
      'git branch --show-current',
      {
        cwd: repo_path
      }
    )
    return stdout.trim() || null
  } catch (error) {
    log(`Failed to get current branch name: ${error.message}`)
    return null
  }
}

/**
 * Get the branch name from MERGE_HEAD
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<string|null>} Merge head branch name or null
 */
export async function get_merge_head_branch_name({ repo_path }) {
  try {
    const merge_head_path = path.join(repo_path, '.git', 'MERGE_HEAD')
    const merge_head_commit = await fs.readFile(merge_head_path, 'utf8')
    const commit_hash = merge_head_commit.trim()

    // Use git name-rev to get the branch name
    const { stdout } = await execute_shell_command(
      `git name-rev --name-only ${commit_hash}`,
      { cwd: repo_path }
    )

    // name-rev returns things like "feature/branch-name" or "remotes/origin/branch-name~1"
    // Clean up the result
    let branch_name = stdout.trim()

    // Remove ~N suffix if present (e.g., "main~2" -> "main")
    branch_name = branch_name.replace(/~\d+$/, '')

    // Remove ^N suffix if present (e.g., "main^2" -> "main")
    branch_name = branch_name.replace(/\^\d+$/, '')

    // Remove "remotes/origin/" prefix if present
    branch_name = branch_name.replace(/^remotes\/origin\//, '')

    return branch_name || null
  } catch (error) {
    log(`Failed to get merge head branch name: ${error.message}`)
    return null
  }
}

/**
 * Get list of files in conflict state
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<Array<Object>>} Array of conflict objects
 */
export async function get_conflicts({ repo_path }) {
  try {
    log(`Getting conflicts for ${repo_path}`)

    const { stdout } = await execute_shell_command(
      'git diff --name-only --diff-filter=U',
      { cwd: repo_path }
    )

    if (!stdout.trim()) {
      return []
    }

    const conflict_files = stdout.trim().split('\n').filter(Boolean)

    return conflict_files.map((file_path) => ({
      path: file_path,
      status: 'conflict'
    }))
  } catch (error) {
    log(`Failed to get conflicts for ${repo_path}:`, error)
    throw new Error(
      `Failed to get conflicts: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Get the different versions of a conflicted file
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @param {string} params.file_path Path to the conflicted file
 * @returns {Promise<Object>} Object with ours, theirs, and base versions
 */
export async function get_conflict_versions({ repo_path, file_path }) {
  try {
    log(`Getting conflict versions for ${file_path} in ${repo_path}`)

    // Get our version (HEAD/current branch)
    let ours = null
    try {
      const { stdout } = await execute_shell_command(
        `git show :2:"${file_path}"`,
        { cwd: repo_path }
      )
      ours = stdout
    } catch {
      log(`No 'ours' version for ${file_path}`)
    }

    // Get their version (incoming/merge branch)
    let theirs = null
    try {
      const { stdout } = await execute_shell_command(
        `git show :3:"${file_path}"`,
        { cwd: repo_path }
      )
      theirs = stdout
    } catch {
      log(`No 'theirs' version for ${file_path}`)
    }

    // Get base version (common ancestor)
    let base = null
    try {
      const { stdout } = await execute_shell_command(
        `git show :1:"${file_path}"`,
        { cwd: repo_path }
      )
      base = stdout
    } catch {
      log(`No 'base' version for ${file_path}`)
    }

    // Get current working tree version (with conflict markers)
    let current = null
    try {
      const full_path = path.join(repo_path, file_path)
      current = await fs.readFile(full_path, 'utf8')
    } catch {
      log(`Could not read current file ${file_path}`)
    }

    // Get branch names for display
    const ours_branch = await get_current_branch_name({ repo_path })
    const theirs_branch = await get_merge_head_branch_name({ repo_path })

    return {
      file_path,
      ours,
      theirs,
      base,
      current,
      ours_branch,
      theirs_branch
    }
  } catch (error) {
    log(`Failed to get conflict versions for ${file_path}:`, error)
    throw new Error(
      `Failed to get conflict versions: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Resolve a conflict by choosing a version or providing merged content
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @param {string} params.file_path Path to the conflicted file
 * @param {string} params.resolution Resolution strategy: 'ours', 'theirs', or 'merged'
 * @param {string} [params.merged_content] Content to use when resolution is 'merged'
 * @returns {Promise<boolean>} True if successful
 */
export async function resolve_conflict({
  repo_path,
  file_path,
  resolution,
  merged_content
}) {
  try {
    log(`Resolving conflict for ${file_path} with strategy: ${resolution}`)

    const full_path = path.join(repo_path, file_path)

    if (resolution === 'ours') {
      // Use our version
      await execute_shell_command(`git checkout --ours "${file_path}"`, {
        cwd: repo_path
      })
    } else if (resolution === 'theirs') {
      // Use their version
      await execute_shell_command(`git checkout --theirs "${file_path}"`, {
        cwd: repo_path
      })
    } else if (resolution === 'merged') {
      // Use provided merged content
      if (!merged_content) {
        throw new Error(
          'merged_content is required when resolution is "merged"'
        )
      }
      await fs.writeFile(full_path, merged_content, 'utf8')
    } else {
      throw new Error(`Invalid resolution strategy: ${resolution}`)
    }

    // Stage the resolved file
    await execute_shell_command(`git add "${file_path}"`, { cwd: repo_path })

    log(`Successfully resolved conflict for ${file_path}`)
    return true
  } catch (error) {
    log(`Failed to resolve conflict for ${file_path}:`, error)
    throw new Error(
      `Failed to resolve conflict: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Abort a merge in progress
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<boolean>} True if successful
 */
export async function abort_merge({ repo_path }) {
  try {
    log(`Aborting merge in ${repo_path}`)
    await execute_shell_command('git merge --abort', { cwd: repo_path })
    return true
  } catch (error) {
    log(`Failed to abort merge in ${repo_path}:`, error)
    throw new Error(
      `Failed to abort merge: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Check if repository is in a merge state
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<boolean>} True if in merge state
 */
export async function is_merging({ repo_path }) {
  try {
    const merge_head_path = path.join(repo_path, '.git', 'MERGE_HEAD')
    await fs.access(merge_head_path)
    return true
  } catch {
    return false
  }
}

export default {
  get_conflicts,
  get_conflict_versions,
  resolve_conflict,
  abort_merge,
  is_merging,
  get_current_branch_name,
  get_merge_head_branch_name
}
