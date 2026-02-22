import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('git:repo-statistics')

/**
 * Get total commit count for a repository
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<number>} Total number of commits
 */
export async function get_total_commits({ repo_path }) {
  const { stdout } = await execute_shell_command('git rev-list --count HEAD', {
    cwd: repo_path
  })
  return parseInt(stdout.trim(), 10) || 0
}

/**
 * Get last commit information
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<Object>} Last commit info
 */
export async function get_last_commit({ repo_path }) {
  // Use record and field separators that are unlikely to appear in commit messages
  // %x1e = record separator (ASCII 30)
  // %x1f = unit separator (ASCII 31)
  const format = '%H%x1f%h%x1f%s%x1f%b%x1f%aI%x1f%an%x1e'
  const { stdout } = await execute_shell_command(
    `git log -1 --format='${format}'`,
    { cwd: repo_path }
  )

  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }

  // Remove trailing record separator (ASCII 30) and split on unit separator (ASCII 31)
  // eslint-disable-next-line no-control-regex
  const record = trimmed.replace(/\x1e$/, '')
  const parts = record.split('\x1f')

  if (parts.length < 6) {
    log('Unexpected last commit format:', trimmed)
    return null
  }

  const [hash, short_hash, subject, body, date, author] = parts

  return {
    hash,
    short_hash,
    subject,
    body: body?.trim() || null,
    date,
    author
  }
}

/**
 * Get first commit information
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<Object>} First commit info
 */
export async function get_first_commit({ repo_path }) {
  // Get the root commit hash first (commits with no parents)
  const { stdout: root_hash_output } = await execute_shell_command(
    'git rev-list --max-parents=0 HEAD',
    { cwd: repo_path }
  )

  const root_hash = root_hash_output.trim().split('\n')[0]
  if (!root_hash) {
    return null
  }

  // Then get the commit info for that hash
  const format = '%H%x1f%h%x1f%aI'
  const { stdout } = await execute_shell_command(
    `git log -1 --format='${format}' ${root_hash}`,
    { cwd: repo_path }
  )

  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }

  const [hash, short_hash, date] = trimmed.split('\x1f')

  return {
    hash,
    short_hash,
    date
  }
}

/**
 * Get branch count for a repository
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<number>} Number of branches (local + remote)
 */
export async function get_branch_count({ repo_path }) {
  const { stdout } = await execute_shell_command('git branch -a --list', {
    cwd: repo_path
  })

  if (!stdout.trim()) {
    return 0
  }

  // Count non-empty lines (each line is a branch)
  const branches = stdout
    .trim()
    .split('\n')
    .filter((line) => line.trim())
  return branches.length
}

/**
 * Get comprehensive repository statistics
 * Runs all queries in parallel for performance
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @returns {Promise<Object>} Repository statistics
 */
export async function get_repo_statistics({ repo_path }) {
  try {
    log(`Getting statistics for ${repo_path}`)

    // Run all git commands in parallel for better performance
    const [
      total_commits_result,
      last_commit_result,
      first_commit_result,
      branch_count_result
    ] = await Promise.allSettled([
      get_total_commits({ repo_path }),
      get_last_commit({ repo_path }),
      get_first_commit({ repo_path }),
      get_branch_count({ repo_path })
    ])

    // Extract values with defaults for any failures
    const total_commits =
      total_commits_result.status === 'fulfilled'
        ? total_commits_result.value
        : 0

    const last_commit =
      last_commit_result.status === 'fulfilled'
        ? last_commit_result.value
        : null

    const first_commit =
      first_commit_result.status === 'fulfilled'
        ? first_commit_result.value
        : null

    const branch_count =
      branch_count_result.status === 'fulfilled' ? branch_count_result.value : 0

    return {
      total_commits,
      branch_count,
      last_commit,
      first_commit
    }
  } catch (error) {
    log(`Failed to get statistics for ${repo_path}:`, error)
    throw new Error(`Failed to get repository statistics: ${error.message}`)
  }
}

// Shared format string for commit log parsing
// %H=hash %h=short_hash %s=subject %b=body %aI=date %an=author_name %ae=author_email
const COMMIT_LOG_FORMAT = '%H%x1f%h%x1f%s%x1f%b%x1f%aI%x1f%an%x1f%ae%x1e'

/**
 * Parse a git log record using the shared format string
 */
function parse_commit_record(record) {
  const parts = record.split('\x1f')
  const [hash, short_hash, subject, body, date, author_name, author_email] =
    parts

  return {
    hash: hash?.trim(),
    short_hash,
    subject,
    body: body?.trim() || null,
    date,
    author_name,
    author_email
  }
}

/**
 * Sanitize a user-provided string for use in a shell single-quoted argument
 */
function sanitize_shell_arg(value) {
  return value.replace(/[\r\n]/g, '').replace(/'/g, "'\\''")
}

/**
 * Get paginated commit log for a repository
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @param {number} [params.limit=50] Maximum number of commits to return
 * @param {string} [params.before] Commit hash cursor - return commits before this commit
 * @param {string} [params.author] Filter by author name/email
 * @param {string} [params.search] Search commit messages (grep)
 * @returns {Promise<Object>} { commits, has_more }
 */
export async function get_commit_log({
  repo_path,
  limit = 50,
  before,
  author,
  search
}) {
  const fetch_limit = limit + 1

  const args = [`git log --format='${COMMIT_LOG_FORMAT}' -n ${fetch_limit}`]

  if (before) {
    args.push(`${before}~1`)
  }

  if (author) {
    args.push(`--author='${sanitize_shell_arg(author)}'`)
  }

  if (search) {
    args.push(`--grep='${sanitize_shell_arg(search)}'`)
  }

  let stdout
  try {
    const result = await execute_shell_command(args.join(' '), {
      cwd: repo_path
    })
    stdout = result.stdout
  } catch (error) {
    if (
      error.message?.includes('unknown revision') ||
      error.stderr?.includes('unknown revision')
    ) {
      return { commits: [], has_more: false }
    }
    throw error
  }

  const trimmed = stdout.trim()
  if (!trimmed) {
    return { commits: [], has_more: false }
  }

  // eslint-disable-next-line no-control-regex
  const records = trimmed.split('\x1e').filter((r) => r.trim())
  const commits = records.slice(0, limit).map(parse_commit_record)
  const has_more = records.length > limit

  return { commits, has_more }
}

/**
 * Get single commit metadata by hash
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @param {string} params.hash Commit hash
 * @returns {Promise<Object|null>} Commit metadata or null if not found
 */
export async function get_single_commit({ repo_path, hash }) {
  const { stdout } = await execute_shell_command(
    `git log -1 --format='${COMMIT_LOG_FORMAT}' ${hash}`,
    { cwd: repo_path }
  )

  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }

  // eslint-disable-next-line no-control-regex
  const record = trimmed.replace(/\x1e$/, '')
  return parse_commit_record(record)
}

export default {
  get_repo_statistics,
  get_total_commits,
  get_last_commit,
  get_first_commit,
  get_branch_count,
  get_commit_log,
  get_single_commit
}
