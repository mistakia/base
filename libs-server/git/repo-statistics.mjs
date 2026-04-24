import path from 'path'
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
 * @param {number} [params.skip=0] Number of commits to skip (for page-based pagination)
 * @param {string} [params.author] Filter by author name/email
 * @param {string} [params.search] Search commit messages (grep)
 * @returns {Promise<Object>} { commits, has_more }
 */
export async function get_commit_log({
  repo_path,
  limit = 50,
  before,
  skip = 0,
  author,
  search
}) {
  const fetch_limit = limit + 1

  const args = [`git log --format='${COMMIT_LOG_FORMAT}' -n ${fetch_limit}`]

  if (before) {
    args.push(`${before}~1`)
  }

  if (skip > 0) {
    args.push(`--skip=${skip}`)
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

// Maximum byte length of a per-commit diff returned by get_file_history.
// Diffs above this cap are truncated and flagged via the `truncated` field.
export const FILE_HISTORY_PATCH_MAX_BYTES = 256 * 1024

// Upper bound for the follow-aware commit count walk. Files with more commits
// are reported as `total_count: FILE_HISTORY_MAX_COUNT` with `count_capped: true`
// so pagination stays bounded for deep histories.
export const FILE_HISTORY_MAX_COUNT = 1000

/**
 * Get file-scoped git history with --follow across renames.
 * Returns commits that touched `relative_path`, in reverse chronological order,
 * each record containing the diff scoped to that file at that commit.
 *
 * @param {Object} params Parameters
 * @param {string} params.repo_path Absolute repository path
 * @param {string} params.relative_path File path relative to repo_path
 * @param {number} [params.limit=50] Maximum number of commits to return (capped at 200)
 * @param {number} [params.page=1] Page number for offset-based pagination
 * @param {string} [params.before] Commit hash cursor - return commits before this commit
 * @returns {Promise<Object>} { commits, total_count, branch, repo_name, current_path }
 */
export async function get_file_history({
  repo_path,
  relative_path,
  limit = 50,
  page = 1,
  before
}) {
  const fetch_limit = Math.min(Math.max(1, limit), 200)
  // Clamp page so total_to_fetch can never exceed FILE_HISTORY_MAX_COUNT +
  // fetch_limit. Pages past the count cap can return no new results, so
  // requesting them must not trigger an unbounded `git log -n N` walk.
  const max_page = Math.max(1, Math.ceil(FILE_HISTORY_MAX_COUNT / fetch_limit))
  const effective_page = Math.min(Math.max(1, page), max_page)
  const skip = before ? 0 : (effective_page - 1) * fetch_limit

  const safe_path = sanitize_shell_arg(relative_path)

  // Record sentinel sits on its own line so it can never collide with patch
  // content. %x1f separates metadata fields within the header line.
  const commit_sentinel = '\x1eFILE_HISTORY_COMMIT\x1f'
  const header_format = `${commit_sentinel}%H%x1f%h%x1f%s%x1f%aI%x1f%an`

  // Notes on flags:
  // - `--name-status` is not combinable with `-p` in `git log` (later diff
  //   format wins). Parse status/path from patch headers instead.
  // - `--follow` is incompatible with `--skip` in git log; fetch
  //   `skip + fetch_limit` commits and slice in JS for offset pagination.
  //   Deep pages pay for all prior commits' patch output — acceptable for
  //   the expected UX (most navigation stays near page 1).
  const total_to_fetch = before ? fetch_limit : skip + fetch_limit

  // Bound stdout to what the fetch window plus truncation cap could produce,
  // with headroom for header lines and extended-header frames. Never exceed
  // a 50MB ceiling.
  const max_buffer = Math.min(
    50 * 1024 * 1024,
    total_to_fetch * (FILE_HISTORY_PATCH_MAX_BYTES + 8 * 1024) + 64 * 1024
  )

  const log_args = [
    `git log --follow -p --pretty=format:'${header_format}' -n ${total_to_fetch}`
  ]
  if (before) {
    log_args.push(`${before}~1`)
  }
  log_args.push(`-- '${safe_path}'`)

  let stdout = ''
  try {
    const result = await execute_shell_command(log_args.join(' '), {
      cwd: repo_path,
      maxBuffer: max_buffer
    })
    stdout = result.stdout || ''
  } catch (error) {
    if (
      error.message?.includes('unknown revision') ||
      error.stderr?.includes('unknown revision')
    ) {
      stdout = ''
    } else {
      throw error
    }
  }

  const parsed = parse_file_history_output(stdout, commit_sentinel)
  const commits = before ? parsed : parsed.slice(skip, skip + fetch_limit)

  // Count is anchored at HEAD, so it only makes sense for page-based
  // navigation. `before` cursor requests skip the count entirely.
  let total_count = null
  let count_capped = false
  if (!before) {
    try {
      const { stdout: count_stdout } = await execute_shell_command(
        `git log --follow --format=%H HEAD -n ${FILE_HISTORY_MAX_COUNT + 1} -- '${safe_path}'`,
        { cwd: repo_path, maxBuffer: 2 * 1024 * 1024 }
      )
      const hashes = count_stdout.split('\n').filter((line) => line.trim())
      if (hashes.length > FILE_HISTORY_MAX_COUNT) {
        total_count = FILE_HISTORY_MAX_COUNT
        count_capped = true
      } else {
        total_count = hashes.length
      }
    } catch (error) {
      log(
        'follow count failed, falling back to parsed length: %s',
        error.message
      )
      total_count = commits.length
    }
  }

  let branch = null
  try {
    const { stdout: branch_stdout } = await execute_shell_command(
      'git rev-parse --abbrev-ref HEAD',
      { cwd: repo_path }
    )
    branch = branch_stdout.trim() || null
  } catch {
    branch = null
  }

  return {
    commits,
    total_count,
    count_capped,
    branch,
    repo_name: path.basename(repo_path),
    current_path: relative_path
  }
}

function parse_file_history_output(stdout, commit_sentinel) {
  if (!stdout) return []

  const chunks = stdout.split(commit_sentinel).filter((chunk) => chunk.length > 0)
  return chunks.map((chunk) => parse_file_history_chunk(chunk))
}

function parse_file_history_chunk(chunk) {
  const newline_index = chunk.indexOf('\n')
  const header_line =
    newline_index === -1 ? chunk : chunk.slice(0, newline_index)
  const remainder = newline_index === -1 ? '' : chunk.slice(newline_index + 1)

  const [hash, short_hash, subject, date, author_name] =
    header_line.split('\x1f')

  const diff_marker_index = remainder.indexOf('diff --git ')
  const patch_section =
    diff_marker_index === -1 ? '' : remainder.slice(diff_marker_index)

  const { status, path_at_commit } = parse_patch_header(patch_section)

  const is_binary = /^Binary files .* differ$/m.test(patch_section)
  let diff = is_binary ? '' : patch_section
  let truncated = false
  if (diff.length > FILE_HISTORY_PATCH_MAX_BYTES) {
    diff = diff.slice(0, FILE_HISTORY_PATCH_MAX_BYTES)
    truncated = true
  }

  return {
    hash: hash?.trim() || null,
    short_hash: short_hash || null,
    subject: subject || '',
    date: date || null,
    author_name: author_name || null,
    path_at_commit,
    status,
    diff,
    is_binary,
    truncated
  }
}

function parse_patch_header(patch_section) {
  if (!patch_section) {
    return { status: null, path_at_commit: null }
  }

  // Only inspect lines before the first hunk to avoid scanning the whole patch.
  const hunk_index = patch_section.indexOf('\n@@')
  const header_block =
    hunk_index === -1 ? patch_section : patch_section.slice(0, hunk_index)
  const lines = header_block.split('\n')

  let status = 'M'
  let src_path = null
  let dst_path = null
  let rename_to = null
  let copy_to = null

  // Paths are taken from the unified-diff `--- a/<src>` / `+++ b/<dst>`
  // headers, which are unambiguous even when the path contains spaces or
  // the ` b/` substring. The `diff --git` line is ambiguous for spaced
  // paths and is intentionally ignored here.
  for (const line of lines) {
    if (line.startsWith('--- a/')) {
      src_path = line.slice('--- a/'.length)
    } else if (line.startsWith('+++ b/')) {
      dst_path = line.slice('+++ b/'.length)
    } else if (line.startsWith('new file mode')) {
      status = 'A'
    } else if (line.startsWith('deleted file mode')) {
      status = 'D'
    } else if (line.startsWith('rename to ')) {
      status = 'R'
      rename_to = line.slice('rename to '.length)
    } else if (line.startsWith('copy to ')) {
      status = 'C'
      copy_to = line.slice('copy to '.length)
    }
  }

  // Deletions have `+++ /dev/null`, so fall back to the src path.
  let path_at_commit = dst_path || src_path

  // Prefer explicit rename/copy targets when present.
  if (rename_to) path_at_commit = rename_to
  else if (copy_to) path_at_commit = copy_to

  return { status, path_at_commit }
}

export default {
  get_repo_statistics,
  get_total_commits,
  get_last_commit,
  get_first_commit,
  get_branch_count,
  get_commit_log,
  get_single_commit,
  get_file_history
}
