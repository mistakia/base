import debug from 'debug'

import { execute_git_command } from '#libs-server/git/execute-git-command.mjs'

const log = debug('git:commit-operations')

const to_array = (files) => (Array.isArray(files) ? files : [files])

/**
 * Stage files in the repository/worktree
 * @param {Object} params Parameters
 * @param {String} params.worktree_path Path to the worktree or repository
 * @param {Array<String>|String} params.files_to_add Path(s) of files to stage relative to worktree_path
 * @returns {Promise<Boolean>} True if successful
 */
export async function add_files({ worktree_path, files_to_add }) {
  const files = to_array(files_to_add)
  try {
    log(`Staging files: ${files.join(' ')} in ${worktree_path}`)
    await execute_git_command(['add', '--', ...files], {
      cwd: worktree_path
    })
    return true
  } catch (error) {
    log(`Failed to stage files in ${worktree_path}:`, error)
    throw new Error(
      `Failed to stage files: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Commit staged changes in the repository/worktree
 * @param {String} worktree_path Path to the worktree or repository
 * @param {String} commit_message Commit message
 * @param {Object} [options] Options like author
 * @param {String} [options.author] Author string in format "Name <email@example.com>"
 * @returns {Promise<Boolean>} True if successful
 */
export async function commit_changes({
  worktree_path,
  commit_message,
  author
}) {
  try {
    log(
      `Committing changes in ${worktree_path} with message: "${commit_message}"`
    )
    const args = ['commit', '-m', commit_message]
    if (author) {
      args.push('--author', author)
    }
    await execute_git_command(args, { cwd: worktree_path })
    return true
  } catch (error) {
    // Check if the error is because there's nothing to commit
    if (error.stderr && error.stderr.includes('nothing to commit')) {
      log('No changes to commit.')
      return true // Consider this a success in this context
    }
    log(`Failed to commit changes in ${worktree_path}:`, error)
    throw new Error(
      `Failed to commit changes: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Unstage files from the index
 * @param {Object} params Parameters
 * @param {String} params.worktree_path Path to the worktree or repository
 * @param {Array<String>|String} params.files_to_unstage Path(s) of files to unstage relative to worktree_path
 * @returns {Promise<Boolean>} True if successful
 */
export async function unstage_files({ worktree_path, files_to_unstage }) {
  const files = to_array(files_to_unstage)
  try {
    log(`Unstaging files: ${files.join(' ')} in ${worktree_path}`)
    await execute_git_command(['reset', 'HEAD', '--', ...files], {
      cwd: worktree_path
    })
    return true
  } catch (error) {
    log(`Failed to unstage files in ${worktree_path}:`, error)
    throw new Error(
      `Failed to unstage files: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Discard changes to a file in the working tree
 * @param {Object} params Parameters
 * @param {String} params.worktree_path Path to the worktree or repository
 * @param {Array<String>|String} params.files_to_discard Path(s) of files to discard changes
 * @returns {Promise<Boolean>} True if successful
 */
export async function discard_changes({ worktree_path, files_to_discard }) {
  const files = to_array(files_to_discard)
  try {
    log(`Discarding changes to: ${files.join(' ')} in ${worktree_path}`)
    await execute_git_command(['checkout', '--', ...files], {
      cwd: worktree_path
    })
    return true
  } catch (error) {
    log(`Failed to discard changes in ${worktree_path}:`, error)
    throw new Error(
      `Failed to discard changes: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

export default {
  add_files,
  commit_changes,
  unstage_files,
  discard_changes
}
