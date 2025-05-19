#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import debug from 'debug'

import { import_repository_from_git } from '#libs-server/entity/database/import/import-repository-from-git.mjs'
import postgres from '#db'

const log = debug('markdown-import')

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('system-branch', {
    alias: 'b',
    description: 'Branch to use for system repository',
    type: 'string'
  })
  .option('user-branch', {
    description: 'Branch to use for user repository',
    type: 'string'
  })
  .option('user-id', {
    alias: 'i',
    description: 'User ID to associate with imported entities',
    type: 'string',
    required: true
  })
  .option('skip-schema-files', {
    description: 'Skip importing schema files',
    type: 'boolean',
    default: false
  })
  .option('dry-run', {
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
      system_branch: argv.systemBranch,
      user_branch: argv.userBranch,
      user_id: argv.userId,
      skip_schema_files: argv.skipSchemaFiles,
      dry_run: argv.dryRun
    })

    if (argv.dryRun) {
      console.log('Dry run mode: No database changes will be made')
    }

    // Configure import options with explicit branches
    const import_options = {
      repositories: [
        { branch: argv.systemBranch },
        { branch: argv.userBranch }
      ],
      user_id: argv.userId,
      system_branch: argv.systemBranch,
      user_branch: argv.userBranch
    }

    // Start a transaction if in dry run mode
    if (argv.dryRun) {
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
