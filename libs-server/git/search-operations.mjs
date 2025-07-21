import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('git:search-operations')

/**
 * Get diff between two git references
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.from_ref From reference
 * @param {String} params.to_ref To reference
 * @param {String} [params.path] Path filter
 * @param {String} [params.format='unified'] Output format ('unified', 'name-only', 'stat')
 * @returns {String} Diff output
 */
export async function get_diff({
  repo_path,
  from_ref,
  to_ref,
  path,
  format = 'unified'
}) {
  try {
    let format_option = ''
    switch (format) {
      case 'name-only':
        format_option = '--name-only'
        break
      case 'stat':
        format_option = '--stat'
        break
      case 'unified':
      default:
        if (format && format !== 'unified') {
          log(`Unexpected format type '${format}' in diff operation, falling back to unified diff - this may indicate a coding gap`)
        }
        format_option = '-p'
        break
    }

    const path_filter = path ? `-- ${path}` : ''
    log(
      `Getting diff between ${from_ref} and ${to_ref} in ${repo_path} with path filter ${path_filter}`
    )
    const { stdout } = await execute_shell_command(
      `git diff ${format_option} ${from_ref} ${to_ref} ${path_filter}`,
      { cwd: repo_path }
    )

    return stdout
  } catch (error) {
    log(`Failed to get diff between ${from_ref} and ${to_ref}:`, error)
    throw new Error(
      `Failed to get diff: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Search in git repository
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.query Search query
 * @param {String} [params.git_ref='HEAD'] Git reference to search (branch, tag, commit hash)
 * @param {String} [params.path] Path filter
 * @param {Boolean} [params.case_sensitive=false] Whether search is case sensitive
 * @returns {Array<Object>} Search results with file paths and matching content
 */
export async function search_repository({
  repo_path,
  query,
  git_ref = 'HEAD',
  path,
  case_sensitive = false
}) {
  try {
    const case_option = case_sensitive ? '' : '-i'
    const path_filter = path ? `-- ${path}` : ''

    log(
      `Searching for "${query}" in reference "${git_ref}" in ${repo_path} ${path_filter ? `with path filter ${path_filter}` : ''}`
    )

    const { stdout } = await execute_shell_command(
      `git grep ${case_option} -n -I --no-color "${query}" "${git_ref}" -- ${path_filter}`,
      {
        cwd: repo_path,
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large results
      }
    )

    // Parse results
    const results = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        // Format: ref:file:line_number:content
        const parts = line.split(':')
        const ref = parts[0]
        const file = parts[1]
        const line_number = parseInt(parts[2], 10)
        const content = parts.slice(3).join(':').trim()

        return {
          file,
          content,
          line_number,
          ref
        }
      })

    return results
  } catch (error) {
    // If grep doesn't find anything, it returns non-zero
    if (error.code === 1 && !error.stderr) {
      return []
    }

    log(`Failed to search for "${query}" using git grep: ${error.message}`)

    // If git grep fails, and we're looking at the current branch (common in tests),
    // fallback to reading files directly and searching in them
    if (git_ref === 'HEAD' || git_ref === 'main') {
      try {
        log('Falling back to direct file search')
        return await search_files_directly(repo_path, query, {
          path,
          case_sensitive
        })
      } catch (fallback_error) {
        log(`Fallback search method also failed: ${fallback_error.message}`)
        return []
      }
    }

    return []
  }
}

/**
 * Helper function to search files directly
 * @param {String} repo_path Base directory path
 * @param {String} query Search query
 * @param {Object} options Search options
 * @returns {Array<Object>} Search results
 */
async function search_files_directly(
  repo_path,
  query,
  { path: path_filter, case_sensitive = false } = {}
) {
  const results = []
  // Get files to search in
  const all_files = await import('./file-operations.mjs').then((module) =>
    module.list_files_recursive(repo_path, path_filter || '')
  )

  // Create a regex for the search
  const search_regex = new RegExp(query, case_sensitive ? '' : 'i')

  // Search in each file
  for (const file_path of all_files) {
    try {
      const full_path = path.join(repo_path, file_path)
      const content = await fs.readFile(full_path, 'utf8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        if (search_regex.test(lines[i])) {
          results.push({
            file: file_path,
            content: lines[i],
            line_number: i + 1
          })
        }
      }
    } catch (error) {
      log(`Error reading file ${file_path}: ${error.message}`)
      // Continue with other files
    }
  }

  return results
}

/**
 * Get commits with diffs between two git references
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.from_ref From reference (usually target branch)
 * @param {String} params.to_ref To reference (usually feature branch)
 * @returns {Array} Array of commit objects with their associated diffs
 */
export async function get_commits_with_diffs({ repo_path, from_ref, to_ref }) {
  try {
    // Check if both references exist
    try {
      // Try to get commit hashes in reverse chronological order
      const { stdout: commit_output } = await execute_shell_command(
        `git log --pretty=format:"%H|%an|%ae|%ad|%s" ${from_ref}..${to_ref}`,
        { cwd: repo_path }
      )

      if (!commit_output.trim()) {
        return []
      }

      // Parse commits into an array
      const commits = commit_output.split('\n').map((line) => {
        const [hash, author_name, author_email, date, message] = line.split('|')
        return {
          hash,
          author_name,
          author_email,
          date,
          message,
          files: [] // Will be populated with file diffs
        }
      })

      // For each commit, get the file changes
      for (const commit of commits) {
        // Get file changes for this specific commit
        const { stdout: file_output } = await execute_shell_command(
          `git show --name-status ${commit.hash} --format=""`,
          { cwd: repo_path }
        )

        if (file_output.trim()) {
          // Parse file changes
          const files = file_output
            .trim()
            .split('\n')
            .map((line) => {
              const [status, ...path_parts] = line.split('\t')
              const file_path = path_parts.join('\t') // Handle filenames with tabs

              return {
                status: parse_git_status(status),
                path: file_path
              }
            })

          // Get the actual diff for each file
          for (const file of files) {
            const { stdout: diff_output } = await execute_shell_command(
              `git show ${commit.hash} -- "${file.path}"`,
              { cwd: repo_path }
            )

            file.diff = diff_output
          }

          commit.files = files
        }
      }

      return commits
    } catch (error) {
      // If we can't get the commit range (e.g., one of the branches doesn't exist),
      // return an empty array instead of throwing
      log(
        `Could not get commits between ${from_ref} and ${to_ref}: ${error.message}`
      )
      return []
    }
  } catch (error) {
    log(
      `Failed to get commits with diffs between ${from_ref} and ${to_ref}:`,
      error
    )
    throw new Error(
      `Failed to get commits with diffs: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Parse Git status code into a more descriptive status
 * @param {String} status Git status code (A, M, D, etc.)
 * @returns {String} Descriptive status
 */
function parse_git_status(status) {
  const status_map = {
    A: 'added',
    M: 'modified',
    D: 'deleted',
    R: 'renamed',
    C: 'copied',
    U: 'unmerged'
  }

  const first_char = status.charAt(0)
  return status_map[first_char] || 'unknown'
}

/**
 * Get information about a merge commit, including file changes
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.commit_hash Hash of the merge commit to inspect
 * @returns {Object} Merge commit information with file changes
 */
export async function get_merge_commit_info({ repo_path, commit_hash }) {
  try {
    if (!commit_hash) {
      log('No commit hash provided for merge commit info')
      return null
    }

    // Get commit details
    const { stdout: commit_details } = await execute_shell_command(
      `git show --format="%H|%an|%ae|%ad|%s" --no-patch ${commit_hash}`,
      { cwd: repo_path }
    )

    if (!commit_details.trim()) {
      log(`Commit ${commit_hash} not found`)
      return null
    }

    // Parse commit info
    const [hash, author_name, author_email, date, message] = commit_details
      .trim()
      .split('|')
    const commit = {
      hash,
      author_name,
      author_email,
      date,
      message,
      files: [] // Will be populated with file changes
    }

    // Get file changes for this merge commit
    const { stdout: file_output } = await execute_shell_command(
      `git show --name-status ${commit_hash} --format=""`,
      { cwd: repo_path }
    )

    if (file_output.trim()) {
      // Parse file changes
      const files = file_output
        .trim()
        .split('\n')
        .map((line) => {
          const [status, ...path_parts] = line.split('\t')
          const file_path = path_parts.join('\t') // Handle filenames with tabs

          return {
            status: parse_git_status(status),
            path: file_path
          }
        })

      // Get the actual diff for each file
      for (const file of files) {
        const { stdout: diff_output } = await execute_shell_command(
          `git show ${commit_hash} -- "${file.path}"`,
          { cwd: repo_path }
        )

        file.diff = diff_output
      }

      commit.files = files
    }

    return commit
  } catch (error) {
    log(`Failed to get merge commit info for ${commit_hash}:`, error)
    return null
  }
}

export default {
  get_diff,
  search_repository,
  get_commits_with_diffs,
  get_merge_commit_info
}
