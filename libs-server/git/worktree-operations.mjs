import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import debug from 'debug'

import { execute_git_command } from '#libs-server/git/execute-git-command.mjs'

const log = debug('git:worktree-operations')

/**
 * Create a git worktree for a branch. If the branch is already checked out
 * (in the main working tree or another worktree), returns that existing path
 * instead of creating a new one.
 *
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.branch_name Branch to create worktree for
 * @returns {String} Path to the worktree (new or existing)
 */
export async function create_worktree({ repo_path, branch_name }) {
  const worktree_base = path.join(os.tmpdir(), 'git-worktrees')
  await fs.mkdir(worktree_base, { recursive: true })

  const timestamp = Date.now()
  const rand = Math.floor(Math.random() * 10000)
  const worktree_path = path.join(
    worktree_base,
    `${branch_name}-${timestamp}-${rand}`
  )

  log(`Creating worktree for ${branch_name} at ${worktree_path}`)

  const { stdout: worktree_list } = await execute_git_command(
    ['worktree', 'list'],
    { cwd: repo_path }
  )

  // `git worktree list` output: "<path>  <sha> [<branch>]" per line.
  for (const line of worktree_list.split('\n')) {
    if (!line.includes(`[${branch_name}]`)) continue
    if (line.includes(repo_path)) {
      log(`Branch ${branch_name} is checked out at main worktree ${repo_path}`)
      return repo_path
    }
    const existing_path = line.split(' ')[0]
    log(`Branch ${branch_name} is checked out at ${existing_path}`)
    return existing_path
  }

  try {
    await execute_git_command(
      ['worktree', 'add', worktree_path, branch_name],
      { cwd: repo_path }
    )
    return worktree_path
  } catch (error) {
    // Race: branch became checked out between our list and add. Recover by
    // using the path git reports.
    const match = error.stderr?.match(/already checked out at '([^']+)'/)
    if (match) {
      log(
        `Branch ${branch_name} concurrently checked out at ${match[1]}; using it`
      )
      return match[1]
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
    await execute_git_command(
      ['worktree', 'remove', '--force', worktree_path],
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
