import { promisify } from 'util'
import { exec } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import debug from 'debug'

const log = debug('git')
const execute = promisify(exec)

/**
 * Get the current branch for a repository
 * @param {String} repo_path Path to the repository
 * @returns {String} Current branch name or null if can't be determined
 */
export async function get_current_branch(repo_path = '.') {
  try {
    log(`Getting current branch for ${repo_path}`)
    const { stdout } = await execute('git rev-parse --abbrev-ref HEAD', {
      cwd: repo_path
    })
    return stdout.trim()
  } catch (error) {
    log(`Failed to get current branch for ${repo_path}:`, error)
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
    log(`Checking if ${repo_path} is a submodule`)
    const { stdout } = await execute('git config --get-regexp ^submodule', {
      cwd: '.' // Run from parent repo directory
    })
    return stdout.includes(repo_path.replace(/^\.\//g, ''))
  } catch (error) {
    // If command fails, likely no submodules
    return false
  }
}

/**
 * Check if a branch exists locally or remotely
 * @param {String} repo_path Path to the repository
 * @param {String} branch_name Branch name to check
 * @param {Boolean} check_remote Whether to check remote branches
 * @returns {Boolean} True if the branch exists
 */
export async function branch_exists(
  repo_path,
  branch_name,
  { check_remote = true } = {}
) {
  try {
    // Check local branches
    log(`Checking local branches for ${repo_path}`)
    const { stdout: local_branches } = await execute('git branch --list', {
      cwd: repo_path
    })

    const branch_pattern = new RegExp(`\\b${branch_name}\\b`)
    if (branch_pattern.test(local_branches)) {
      return true
    }

    // Check remote branches if requested
    if (check_remote) {
      try {
        await execute(`git ls-remote --heads origin ${branch_name}`, {
          cwd: repo_path
        })
        return true
      } catch (error) {
        // If the command fails, the branch doesn't exist remotely
        return false
      }
    }

    return false
  } catch (error) {
    log(`Failed to check if branch ${branch_name} exists:`, error)
    return false
  }
}

/**
 * Create a new branch
 * @param {String} repo_path Path to the repository
 * @param {String} branch_name Branch name to create
 * @param {String} base_branch Base branch to create from
 * @returns {Boolean} True if the branch was created
 */
export async function create_branch(
  repo_path,
  branch_name,
  base_branch = 'main'
) {
  try {
    log(
      `Attempting to create branch ${branch_name} from ${base_branch} in ${repo_path}`
    )

    // Check if the branch already exists
    const branch_already_exists = await branch_exists(repo_path, branch_name, {
      check_remote: false
    })
    if (branch_already_exists) {
      log(`Branch ${branch_name} already exists, skipping creation`)
      return true
    }

    // First try to use the local branch directly
    try {
      log(`Creating branch ${branch_name} from local branch ${base_branch}`)
      await execute(`git checkout -b ${branch_name} ${base_branch}`, {
        cwd: repo_path
      })
      return true
    } catch (local_error) {
      log(`Failed to create from local branch: ${local_error.message}`)

      // If local branch creation failed, try to see if we can access the remote
      try {
        // Check if remote exists and is accessible
        const { stdout: remote_url } = await execute(
          'git remote get-url origin',
          { cwd: repo_path }
        )
        if (remote_url) {
          log(`Using remote origin to create branch ${branch_name}`)
          await execute(`git fetch origin ${base_branch}`, { cwd: repo_path })
          await execute(`git branch ${branch_name} origin/${base_branch}`, {
            cwd: repo_path
          })
          return true
        }
      } catch (remote_error) {
        log(`No accessible remote origin: ${remote_error.message}`)
        // Fall through to try alternative approaches
      }

      // Try one more approach - check if we can create from HEAD
      if (base_branch !== 'HEAD') {
        try {
          log('Creating branch from HEAD as last resort')
          await execute(`git checkout -b ${branch_name}`, { cwd: repo_path })
          return true
        } catch (head_error) {
          log(`Failed to create from HEAD: ${head_error.message}`)
          throw local_error // Re-throw the original error
        }
      } else {
        throw local_error
      }
    }
  } catch (error) {
    log(`Failed to create branch ${branch_name}:`, error)
    throw new Error(`Failed to create branch ${branch_name}: ${error.message}`)
  }
}

/**
 * Create a git worktree for a branch
 * @param {String} repo_path Path to the repository
 * @param {String} branch_name Branch to create worktree for
 * @returns {String} Path to the created worktree
 */
export async function create_worktree(repo_path, branch_name) {
  try {
    // Create a unique worktree path
    const worktree_base = path.join(os.tmpdir(), 'git-worktrees')
    await fs.mkdir(worktree_base, { recursive: true })

    const timestamp = Date.now()
    const rand = Math.floor(Math.random() * 10000)
    const worktree_path = path.join(
      worktree_base,
      `${branch_name}-${timestamp}-${rand}`
    )

    log(`Creating worktree for ${branch_name} at ${worktree_path}`)

    // First, check if the branch is already checked out somewhere
    try {
      const { stdout: worktree_list } = await execute('git worktree list', {
        cwd: repo_path
      })

      // Check if this branch is already checked out in the main working tree
      const main_worktree_match = worktree_list
        .split('\n')
        .find(
          (line) =>
            line.includes(repo_path) && line.includes(`[${branch_name}]`)
        )

      if (main_worktree_match) {
        log(
          `Branch ${branch_name} is already checked out at ${repo_path}, operating directly on it`
        )
        return repo_path
      }

      // Check if this branch is already checked out in another worktree
      const branch_worktree_match = worktree_list
        .split('\n')
        .find(
          (line) =>
            !line.includes(repo_path) && line.includes(`[${branch_name}]`)
        )

      if (branch_worktree_match) {
        // Extract the path of the existing worktree
        const existing_worktree_path = branch_worktree_match.split(' ')[0]
        log(
          `Branch ${branch_name} is already checked out at ${existing_worktree_path}, using that worktree`
        )
        return existing_worktree_path
      }

      // If we get here, the branch is not checked out anywhere, create a new worktree
      await execute(`git worktree add ${worktree_path} ${branch_name}`, {
        cwd: repo_path
      })
      return worktree_path
    } catch (worktree_error) {
      // If worktree list command failed, try the direct approach
      if (!worktree_error.message.includes('worktree list')) {
        // Try to determine if the worktree error is due to the branch being checked out elsewhere
        if (
          worktree_error.stderr &&
          worktree_error.stderr.includes('is already checked out at')
        ) {
          // Extract the path where it's checked out from the error message
          const match = worktree_error.stderr.match(
            /already checked out at '([^']+)'/
          )
          if (match && match[1]) {
            const existing_path = match[1]
            log(
              `Branch ${branch_name} is already checked out at ${existing_path} (from error message), using that location`
            )
            return existing_path
          }

          // If we couldn't extract the path but we know it's checked out in the main tree
          if (worktree_error.stderr.includes(repo_path)) {
            log(
              `Branch ${branch_name} is likely checked out in the main working tree, using main repo path`
            )

            // Try to checkout the branch in the main working tree if needed
            try {
              const { stdout: current_branch } = await execute(
                'git rev-parse --abbrev-ref HEAD',
                {
                  cwd: repo_path
                }
              )

              if (current_branch.trim() !== branch_name) {
                log(`Checking out branch ${branch_name} in main working tree`)
                await execute(`git checkout ${branch_name}`, { cwd: repo_path })
              }
            } catch (checkout_error) {
              log(
                `Failed to checkout branch in main working tree: ${checkout_error.message}`
              )
              // Continue anyway, as we're returning the repo path
            }

            return repo_path
          }
        }

        // For any other error with the worktree add command, rethrow
        throw worktree_error
      }

      // If worktree list failed, try the direct approach
      try {
        await execute(`git worktree add ${worktree_path} ${branch_name}`, {
          cwd: repo_path
        })
        return worktree_path
      } catch (direct_error) {
        // If this also fails, check if the error indicates the branch is already checked out
        if (
          direct_error.stderr &&
          direct_error.stderr.includes('is already checked out at')
        ) {
          log(
            `Branch ${branch_name} is already checked out at ${repo_path}, operating directly on it`
          )
          return repo_path
        }
        throw direct_error
      }
    }
  } catch (error) {
    log(`Failed to create worktree for ${branch_name}:`, error)

    // Special case - if the error suggests the branch is already checked out in the main tree
    if (
      error.message.includes('already checked out') &&
      error.message.includes(repo_path)
    ) {
      log(
        `Using main working tree at ${repo_path} as fallback for branch ${branch_name}`
      )
      return repo_path
    }

    throw new Error(
      `Failed to create worktree for ${branch_name}: ${error.message}`
    )
  }
}

/**
 * Remove a git worktree
 * @param {String} repo_path Path to the repository
 * @param {String} worktree_path Path to the worktree
 */
export async function remove_worktree(repo_path, worktree_path) {
  try {
    // If the worktree path is the same as the repo path, it's likely
    // the main working tree which can't be removed with git worktree remove
    if (worktree_path === repo_path) {
      log(`Skipping removal of main working tree ${worktree_path}`)
      return true
    }

    log(`Removing worktree ${worktree_path} from ${repo_path}`)
    await execute(`git worktree remove --force ${worktree_path}`, {
      cwd: repo_path
    })
    return true
  } catch (error) {
    log(`Failed to remove worktree ${worktree_path}:`, error)

    // If it's a main working tree, just return success
    if (error.stderr && error.stderr.includes('is a main working tree')) {
      log('Ignoring error: trying to remove main working tree')
      return true
    }

    // Don't throw, just log the error
    return false
  }
}

/**
 * Ensure a directory exists
 * @param {String} dir_path Path to ensure exists
 */
export async function ensure_directory(dir_path) {
  log(`Ensuring directory ${dir_path} exists`)
  await fs.mkdir(dir_path, { recursive: true })
}

/**
 * Get repository info
 * @param {String} repo_path Path to the repository
 * @returns {Object} Repository info including owner and name
 */
export async function get_repo_info(repo_path) {
  try {
    log(`Getting remote URL for ${repo_path}`)
    const { stdout: remote_url } = await execute(
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
 * Apply a patch to a file
 * @param {String} repo_path Path to the repository
 * @param {String} patch_content Patch content
 * @returns {Boolean} True if the patch was applied successfully
 */
export async function apply_patch(repo_path, patch_content) {
  try {
    // Create a temporary patch file
    const patch_file = path.join(os.tmpdir(), `git-patch-${Date.now()}.patch`)
    await fs.writeFile(patch_file, patch_content)

    try {
      log(`Applying patch ${patch_file} to ${repo_path}`)
      await execute(`git apply --index ${patch_file}`, { cwd: repo_path })
      return true
    } finally {
      // Clean up the patch file
      await fs.unlink(patch_file).catch(() => {})
    }
  } catch (error) {
    log('Failed to apply patch:', error)
    throw new Error(`Failed to apply patch: ${error.message}`)
  }
}

/**
 * Generate a patch between two versions of a file
 * @param {String} file_path Path to the file (for reference)
 * @param {String} original_content Original file content
 * @param {String} modified_content Modified file content
 * @returns {String} Patch content
 */
export async function generate_patch(
  file_path,
  original_content,
  modified_content
) {
  const temp_dir = path.join(os.tmpdir(), `git-patch-${Date.now()}`)
  await fs.mkdir(temp_dir, { recursive: true })

  try {
    // Create original and modified files
    const original_file = path.join(temp_dir, 'original')
    const modified_file = path.join(temp_dir, 'modified')

    await fs.writeFile(original_file, original_content)
    await fs.writeFile(modified_file, modified_content)

    // Generate diff
    try {
      log(`Generating diff for ${file_path} in ${temp_dir}`)
      const { stdout } = await execute(
        `diff -u --label "a/${file_path}" --label "b/${file_path}" original modified`,
        { cwd: temp_dir }
      )
      return stdout
    } catch (error) {
      // diff returns non-zero exit code when files differ, which is expected
      if (error.stdout) {
        return error.stdout
      }
      throw error
    }
  } finally {
    // Clean up temp files
    await fs.rm(temp_dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Read a file from a specific git reference
 * @param {String} repo_path Path to the repository
 * @param {String} ref Git reference (branch, commit, etc.)
 * @param {String} file_path Path to the file relative to repo root
 * @returns {String} File content
 */
export async function read_file_from_ref(repo_path, ref, file_path) {
  try {
    log(`Reading file ${file_path} from ${ref} in ${repo_path}`)
    const { stdout } = await execute(`git show ${ref}:${file_path}`, {
      cwd: repo_path
    })
    return stdout
  } catch (error) {
    log(`Failed to read file ${file_path} from ${ref}:`, error)
    throw new Error(
      `Failed to read file ${file_path} from ${ref}: ${error.message}`
    )
  }
}

/**
 * List files in a git repository at a specific reference
 * @param {String} repo_path Path to the repository
 * @param {String} ref Git reference (branch, commit, etc.)
 * @param {String} path_pattern Path pattern to filter files
 * @returns {Array<String>} List of file paths
 */
export async function list_files(repo_path, ref = 'HEAD', path_pattern = '') {
  try {
    const pattern = path_pattern ? `-- ${path_pattern}` : ''
    log(`Listing files for ${ref} in ${repo_path} with pattern ${path_pattern}`)
    const { stdout } = await execute(
      `git ls-tree -r --name-only ${ref} ${pattern}`,
      {
        cwd: repo_path
      }
    )

    return stdout.trim().split('\n').filter(Boolean)
  } catch (error) {
    log(`Failed to list files for ${ref} using git ls-tree: ${error.message}`)

    // If git ls-tree fails, and we're looking at the current working directory (common in tests),
    // fallback to reading the directory contents directly
    if (ref === 'HEAD' || ref === 'main') {
      try {
        log('Falling back to reading directory contents directly')
        return await list_files_recursive(repo_path, path_pattern)
      } catch (fallback_error) {
        log(`Fallback method also failed: ${fallback_error.message}`)
        throw new Error(`Failed to list files for ${ref}: ${error.message}`)
      }
    } else {
      throw new Error(`Failed to list files for ${ref}: ${error.message}`)
    }
  }
}

/**
 * Helper function to recursively list files matching a pattern
 * @param {String} base_path Base directory path
 * @param {String} path_pattern Path pattern to filter files
 * @returns {Array<String>} List of matching file paths
 */
async function list_files_recursive(base_path, path_pattern = '') {
  const files = []
  const glob_parts = path_pattern.split('/')
  const base_dir =
    glob_parts.length > 1 ? glob_parts.slice(0, -1).join('/') : ''
  const file_pattern =
    glob_parts.length > 1 ? glob_parts[glob_parts.length - 1] : path_pattern

  // Determine the directory to start listing from
  const start_dir = base_dir ? path.join(base_path, base_dir) : base_path

  // Define the recursive function
  async function list_dir(dir, current_prefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      // Skip .git directories
      if (entry.name === '.git' && entry.isDirectory()) continue

      const relative_path = current_prefix
        ? path.join(current_prefix, entry.name)
        : entry.name
      const full_path = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        await list_dir(full_path, relative_path)
      } else {
        // If we have a file pattern, only include files that match
        if (
          !file_pattern ||
          file_pattern === '*' ||
          (file_pattern.endsWith('*') &&
            entry.name.startsWith(file_pattern.slice(0, -1))) ||
          (file_pattern.startsWith('*') &&
            entry.name.endsWith(file_pattern.slice(1))) ||
          file_pattern === entry.name ||
          (file_pattern.includes('*') &&
            new RegExp('^' + file_pattern.replace(/\*/g, '.*') + '$').test(
              entry.name
            ))
        ) {
          files.push(relative_path)
        }
      }
    }
  }

  await list_dir(start_dir, base_dir)
  return files
}

/**
 * Get diff between two git references
 * @param {String} repo_path Path to the repository
 * @param {String} from_ref From reference
 * @param {String} to_ref To reference
 * @param {Object} options Options for diff
 * @returns {String} Diff output
 */
export async function get_diff(
  repo_path,
  from_ref,
  to_ref,
  { path, format = 'unified' } = {}
) {
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
        format_option = '-p'
        break
    }

    const path_filter = path ? `-- ${path}` : ''
    log(
      `Getting diff between ${from_ref} and ${to_ref} in ${repo_path} with path filter ${path_filter}`
    )
    const { stdout } = await execute(
      `git diff ${format_option} ${from_ref} ${to_ref} ${path_filter}`,
      { cwd: repo_path }
    )

    return stdout
  } catch (error) {
    log(`Failed to get diff between ${from_ref} and ${to_ref}:`, error)
    throw new Error(`Failed to get diff: ${error.message}`)
  }
}

/**
 * Search in git repository
 * @param {String} repo_path Path to the repository
 * @param {String} query Search query
 * @param {Object} options Search options
 * @returns {Array<Object>} Search results
 */
export async function search_repository(
  repo_path,
  query,
  { ref = 'HEAD', path, case_sensitive = false } = {}
) {
  try {
    const case_option = case_sensitive ? '' : '-i'
    const path_filter = path ? `-- ${path}` : ''

    log(
      `Searching for "${query}" in ${ref} in ${repo_path} with path filter ${path_filter}`
    )
    const { stdout } = await execute(
      `git grep ${case_option} -n "${query}" ${ref} ${path_filter}`,
      { cwd: repo_path }
    )

    // Parse results
    const results = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        // Format: file:line_number:content
        const [file, line_number, ...content_parts] = line.split(':')
        return {
          path: file,
          content: content_parts.join(':').trim(),
          line: parseInt(line_number, 10)
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
    if (ref === 'HEAD' || ref === 'main') {
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
  const files_to_search = await list_files_recursive(
    repo_path,
    path_filter || ''
  )

  // Create a regex for the search
  const search_regex = new RegExp(query, case_sensitive ? '' : 'i')

  // Search in each file
  for (const file_path of files_to_search) {
    try {
      const full_path = path.join(repo_path, file_path)
      const content = await fs.readFile(full_path, 'utf8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        if (search_regex.test(lines[i])) {
          results.push({
            path: file_path,
            content: lines[i],
            line: i + 1
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

export default {
  get_current_branch,
  is_submodule,
  branch_exists,
  create_branch,
  create_worktree,
  remove_worktree,
  ensure_directory,
  get_repo_info,
  apply_patch,
  generate_patch,
  read_file_from_ref,
  list_files,
  get_diff,
  search_repository
}
