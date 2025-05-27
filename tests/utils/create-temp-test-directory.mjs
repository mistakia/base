import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'

/**
 * Creates a temporary directory for test purposes
 *
 * @param {string} prefix - Optional prefix for the temp directory
 * @returns {Object} Object with dir path and cleanup function
 */
export function create_temp_test_directory(prefix = 'base-test-') {
  const temp_dir = path.join(os.tmpdir(), `${prefix}${uuid()}`)

  // Create the directory
  fs.mkdirSync(temp_dir, { recursive: true })

  // Return path and cleanup function
  return {
    path: temp_dir,
    cleanup: () => {
      // Recursive function to delete directory contents
      const remove_directory_recursive = (dir_path) => {
        if (fs.existsSync(dir_path)) {
          fs.readdirSync(dir_path).forEach((entry) => {
            const entry_path = path.join(dir_path, entry)
            if (fs.lstatSync(entry_path).isDirectory()) {
              remove_directory_recursive(entry_path)
            } else {
              fs.unlinkSync(entry_path)
            }
          })
          fs.rmdirSync(dir_path)
        }
      }

      // Delete the temporary directory
      try {
        remove_directory_recursive(temp_dir)
      } catch (error) {
        console.error(`Error cleaning up temp directory ${temp_dir}:`, error)
      }
    }
  }
}

export default create_temp_test_directory
