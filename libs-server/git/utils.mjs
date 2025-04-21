import { promisify } from 'util'
import { exec } from 'child_process'
import debug from 'debug'
import fs from 'fs'
import path from 'path'

export const log = debug('git')

// Explicitly provide the shell path in the options and verify the working directory exists
export const execute = (cmd, options = {}) => {
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

export default {
  log,
  execute
}
