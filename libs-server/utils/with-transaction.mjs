import { promises as fs } from 'fs'
import debug from 'debug'

import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'

const log = debug('base:transaction')

/**
 * Execute an operation with file-level transaction support.
 * Tracks all file writes and deletes, rolling back on error.
 *
 * @param {Function} operation - Async function receiving a transaction object
 *   with write_file(path, content) and delete_file(path) methods
 * @returns {Promise<*>} The return value of the operation
 */
export async function with_transaction(operation) {
  const backups = []

  const transaction = {
    /**
     * Write a file with automatic backup of the original.
     * @param {string} file_path - Absolute path
     * @param {string} content - File content to write
     */
    async write_file(file_path, content) {
      // Backup existing content (or record that file did not exist)
      try {
        const existing = await fs.readFile(file_path, 'utf8')
        backups.push({ file_path, content: existing, existed: true })
      } catch {
        backups.push({ file_path, content: null, existed: false })
      }

      await write_file_to_filesystem({
        absolute_path: file_path,
        file_content: content
      })
    },

    /**
     * Delete a file with automatic backup of the original content.
     * @param {string} file_path - Absolute path
     */
    async delete_file(file_path) {
      const existing = await fs.readFile(file_path, 'utf8')
      backups.push({ file_path, content: existing, existed: true })
      await fs.unlink(file_path)
    },

    /**
     * Register a file that was created outside the transaction.
     * On rollback, the file will be deleted.
     * @param {string} file_path - Absolute path of the newly created file
     */
    register_new_file(file_path) {
      backups.push({ file_path, content: null, existed: false })
    },

    /**
     * Backup an existing file without writing new content.
     * Use when another function handles the write but rollback protection
     * is needed. Idempotent -- skips if already backed up.
     * @param {string} file_path - Absolute path
     */
    async backup_file(file_path) {
      if (backups.some((b) => b.file_path === file_path)) {
        return
      }
      try {
        const existing = await fs.readFile(file_path, 'utf8')
        backups.push({ file_path, content: existing, existed: true })
      } catch {
        backups.push({ file_path, content: null, existed: false })
      }
    }
  }

  try {
    const result = await operation(transaction)
    return result
  } catch (error) {
    log('Transaction failed, rolling back %d file operations', backups.length)

    // Rollback in reverse order
    for (let i = backups.length - 1; i >= 0; i--) {
      const backup = backups[i]
      try {
        if (backup.existed) {
          await write_file_to_filesystem({
            absolute_path: backup.file_path,
            file_content: backup.content
          })
          log('Restored %s', backup.file_path)
        } else {
          await fs.unlink(backup.file_path)
          log('Removed created file %s', backup.file_path)
        }
      } catch (rollback_error) {
        log(
          'Rollback failed for %s: %s',
          backup.file_path,
          rollback_error.message
        )
      }
    }

    throw error
  }
}
