#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import debug from 'debug'
import config from '#config'

import { import_repository_from_git } from '#libs-server/entity/database/import/import-repository-from-git.mjs'
import postgres from '#db'

const log = debug('markdown-import')

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('branch', {
    alias: 'b',
    description: 'Branch to use for import',
    type: 'string',
    default: config.system_main_branch
  })
  .option('root_base_directory', {
    alias: 'r',
    description: 'Root base directory to import from',
    type: 'string',
    default: config.root_base_directory
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
  .help()
  .alias('help', 'h')
  .epilog('Import markdown files into PostgreSQL database').argv

async function main() {
  try {
    console.log('Starting markdown import...')

    log('Configuration:', {
      branch: argv.branch,
      root_base_directory: argv.root_base_directory,
      user_id: argv.user_id,
      dry_run: argv.dry_run
    })

    if (argv.dry_run) {
      console.log('Dry run mode: No database changes will be made')
    }

    // Configure import options with explicit branches
    const import_options = {
      user_id: argv.user_id,
      root_base_directory: argv.root_base_directory,
      branch: argv.branch
    }

    // Start a transaction if in dry run mode
    if (argv.dry_run) {
      await postgres
        .transaction(async () => {
          const result = await import_repository_from_git(import_options)
          console.log(`Import simulation complete:
- Imported: ${result.imported} files
- Skipped: ${result.skipped} files
- Errors: ${result.errors} files
- Removed: ${result.removed} stale entities`)
          // Rollback the transaction to avoid making changes
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
      // Regular execution
      const result = await import_repository_from_git(import_options)
      console.log(`Import complete:
- Imported: ${result.imported} files
- Skipped: ${result.skipped} files
- Errors: ${result.errors} files
- Removed: ${result.removed} stale entities`)
    }
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  } finally {
    // Close database connection
    await postgres.destroy()
  }
}

main()
