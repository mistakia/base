import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import is_main from '#libs-server/utils/is-main.mjs'
import db from '#db'
import { import_entity_from_git } from '#libs-server/entity/database/import-entity-from-git.mjs'
import { process_repositories_from_git } from '#libs-server/repository/git/process-git-repository.mjs'
import {
  register_base_directories,
  register_user_base_directory,
  register_system_base_directory,
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import config from '#config'

const log = debug('entity:database:import:repository')

/**
 * Remove stale entities (entities that no longer exist in the repository)
 * @param {Array} current_files Array of current file paths
 * @param {String} user_id User ID
 * @returns {Number} Number of removed entities
 */
export async function remove_stale_entities({ exiting_files, user_id }) {
  try {
    // Get absolute paths of all current files
    const absolute_paths = exiting_files.map(
      (file) => file.file_info.absolute_path
    )

    // Find entities that are not in the current files
    const stale_entities = await db('entities')
      .where({ user_id })
      .whereNotNull('absolute_path')
      .whereNotIn('absolute_path', absolute_paths)
      .whereNull('archived_at')
      .select('entity_id', 'title')

    if (stale_entities.length === 0) {
      log('No stale entities found')
      return 0
    }

    await db('entities')
      .whereIn(
        'entity_id',
        stale_entities.map((e) => e.entity_id)
      )
      .delete()

    log(`Removed ${stale_entities.length} stale entities`)
    return stale_entities.length
  } catch (error) {
    log('Error removing stale entities:', error)
    throw error
  }
}

/**
 * Import all entities from git repositories into database
 *
 * @param {Object} options - Import options
 * @param {string} options.user_id - User ID to associate with imported entities
 * @param {boolean} [options.archive_missing=true] - Whether to archive entities that no longer exist
 * @param {string} [options.branch] - Branch for validation
 * @param {boolean} [options.force=false] - Force update all entities regardless of git SHA
 * @param {string} [options.system_base_directory] - System base directory (for entry point usage, optional)
 * @param {string} [options.user_base_directory] - User base directory (for entry point usage, optional)
 * @returns {Promise<Object>} - Import statistics
 */
export async function import_repository_from_git({
  user_id,
  archive_missing = true,
  branch,
  force = false,
  system_base_directory,
  user_base_directory
}) {
  // Validate input parameters
  if (!user_id) {
    throw new Error('User ID must be provided')
  }

  // Register directories if provided (will override config defaults)
  if (system_base_directory && user_base_directory) {
    log('Registering both system and user base directories from parameters')
    register_base_directories({
      system_base_directory,
      user_base_directory
    })
  } else if (user_base_directory) {
    log('Registering user base directory from parameters')
    register_user_base_directory(user_base_directory)
  } else if (system_base_directory) {
    log('Registering system base directory from parameters')
    register_system_base_directory(system_base_directory)
  }

  log('Importing entities from git repositories')

  try {
    // Process repositories using the common processing function
    const processing_result = await process_repositories_from_git({
      branch,
      exclude_entity_types: ['type_definition'],
      entity_processor: async ({ file }) => {
        try {
          // Skip processing if the file doesn't have a git_sha (which would be unusual)
          if (!file.file_info.git_sha) {
            file.errors.push('Missing git SHA, skipping')
            return false
          }

          // Import the entity to the database
          const import_result = await import_entity_from_git({
            base_uri: file.base_uri,
            branch: file.file_info.branch,
            user_id,
            force
          })

          if (import_result.success) {
            log(
              `Imported entity: ${file.git_relative_path} with base_uri: ${import_result.base_uri}`
            )
            return true // Processed successfully
          } else {
            file.errors.push(`Import failed: ${import_result.error}`)
            return false // Skip counting as processed
          }
        } catch (error) {
          log(
            `Error importing file ${file.base_uri || file.file_info.git_relative_path}:`,
            error
          )
          file.errors.push(`Import error: ${error.message}`)
          return false
        }
      }
    })

    // Handle entities that no longer exist in repositories
    let removed_count = 0
    if (archive_missing && processing_result.files.length > 0) {
      log(`Archiving missing entities for user ${user_id}`)
      removed_count = await remove_stale_entities({
        exiting_files: processing_result.files,
        user_id
      })
    }

    return {
      imported: processing_result.processed,
      skipped: processing_result.skipped,
      errors: processing_result.errors,
      removed: removed_count,
      files: processing_result.files
    }
  } catch (error) {
    log('Error importing repositories:', error)
    throw error
  }
}

if (is_main(import.meta.url)) {
  const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
    .usage('Usage: $0 [options]')
    .option('branch', {
      alias: 'b',
      description: 'Branch to use for import',
      type: 'string',
      default: config.system_main_branch
    })
    .option('user_id', {
      alias: 'i',
      description: 'User ID to associate with imported entities',
      type: 'string',
      default: config.user_id
    })
    .option('dry_run', {
      alias: 'd',
      description: 'Dry run, do not modify database',
      type: 'boolean',
      default: false
    })
    .option('force', {
      alias: 'f',
      description: 'Force update all entities regardless of git SHA',
      type: 'boolean',
      default: false
    })
    .help()
    .alias('help', 'h')
    .epilog('Import markdown files into PostgreSQL database').argv

  debug.enable(
    'entity:database:import-from-git,entity:database:import:*,entity:database:write:*'
  )

  const main = async () => {
    // Handle directory registration using the reusable function
    handle_cli_directory_registration(argv)

    let error
    try {
      console.log('Starting repository import...')
      log('Configuration:', {
        branch: argv.branch,
        user_id: argv.user_id,
        dry_run: argv.dry_run,
        force: argv.force,
        system_base_directory: argv.system_base_directory,
        user_base_directory: argv.user_base_directory
      })
      if (argv.dry_run) {
        console.log('Dry run mode: No database changes will be made')
      }
      const import_options = {
        user_id: argv.user_id,
        branch: argv.branch,
        force: argv.force,
        system_base_directory: argv.system_base_directory,
        user_base_directory: argv.user_base_directory
      }
      if (argv.dry_run) {
        await db
          .transaction(async () => {
            const result = await import_repository_from_git(import_options)
            console.log(
              `Import simulation complete:\n- Imported: ${result.imported} files\n- Skipped: ${result.skipped} files\n- Errors: ${result.errors} files\n- Removed: ${result.removed} stale entities`
            )
            throw new Error('Dry run completed, rolling back transaction')
          })
          .catch((err) => {
            if (err.message === 'Dry run completed, rolling back transaction') {
              console.log('Transaction rolled back successfully')
            } else {
              throw err
            }
          })
      } else {
        const result = await import_repository_from_git(import_options)
        console.log(
          `Import complete:\n- Imported: ${result.imported} files\n- Skipped: ${result.skipped} files\n- Errors: ${result.errors} files\n- Removed: ${result.removed} stale entities`
        )
      }
    } catch (err) {
      error = err
      console.error('Fatal error:', error)
    } finally {
      await db.destroy()
      process.exit(error ? 1 : 0)
    }
  }
  main()
}

export default import_repository_from_git
