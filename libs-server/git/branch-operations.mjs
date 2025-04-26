import { log, execute } from './utils.mjs'

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
 * Check if a branch exists locally or remotely
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.branch_name Branch name to check
 * @param {Boolean} [params.check_remote=true] Whether to check remote branches
 * @returns {Boolean} True if the branch exists
 */
export async function branch_exists({
  repo_path,
  branch_name,
  check_remote = true
}) {
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
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.branch_name Branch name to create
 * @param {String} [params.base_branch='main'] Base branch to create from
 * @returns {Boolean} True if the branch was created
 */
export async function create_branch({
  repo_path,
  branch_name,
  base_branch = 'main'
}) {
  try {
    log(
      `Attempting to create branch ${branch_name} from ${base_branch} in ${repo_path}`
    )

    // Check if the branch already exists
    const branch_already_exists = await branch_exists({
      repo_path,
      branch_name,
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
    throw new Error(
      `Failed to create branch ${branch_name}: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Checkout a branch in the repository
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.branch_name Branch name to checkout
 * @returns {Promise<Boolean>} True if successful
 */
export async function checkout_branch({ repo_path, branch_name }) {
  try {
    log(`Checking out branch ${branch_name} in ${repo_path}`)
    await execute(`git checkout ${branch_name}`, { cwd: repo_path })
    return true
  } catch (error) {
    log(`Failed to checkout branch ${branch_name}:`, error)
    throw new Error(
      `Failed to checkout branch ${branch_name}: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Merge a branch into the current branch
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.branch_to_merge Branch to merge into the current branch
 * @param {String} params.merge_message Custom merge message
 * @returns {Promise<Object>} Object containing success status and merge commit hash
 */
export async function merge_branch({
  repo_path,
  branch_to_merge,
  merge_message
}) {
  try {
    log(`Merging ${branch_to_merge} into current branch`)

    const temp_msg_file = `/tmp/git-merge-msg-${Date.now()}`
    await import('fs/promises').then((fs) =>
      fs.writeFile(temp_msg_file, merge_message)
    )

    // Execute the merge with the message file
    await execute(
      `git merge --no-ff -F "${temp_msg_file}" ${branch_to_merge}`,
      {
        cwd: repo_path
      }
    )

    // Clean up the temporary file
    await import('fs/promises').then((fs) =>
      fs.unlink(temp_msg_file).catch(() => {})
    )

    // Get the hash of the merge commit (HEAD after merge)
    const { stdout: commit_hash } = await execute('git rev-parse HEAD', {
      cwd: repo_path
    })

    return {
      success: true,
      merge_commit_hash: commit_hash.trim()
    }
  } catch (error) {
    log(`Failed to merge branch ${branch_to_merge}:`, error)
    throw new Error(
      `Failed to merge branch ${branch_to_merge}: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Delete a branch from the repository
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.branch_name Branch name to delete
 * @param {Boolean} [params.force=false] Force delete even if not merged
 * @returns {Promise<Boolean>} True if successful
 */
export async function delete_branch({ repo_path, branch_name, force = false }) {
  try {
    const force_option = force ? '-D' : '-d'
    log(`Deleting branch ${branch_name} from ${repo_path}`)
    await execute(`git branch ${force_option} ${branch_name}`, {
      cwd: repo_path
    })
    return true
  } catch (error) {
    log(`Failed to delete branch ${branch_name}:`, error)

    // If deletion fails because branch is not fully merged, and force=false
    if (error.stderr && error.stderr.includes('not fully merged') && !force) {
      log(
        `Branch ${branch_name} is not fully merged, use force=true to delete anyway`
      )
      return false
    }

    throw new Error(
      `Failed to delete branch ${branch_name}: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Push a branch to a remote repository
 * @param {Object} params - Parameters for pushing the branch
 * @param {String} params.repo_path - Path to the repository
 * @param {String} params.branch_name - Branch name to push
 * @param {String} [params.remote='origin'] - Remote name
 * @param {Boolean} [params.force=false] - Whether to force push
 * @returns {Promise<Boolean>} True if successful
 */
export async function push_branch({
  repo_path,
  branch_name,
  remote = 'origin',
  force = false
}) {
  try {
    const force_option = force ? '--force' : ''
    log(`Pushing branch ${branch_name} to ${remote} from ${repo_path}`)
    await execute(`git push ${force_option} ${remote} ${branch_name}`, {
      cwd: repo_path
    })
    return true
  } catch (error) {
    log(`Failed to push branch ${branch_name}:`, error)
    throw new Error(
      `Failed to push branch ${branch_name}: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

export default {
  get_current_branch,
  branch_exists,
  create_branch,
  checkout_branch,
  merge_branch,
  delete_branch,
  push_branch
}
