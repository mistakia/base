import debug from 'debug'
import fs from 'fs/promises'

const log = debug('filesystem:atomic')

/**
 * Execute a callback with file-based atomic operations
 * Provides basic rollback capability for file operations
 *
 * @param {Function} callback Function to execute atomically
 * @returns {any} Result of the callback
 */
export async function with_transaction(callback) {
  const backup_files = new Map()

  // Create a mock transaction object with rollback capability
  const file_transaction = {
    // Method to backup a file before modification
    async backup_file(file_path) {
      try {
        const backup_content = await fs.readFile(file_path, 'utf8')
        backup_files.set(file_path, backup_content)
      } catch (err) {
        // File might not exist, store null to indicate this
        backup_files.set(file_path, null)
      }
    },

    // Method to restore all backed up files
    async rollback() {
      log('Rolling back file operations for %d files', backup_files.size)
      for (const [file_path, backup_content] of backup_files) {
        try {
          if (backup_content === null) {
            // File didn't exist before, remove it
            await fs.unlink(file_path)
          } else {
            // Restore original content
            await fs.writeFile(file_path, backup_content)
          }
        } catch (err) {
          log('Rollback error for %s: %o', file_path, err)
        }
      }
    }
  }

  try {
    const result = await callback(file_transaction)
    // Success - no rollback needed
    return result
  } catch (error) {
    log('File transaction error, rolling back: %o', error)
    await file_transaction.rollback()
    throw error
  }
}

export default with_transaction
