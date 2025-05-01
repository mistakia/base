import debug from 'debug'

import { branch_exists } from '../branch-operations.mjs'
import { read_file_from_ref } from '../file-operations.mjs'

const log = debug('libs-server:git:file-exists-in-git')

export async function file_exists_in_git({ repo_path, file_path, branch }) {
  if (!repo_path) {
    throw new Error('Repository path is required')
  }

  if (!file_path) {
    throw new Error('File path is required')
  }

  if (!branch) {
    throw new Error('Branch is required')
  }

  try {
    log(
      `Checking if file ${file_path} exists in branch ${branch} at ${repo_path}`
    )

    // Check if branch exists - fail if it doesn't
    const branch_check = await branch_exists({
      repo_path,
      branch_name: branch,
      check_remote: false
    })

    if (!branch_check) {
      throw new Error(`Branch ${branch} does not exist`)
    }

    // Try to read the file content - if it succeeds, the file exists
    try {
      await read_file_from_ref({
        repo_path,
        ref: branch,
        file_path
      })

      log(`File ${file_path} exists in branch ${branch}`)
      return {
        success: true,
        exists: true,
        branch,
        file_path
      }
    } catch (error) {
      // If file doesn't exist, return success but exists: false
      if (error.message.includes('does not exist')) {
        log(`File ${file_path} does not exist in branch ${branch}`)
        return {
          success: true,
          exists: false,
          branch,
          file_path
        }
      }
      // For other errors, throw them to be caught by outer try-catch
      throw error
    }
  } catch (error) {
    log(`Error checking file existence for ${file_path}:`, error)
    return {
      success: false,
      error: error.message,
      file_path
    }
  }
}
