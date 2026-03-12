import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('git:sync')

/**
 * Pull from remote with optional stash/unstash of uncommitted changes
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @param {string} [params.remote='origin'] Remote name
 * @param {string} [params.branch] Branch to pull (defaults to current branch's upstream)
 * @param {boolean} [params.stash_changes=true] Whether to stash uncommitted changes before pull
 * @returns {Promise<Object>} Pull result with details
 */
export async function pull({
  repo_path,
  remote = 'origin',
  branch,
  stash_changes = true
}) {
  try {
    log(`Pulling from ${remote}${branch ? `/${branch}` : ''} in ${repo_path}`)

    let stashed = false
    let stash_message = null

    // Check for uncommitted changes
    const { stdout: status_output } = await execute_shell_command(
      'git status --porcelain',
      { cwd: repo_path }
    )
    const has_changes = status_output.trim().length > 0

    // Stash changes if needed
    if (has_changes && stash_changes) {
      stash_message = `auto-stash before pull ${new Date().toISOString()}`
      log(`Stashing changes: ${stash_message}`)
      await execute_shell_command(`git stash push -m "${stash_message}"`, {
        cwd: repo_path
      })
      stashed = true
    } else if (has_changes && !stash_changes) {
      throw new Error(
        'Cannot pull with uncommitted changes. Set stash_changes=true or commit/stash manually.'
      )
    }

    // Fetch first to see what's coming
    await execute_shell_command(`git fetch ${remote}`, { cwd: repo_path })

    // Get current HEAD
    const { stdout: head_before } = await execute_shell_command(
      'git rev-parse HEAD',
      { cwd: repo_path }
    )

    // Perform the pull (always rebase to maintain linear history)
    const pull_command = branch
      ? `git pull --rebase ${remote} ${branch}`
      : `git pull --rebase ${remote}`

    let pull_result
    let had_conflicts = false

    try {
      const { stdout, stderr } = await execute_shell_command(pull_command, {
        cwd: repo_path
      })
      pull_result = { stdout, stderr }
    } catch (error) {
      // Check if this is a merge conflict
      if (
        error.stderr?.includes('CONFLICT') ||
        error.stdout?.includes('CONFLICT')
      ) {
        had_conflicts = true
        pull_result = { stdout: error.stdout, stderr: error.stderr }
      } else {
        // Restore stash if we stashed
        if (stashed) {
          try {
            await execute_shell_command('git stash pop', { cwd: repo_path })
          } catch (stash_error) {
            log(`Warning: Failed to restore stash: ${stash_error.message}`)
          }
        }
        throw error
      }
    }

    // Get new HEAD
    const { stdout: head_after } = await execute_shell_command(
      'git rev-parse HEAD',
      { cwd: repo_path }
    )

    // Count commits pulled
    let commits_pulled = 0
    if (head_before.trim() !== head_after.trim() && !had_conflicts) {
      try {
        const { stdout: log_output } = await execute_shell_command(
          `git rev-list --count ${head_before.trim()}..${head_after.trim()}`,
          { cwd: repo_path }
        )
        commits_pulled = parseInt(log_output.trim(), 10) || 0
      } catch {
        // If this fails, it's not critical
      }
    }

    // Restore stash if we stashed
    let stash_restore_result = null
    if (stashed) {
      try {
        const { stdout, stderr } = await execute_shell_command(
          'git stash pop',
          {
            cwd: repo_path
          }
        )
        stash_restore_result = { success: true, stdout, stderr }
      } catch (stash_error) {
        stash_restore_result = {
          success: false,
          error: stash_error.message,
          stdout: stash_error.stdout,
          stderr: stash_error.stderr
        }
        log(`Warning: Stash pop had issues: ${stash_error.message}`)
      }
    }

    return {
      success: !had_conflicts,
      had_conflicts,
      commits_pulled,
      stashed,
      stash_restore_result,
      head_before: head_before.trim(),
      head_after: head_after.trim(),
      output: pull_result.stdout,
      error_output: pull_result.stderr
    }
  } catch (error) {
    log(`Failed to pull in ${repo_path}:`, error)
    throw new Error(
      `Failed to pull: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Fetch from remote without merging
 * @param {Object} params Parameters
 * @param {string} params.repo_path Path to the repository
 * @param {string} [params.remote='origin'] Remote name
 * @param {string} [params.branch] Specific branch to fetch
 * @returns {Promise<Object>} Fetch result
 */
export async function fetch_remote({ repo_path, remote = 'origin', branch }) {
  try {
    const fetch_command = branch
      ? `git fetch ${remote} ${branch}`
      : `git fetch ${remote}`

    log(`Fetching from ${remote}${branch ? `/${branch}` : ''} in ${repo_path}`)

    const { stdout, stderr } = await execute_shell_command(fetch_command, {
      cwd: repo_path
    })

    return {
      success: true,
      output: stdout,
      error_output: stderr
    }
  } catch (error) {
    log(`Failed to fetch in ${repo_path}:`, error)
    throw new Error(
      `Failed to fetch: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

export default {
  pull,
  fetch_remote
}
