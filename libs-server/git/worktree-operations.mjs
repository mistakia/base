import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('git:worktree-operations')

/**
 * Create a git worktree for a branch
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.branch_name Branch to create worktree for
 * @returns {String} Path to the created worktree
 */
export async function create_worktree({ repo_path, branch_name }) {
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
      const { stdout: worktree_list } = await execute_shell_command(
        'git worktree list',
        {
          cwd: repo_path
        }
      )

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
      await execute_shell_command(
        `git worktree add ${worktree_path} ${branch_name}`,
        {
          cwd: repo_path
        }
      )
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
              const { stdout: current_branch } = await execute_shell_command(
                'git rev-parse --abbrev-ref HEAD',
                {
                  cwd: repo_path
                }
              )

              if (current_branch.trim() !== branch_name) {
                log(`Checking out branch ${branch_name} in main working tree`)
                await execute_shell_command(`git checkout ${branch_name}`, {
                  cwd: repo_path
                })
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
        await execute_shell_command(
          `git worktree add ${worktree_path} ${branch_name}`,
          {
            cwd: repo_path
          }
        )
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
      `Failed to create worktree for ${branch_name}: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Remove a git worktree
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.worktree_path Path to the worktree
 */
export async function remove_worktree({ repo_path, worktree_path }) {
  try {
    // If the worktree path is the same as the repo path, it's likely
    // the main working tree which can't be removed with git worktree remove
    if (worktree_path === repo_path) {
      log(`Skipping removal of main working tree ${worktree_path}`)
      return true
    }

    log(`Removing worktree ${worktree_path} from ${repo_path}`)
    await execute_shell_command(
      `git worktree remove --force ${worktree_path}`,
      {
        cwd: repo_path
      }
    )
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

export default {
  create_worktree,
  remove_worktree
}
