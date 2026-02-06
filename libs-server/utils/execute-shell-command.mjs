import { promisify } from 'util'
import { exec } from 'child_process'
import path from 'path'

import { directory_exists_in_filesystem_sync } from '#libs-server/filesystem/directory-exists-in-filesystem-sync.mjs'
import { validate_shell_command } from '#libs-server/utils/validate-shell-command.mjs'

const DEFAULT_TIMEOUT_MS = 30_000

// Explicitly provide the shell path in the options and verify the working directory exists
export const execute_shell_command = (cmd, options = {}) => {
  // Validate command for shell metacharacter injection
  validate_shell_command(cmd)

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
    timeout: DEFAULT_TIMEOUT_MS,
    ...options
  })
}
