import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('git:file-operations')

/**
 * Apply a patch to a file
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.patch_content Patch content
 * @returns {Boolean} True if the patch was applied successfully
 */
export async function apply_patch({ repo_path, patch_content }) {
  try {
    // Create a temporary patch file
    const patch_file = path.join(os.tmpdir(), `git-patch-${Date.now()}.patch`)
    await fs.writeFile(patch_file, patch_content)

    try {
      log(`Applying patch ${patch_file} to ${repo_path}`)
      await execute_shell_command(`git apply --index ${patch_file}`, {
        cwd: repo_path
      })
      return true
    } finally {
      // Clean up the patch file
      await fs.unlink(patch_file).catch(() => {})
    }
  } catch (error) {
    log('Failed to apply patch:', error)
    throw new Error(
      `Failed to apply patch: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Delete a file and stage the deletion using git rm
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository or worktree
 * @param {String} params.file_path Path to the file relative to repo_path
 * @param {Boolean} [params.force=false] Force removal even if file has local modifications
 * @returns {Promise<Boolean>} True if the file was deleted and staged successfully
 */
export async function delete_file({ repo_path, file_path, force = false }) {
  try {
    const force_flag = force ? ' -f' : ''
    log(`Deleting file ${file_path} in ${repo_path}${force ? ' (forced)' : ''}`)

    // Use git rm to both delete the file and stage the deletion
    await execute_shell_command(`git rm${force_flag} ${file_path}`, {
      cwd: repo_path
    })
    return true
  } catch (error) {
    log(`Failed to delete file ${file_path}:`, error)
    throw new Error(
      `Failed to delete file ${file_path}: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * Generate a patch between two versions of a file
 * @param {Object} params Parameters
 * @param {String} params.file_path Path to the file (for reference)
 * @param {String} params.original_content Original file content
 * @param {String} params.modified_content Modified file content
 * @returns {String} Patch content
 */
export async function generate_patch({
  file_path,
  original_content,
  modified_content
}) {
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
      const { stdout } = await execute_shell_command(
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
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} params.ref Git reference (branch, commit, etc.)
 * @param {String} params.file_path Path to the file relative to repo root
 * @returns {String} File content
 */
export async function read_file_from_ref({ repo_path, ref, file_path }) {
  try {
    log(`Reading file ${file_path} from ${ref} in ${repo_path}`)
    const { stdout } = await execute_shell_command(
      `git show ${ref}:${file_path}`,
      {
        cwd: repo_path
      }
    )
    return stdout
  } catch (error) {
    log(`Failed to read file ${file_path} from ${ref}:`, error)
    throw new Error(
      `Failed to read file ${file_path} from ${ref}: ${error.message} - ${error.stderr || error.stdout || error}`
    )
  }
}

/**
 * List files in a git repository at a specific reference
 * @param {Object} params Parameters
 * @param {String} params.repo_path Path to the repository
 * @param {String} [params.ref='HEAD'] Git reference (branch, commit, etc.)
 * @param {String} [params.path_pattern=''] Path pattern to filter files
 * @returns {Array<String>} List of file paths
 */
export async function list_files({
  repo_path,
  ref = 'HEAD',
  path_pattern = ''
}) {
  try {
    const pattern = path_pattern ? `-- ${path_pattern}` : ''
    log(`Listing files for ${ref} in ${repo_path} with pattern ${path_pattern}`)
    const { stdout } = await execute_shell_command(
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
        throw new Error(
          `Failed to list files for ${ref}: ${fallback_error.message} - ${fallback_error.stderr || fallback_error.stdout || fallback_error}`
        )
      }
    } else {
      throw new Error(
        `Failed to list files for ${ref}: ${error.message} - ${error.stderr || error.stdout || error}`
      )
    }
  }
}

/**
 * Helper function to recursively list files matching a pattern
 * @param {String} base_path Base directory path
 * @param {String} path_pattern Path pattern to filter files
 * @returns {Array<String>} List of matching file paths
 */
export async function list_files_recursive(base_path, path_pattern = '') {
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

export default {
  apply_patch,
  generate_patch,
  read_file_from_ref,
  list_files,
  list_files_recursive,
  delete_file
}
