import path from 'path'
import debug from 'debug'

import { execute_git_command } from '#libs-server/git/execute-git-command.mjs'

const log = debug('git:file-status')

/**
 * Validate that file_path is relative and does not contain path traversal
 * @param {string} file_path - Path to validate
 * @throws {Error} If path is invalid
 */
function validate_relative_path(file_path) {
  if (!file_path || typeof file_path !== 'string') {
    throw new Error('file_path is required')
  }
  if (path.isAbsolute(file_path)) {
    throw new Error('file_path must be relative')
  }
  // Normalize and check for path traversal attempts
  const normalized = path.normalize(file_path)
  if (normalized.startsWith('..') || normalized.includes(`${path.sep}..`)) {
    throw new Error('file_path cannot contain path traversal sequences')
  }
}

/**
 * Parse git status code to descriptive string
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
    T: 'typechange',
    '?': 'untracked'
  }
  return status_map[code] || null
}

/**
 * Get git status for a specific file
 * @param {Object} params - The parameters
 * @param {string} params.repo_path - Path to the git repository
 * @param {string} params.file_path - Path to the file (relative to repo_path)
 * @returns {Promise<Object>} File status object with status and is_staged properties
 */
export async function get_file_status({ repo_path, file_path }) {
  validate_relative_path(file_path)
  log(`Getting status for file ${file_path} in ${repo_path}`)

  try {
    const { stdout } = await execute_git_command(
      ['status', '--porcelain=v1', '--', file_path],
      { cwd: repo_path }
    )

    // Only trim trailing whitespace - leading space is significant in git status output
    const output = stdout.trimEnd()

    if (!output) {
      // No output means file is clean (no changes)
      return { status: null, is_staged: false }
    }

    // Parse porcelain output: "XY filename"
    // X = index status, Y = worktree status
    const match = output.match(/^(.)(.)[ ](.+)$/)
    if (!match) {
      log(`Unexpected status format: ${output}`)
      return { status: null, is_staged: false }
    }

    const [, index_status, worktree_status] = match

    // Determine the primary status and staging state
    let status = null
    let is_staged = false

    // Untracked file
    if (index_status === '?' && worktree_status === '?') {
      return { status: 'untracked', is_staged: false }
    }

    // Conflict states: U in either position, or AA/DD/AU/UA/DU/UD combinations
    const is_conflict =
      index_status === 'U' ||
      worktree_status === 'U' ||
      (index_status === 'A' && worktree_status === 'A') ||
      (index_status === 'D' && worktree_status === 'D')
    if (is_conflict) {
      return { status: 'conflict', is_staged: false }
    }

    // Check for staged changes (index has modifications)
    if (index_status !== ' ' && index_status !== '?') {
      status = parse_status_code(index_status)
      is_staged = true
    }

    // Check for unstaged changes (worktree has modifications)
    // Unstaged takes precedence for display status
    if (worktree_status !== ' ' && worktree_status !== '?') {
      status = parse_status_code(worktree_status)
      // If there are also staged changes, file has both staged and unstaged
      if (index_status !== ' ' && index_status !== '?') {
        is_staged = true // Partial staging
      } else {
        is_staged = false
      }
    }

    return { status, is_staged }
  } catch (error) {
    log(`Failed to get file status: ${error.message}`)
    // If git command fails, file might not be in a repo
    return { status: null, is_staged: false }
  }
}

/**
 * Get diff stats (lines added/deleted) for a specific file
 * @param {Object} params - The parameters
 * @param {string} params.repo_path - Path to the git repository
 * @param {string} params.file_path - Path to the file (relative to repo_path)
 * @param {boolean} params.staged - Whether to get stats for staged changes
 * @returns {Promise<Object>} Diff stats object with additions and deletions
 */
export async function get_file_diff_stats({
  repo_path,
  file_path,
  staged = false
}) {
  validate_relative_path(file_path)
  log(
    `Getting diff stats for file ${file_path} in ${repo_path} (staged: ${staged})`
  )

  try {
    const args = ['diff']
    if (staged) args.push('--cached')
    args.push('--numstat', '--', file_path)
    const { stdout } = await execute_git_command(args, { cwd: repo_path })

    const output = stdout.trim()
    if (!output) {
      return { additions: 0, deletions: 0 }
    }

    // Parse numstat output: "<additions>\t<deletions>\t<filename>"
    const match = output.match(/^(\d+|-)\t(\d+|-)\t/)
    if (!match) {
      log(`Unexpected numstat format: ${output}`)
      return { additions: 0, deletions: 0 }
    }

    // "-" indicates binary file
    const additions = match[1] === '-' ? 0 : parseInt(match[1], 10)
    const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10)

    return { additions, deletions }
  } catch (error) {
    log(`Failed to get diff stats: ${error.message}`)
    return { additions: 0, deletions: 0 }
  }
}
