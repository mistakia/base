import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('git:status')

/**
 * Parse git status porcelain output into structured data
 * @param {string} porcelain_output - Output from git status --porcelain=v1
 * @returns {Object} Parsed status with staged, unstaged, untracked arrays
 */
function parse_porcelain_status(porcelain_output) {
  const staged = []
  const unstaged = []
  const untracked = []
  const conflicts = []

  if (!porcelain_output.trim()) {
    return { staged, unstaged, untracked, conflicts }
  }

  // Use trimEnd() to preserve leading whitespace which is significant in git status
  // The first character of each line indicates index status (space = not staged)
  const lines = porcelain_output.trimEnd().split('\n')

  for (const line of lines) {
    if (line.length < 4) continue

    // Git porcelain v1 format: "XY pathname" where XY is 2-char status, space, then path
    // Use regex for more robust parsing
    const match = line.match(/^(.)(.)[ ](.+)$/)
    if (!match) {
      log(`Skipping unparseable status line: ${line}`)
      continue
    }

    const [, index_status, worktree_status, file_path] = match

    // Conflict markers (both modified, added by both, etc.)
    if (
      index_status === 'U' ||
      worktree_status === 'U' ||
      (index_status === 'A' && worktree_status === 'A') ||
      (index_status === 'D' && worktree_status === 'D')
    ) {
      conflicts.push({
        path: file_path,
        status: 'conflict',
        index_status,
        worktree_status
      })
      continue
    }

    // Untracked files
    if (index_status === '?' && worktree_status === '?') {
      untracked.push({
        path: file_path,
        status: 'untracked'
      })
      continue
    }

    // Staged changes (index has modifications)
    if (index_status !== ' ' && index_status !== '?') {
      staged.push({
        path: file_path,
        status: parse_status_code(index_status)
      })
    }

    // Unstaged changes (worktree has modifications)
    if (worktree_status !== ' ' && worktree_status !== '?') {
      unstaged.push({
        path: file_path,
        status: parse_status_code(worktree_status)
      })
    }
  }

  return { staged, unstaged, untracked, conflicts }
}

/**
 * Parse single status code to descriptive string
 * @param {string} code - Git status code
 * @returns {string} Descriptive status
 */
function parse_status_code(code) {
  const status_map = {
    M: 'modified',
    A: 'added',
    D: 'deleted',
    R: 'renamed',
    C: 'copied',
    U: 'unmerged',
    T: 'typechange'
  }
  return status_map[code] || 'unknown'
}

/**
 * Get comprehensive repository status
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<Object>} Repository status
 */
export async function get_status({ repo_path }) {
  try {
    log(`Getting status for ${repo_path}`)

    // Get branch name
    const { stdout: branch_output } = await execute_shell_command(
      'git rev-parse --abbrev-ref HEAD',
      { cwd: repo_path }
    )
    const branch = branch_output.trim()

    // Get porcelain status
    const { stdout: status_output } = await execute_shell_command(
      'git status --porcelain=v1',
      { cwd: repo_path }
    )

    const { staged, unstaged, untracked, conflicts } =
      parse_porcelain_status(status_output)

    // Get ahead/behind counts
    let ahead = 0
    let behind = 0
    let has_upstream = false

    try {
      const { stdout: tracking_output } = await execute_shell_command(
        'git rev-list --left-right --count HEAD...@{upstream}',
        { cwd: repo_path }
      )
      const [ahead_str, behind_str] = tracking_output.trim().split(/\s+/)
      ahead = parseInt(ahead_str, 10) || 0
      behind = parseInt(behind_str, 10) || 0
      has_upstream = true
    } catch {
      // No upstream branch configured
      log(`No upstream branch configured for ${repo_path}`)
    }

    // Get remote URL if available
    let remote_url = null
    try {
      const { stdout: remote_output } = await execute_shell_command(
        'git remote get-url origin',
        { cwd: repo_path }
      )
      remote_url = remote_output.trim()
    } catch {
      // No remote configured
    }

    return {
      branch,
      ahead,
      behind,
      has_upstream,
      remote_url,
      staged,
      unstaged,
      untracked,
      conflicts,
      has_changes:
        staged.length > 0 ||
        unstaged.length > 0 ||
        untracked.length > 0 ||
        conflicts.length > 0,
      has_conflicts: conflicts.length > 0
    }
  } catch (error) {
    log(`Failed to get status for ${repo_path}:`, error)
    throw new Error(
      `Failed to get repository status: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Get status for multiple repositories
 * @param {Object} params Parameters
 * @param {string[]} params.repo_paths Array of repository paths
 * @returns {Promise<Object>} Map of repo_path to status
 */
export async function get_multi_repo_status({ repo_paths }) {
  const results = {}

  for (const repo_path of repo_paths) {
    try {
      results[repo_path] = await get_status({ repo_path })
    } catch (error) {
      log(`Failed to get status for ${repo_path}:`, error.message)
      results[repo_path] = {
        error: error.message,
        branch: null,
        ahead: 0,
        behind: 0,
        has_upstream: false,
        remote_url: null,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicts: [],
        has_changes: false,
        has_conflicts: false
      }
    }
  }

  return results
}

export default {
  get_status,
  get_multi_repo_status
}
