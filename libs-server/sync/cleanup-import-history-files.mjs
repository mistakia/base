import fs from 'fs/promises'
import fs_sync from 'fs'
import debug from 'debug'

import { list_import_history_files } from '#libs-server/sync/list-import-history-files.mjs'

const log = debug('sync:cleanup-import-history-files')

/**
 * Clean up old import history files, keeping only the most recent files
 *
 * @param {Object} options - Function options
 * @param {string} [options.external_system] - Filter by external system (github, notion)
 * @param {string} [options.entity_id] - Filter by specific entity ID
 * @param {number} [options.keep_count=10] - Number of files to keep per entity
 * @param {boolean} [options.dry_run=false] - Show what would be deleted without deleting
 * @param {string} [options.import_history_base_directory] - Optional override for base directory
 * @returns {Promise<Object>} Cleanup results with statistics
 */
export async function cleanup_import_history_files({
  external_system = null,
  entity_id = null,
  keep_count = 10,
  dry_run = false,
  import_history_base_directory = null
} = {}) {
  try {
    log(
      `Starting cleanup: system=${external_system}, entity=${entity_id}, keep=${keep_count}, dry_run=${dry_run}`
    )

    const results = {
      entities_processed: 0,
      raw_files_deleted: 0,
      processed_files_deleted: 0,
      total_files_deleted: 0,
      bytes_freed: 0,
      errors: []
    }

    // Get all entities with import history
    const entities = await list_import_history_files({
      external_system,
      entity_id,
      import_history_base_directory
    })

    log(`Found ${entities.length} entities with import history`)

    // Process each entity
    for (const entity of entities) {
      try {
        const entity_result = await cleanup_entity_files({
          entity,
          keep_count,
          dry_run
        })

        results.entities_processed++
        results.raw_files_deleted += entity_result.raw_files_deleted
        results.processed_files_deleted += entity_result.processed_files_deleted
        results.total_files_deleted += entity_result.total_files_deleted
        results.bytes_freed += entity_result.bytes_freed

        if (entity_result.errors.length > 0) {
          results.errors.push(...entity_result.errors)
        }

        log(
          `Processed entity ${entity.entity_id}: deleted ${entity_result.total_files_deleted} files`
        )
      } catch (error) {
        const error_msg = `Error processing entity ${entity.entity_id}: ${error.message}`
        log(error_msg)
        results.errors.push(error_msg)
      }
    }

    log(
      `Cleanup completed: ${results.total_files_deleted} files deleted, ${results.bytes_freed} bytes freed`
    )
    return results
  } catch (error) {
    log(`Error during cleanup: ${error.message}`)
    throw error
  }
}

/**
 * Clean up import files for a specific entity
 *
 * @param {Object} options - Function options
 * @param {Object} options.entity - Entity import files info
 * @param {number} options.keep_count - Number of files to keep
 * @param {boolean} options.dry_run - Show what would be deleted without deleting
 * @returns {Promise<Object>} Entity cleanup results
 */
async function cleanup_entity_files({ entity, keep_count, dry_run }) {
  const results = {
    raw_files_deleted: 0,
    processed_files_deleted: 0,
    total_files_deleted: 0,
    bytes_freed: 0,
    errors: []
  }

  try {
    // Clean up raw files
    if (entity.raw_files.length > keep_count) {
      const files_to_delete = entity.raw_files.slice(keep_count)

      for (const file of files_to_delete) {
        try {
          if (dry_run) {
            log(`[DRY RUN] Would delete raw file: ${file.filepath}`)
          } else {
            await fs.unlink(file.filepath)
            log(`Deleted raw file: ${file.filepath}`)
          }

          results.raw_files_deleted++
          results.total_files_deleted++
          results.bytes_freed += file.size
        } catch (error) {
          const error_msg = `Error deleting raw file ${file.filepath}: ${error.message}`
          log(error_msg)
          results.errors.push(error_msg)
        }
      }
    }

    // Clean up processed files
    if (entity.processed_files.length > keep_count) {
      const files_to_delete = entity.processed_files.slice(keep_count)

      for (const file of files_to_delete) {
        try {
          if (dry_run) {
            log(`[DRY RUN] Would delete processed file: ${file.filepath}`)
          } else {
            await fs.unlink(file.filepath)
            log(`Deleted processed file: ${file.filepath}`)
          }

          results.processed_files_deleted++
          results.total_files_deleted++
          results.bytes_freed += file.size
        } catch (error) {
          const error_msg = `Error deleting processed file ${file.filepath}: ${error.message}`
          log(error_msg)
          results.errors.push(error_msg)
        }
      }
    }

    // Try to remove empty directories
    if (!dry_run && results.total_files_deleted > 0) {
      await cleanup_empty_directories(entity)
    }

    return results
  } catch (error) {
    const error_msg = `Error cleaning up entity ${entity.entity_id}: ${error.message}`
    log(error_msg)
    results.errors.push(error_msg)
    return results
  }
}

/**
 * Remove empty import directories after cleanup
 *
 * @param {Object} entity - Entity import files info
 * @returns {Promise<void>}
 */
async function cleanup_empty_directories(entity) {
  try {
    // Check and remove empty raw directory
    try {
      const raw_dir = entity.entity_import_directory + '/raw'
      if (fs_sync.existsSync(raw_dir)) {
        const raw_contents = await fs.readdir(raw_dir)
        if (raw_contents.length === 0) {
          await fs.rmdir(raw_dir)
          log(`Removed empty raw directory: ${raw_dir}`)
        }
      }
    } catch (error) {
      log(`Could not remove raw directory: ${error.message}`)
    }

    // Check and remove empty processed directory
    try {
      const processed_dir = entity.entity_import_directory + '/processed'
      if (fs_sync.existsSync(processed_dir)) {
        const processed_contents = await fs.readdir(processed_dir)
        if (processed_contents.length === 0) {
          await fs.rmdir(processed_dir)
          log(`Removed empty processed directory: ${processed_dir}`)
        }
      }
    } catch (error) {
      log(`Could not remove processed directory: ${error.message}`)
    }

    // Check and remove empty entity directory
    try {
      if (fs_sync.existsSync(entity.entity_import_directory)) {
        const entity_contents = await fs.readdir(entity.entity_import_directory)
        if (entity_contents.length === 0) {
          await fs.rmdir(entity.entity_import_directory)
          log(
            `Removed empty entity directory: ${entity.entity_import_directory}`
          )
        }
      }
    } catch (error) {
      log(`Could not remove entity directory: ${error.message}`)
    }
  } catch (error) {
    log(`Error cleaning up empty directories: ${error.message}`)
  }
}

/**
 * Get summary statistics for import history cleanup
 *
 * @param {Object} options - Function options
 * @param {string} [options.external_system] - Filter by external system
 * @param {string} [options.entity_id] - Filter by specific entity ID
 * @param {number} [options.keep_count=10] - Number of files to keep per entity
 * @param {string} [options.import_history_base_directory] - Optional override for base directory
 * @returns {Promise<Object>} Summary statistics
 */
export async function get_cleanup_summary({
  external_system = null,
  entity_id = null,
  keep_count = 10,
  import_history_base_directory = null
} = {}) {
  try {
    const entities = await list_import_history_files({
      external_system,
      entity_id,
      import_history_base_directory
    })

    const summary = {
      entities_total: entities.length,
      entities_with_excess_files: 0,
      total_files: 0,
      files_to_delete: 0,
      bytes_total: 0,
      bytes_to_free: 0,
      by_system: {}
    }

    for (const entity of entities) {
      const total_entity_files =
        entity.raw_files.length + entity.processed_files.length
      const raw_to_delete = Math.max(0, entity.raw_files.length - keep_count)
      const processed_to_delete = Math.max(
        0,
        entity.processed_files.length - keep_count
      )
      const entity_files_to_delete = raw_to_delete + processed_to_delete

      summary.total_files += total_entity_files
      summary.files_to_delete += entity_files_to_delete

      if (entity_files_to_delete > 0) {
        summary.entities_with_excess_files++
      }

      // Calculate bytes
      const all_files = [...entity.raw_files, ...entity.processed_files]
      for (const file of all_files) {
        summary.bytes_total += file.size
      }

      // Calculate bytes to free (files beyond keep_count)
      const files_to_delete = [
        ...entity.raw_files.slice(keep_count),
        ...entity.processed_files.slice(keep_count)
      ]
      for (const file of files_to_delete) {
        summary.bytes_to_free += file.size
      }

      // Track by system
      if (!summary.by_system[entity.external_system]) {
        summary.by_system[entity.external_system] = {
          entities: 0,
          total_files: 0,
          files_to_delete: 0,
          bytes_to_free: 0
        }
      }

      const system_summary = summary.by_system[entity.external_system]
      system_summary.entities++
      system_summary.total_files += total_entity_files
      system_summary.files_to_delete += entity_files_to_delete
      system_summary.bytes_to_free += files_to_delete.reduce(
        (sum, f) => sum + f.size,
        0
      )
    }

    return summary
  } catch (error) {
    log(`Error getting cleanup summary: ${error.message}`)
    throw error
  }
}
