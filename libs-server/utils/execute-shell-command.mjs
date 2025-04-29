import { promisify } from 'util'
import { exec } from 'child_process'
import path from 'path'
import { directory_exists_in_filesystem_sync } from '#libs-server/filesystem/directory-exists-in-filesystem-sync.mjs'

// Explicitly provide the shell path in the options and verify the working directory exists
export const execute_shell_command = (cmd, options = {}) => {
  // Check if cwd exists
  if (options.cwd) {
    const cwd_path = path.resolve(options.cwd)
    if (
      !directory_exists_in_filesystem_sync({
        absolute_path: cwd_path
      })
    ) {
      throw new Error(
        `Working directory does not exist or cannot be accessed: ${cwd_path}`
      )
    }
  }

  return promisify(exec)(cmd, {
    ...options
  })
}
