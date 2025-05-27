import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('git:commit-operations')

/**
 * Stage files in the repository/worktree
 * @param {Object} params Parameters
 * @param {String} params.worktree_path Path to the worktree or repository
 * @param {Array<String>|String} params.files_to_add Path(s) of files to stage relative to worktree_path
 * @returns {Promise<Boolean>} True if successful
 */
export async function add_files({ worktree_path, files_to_add }) {
  try {
    const files_string = Array.isArray(files_to_add)
      ? files_to_add.join(' ')
      : files_to_add
    log(`Staging files: ${files_string} in ${worktree_path}`)
    await execute_shell_command(`git add ${files_string}`, {
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
    let command = `git commit -m "${commit_message.replace(/"/g, '\\"')}"` // Escape double quotes in message
    if (author) {
      command += ` --author="${author.replace(/"/g, '\\"')}"` // Escape double quotes in author
    }
    await execute_shell_command(command, { cwd: worktree_path })
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

export default {
  add_files,
  commit_changes
}
