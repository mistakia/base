import { promisify } from 'util'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'

// Explicitly provide the shell path in the options and verify the working directory exists
export const execute_shell_command = (cmd, options = {}) => {
  // Check if cwd exists
  if (options.cwd) {
    const cwd_path = path.resolve(options.cwd)
    if (!fs.existsSync(cwd_path)) {
      throw new Error(`Working directory does not exist: ${cwd_path}`)
    }
  }

  return promisify(exec)(cmd, {
    ...options
  })
}
