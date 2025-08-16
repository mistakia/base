#!/usr/bin/env node

/**
 * Update Entity Fields CLI Tool
 *
 * Scans all entity files in the knowledge base and automatically adds missing required fields
 * such as entity_id, user_public_key, created_at, and updated_at to ensure schema compliance.
 *
 * This tool is particularly useful after importing data from external sources or when
 * upgrading entity schemas that require new mandatory fields.
 *
 * Features:
 * - Dry-run mode to preview changes before applying them
 * - Pattern-based filtering to target specific files or directories
 * - Automatic field generation for missing required properties
 * - Support for both system and user entity files
 * - Comprehensive reporting of updates and errors
 *
 * Examples:
 *
 *   # Update all entities with missing fields
 *   node cli/update-entity-fields.mjs
 *
 *   # Preview changes without applying them
 *   node cli/update-entity-fields.mjs --dry_run
 *
 *   # Update only task entities
 *   node cli/update-entity-fields.mjs --include_path_patterns "*\/task\/*.md"
 *
 *   # Update all except archived items
 *   node cli/update-entity-fields.mjs --exclude_path_patterns "*\/archived\/*"
 *
 *   # Update with specific user public key
 *   node cli/update-entity-fields.mjs --user_public_key "your-uuid-here"
 *
 *   # Update only user directory entities
 *   node cli/update-entity-fields.mjs --user_base_directory "/path/to/user/base"
 *
 * Note: System entities (starting with 'sys:') automatically use the system user public key,
 * while user entities use the provided or configured user public key.
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import config from '#config'
import { process_repositories_from_filesystem } from '#libs-server/repository/filesystem/process-filesystem-repository.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'

// Configure CLI options
const cli_config = (argv_parser) =>
  add_directory_cli_options(argv_parser)
    .scriptName('update-entity-fields')
    .usage('$0 [options]')
    .option('user_public_key', {
      type: 'string',
      description:
        'User public key to assign to user entities (system entities use system key)',
      default: config.user_public_key
    })
    .option('dry_run', {
      type: 'boolean',
      description: 'Preview changes without writing to files',
      default: false
    })
    .option('include_path_patterns', {
      type: 'array',
      description: 'Glob patterns for files to include (e.g., "*/task/*.md")',
      default: []
    })
    .option('exclude_path_patterns', {
      type: 'array',
      description: 'Glob patterns for files to exclude (e.g., "*/archived/*")',
      default: []
    })
    .example('$0', 'Update all entities with missing fields')
    .example(
      '$0 --dry_run',
      'Preview what would be updated without making changes'
    )
    .example(
      '$0 --include_path_patterns "*/task/*.md"',
      'Update only task entities'
    )
    .example(
      '$0 --exclude_path_patterns "*/archived/*"',
      'Skip archived entities'
    )
    .help()
    .alias('help', 'h')

const log = debug('update-entity-fields')
debug.enable(
  'update-entity-fields,markdown:process-repository,markdown:scanner,write-entity-to-filesystem'
)

const system_user_public_key = '00000000-0000-0000-0000-000000000000'

const update_entity_fields = async ({
  user_public_key = config.user_public_key,
  dry_run = false,
  include_path_patterns = [],
  exclude_path_patterns = []
}) => {
  // Process from filesystem
  log('Processing repositories from filesystem...')
  const result = await process_repositories_from_filesystem({
    include_path_patterns,
    exclude_path_patterns
  })

  // Track statistics
  let updated_count = 0
  let error_count = 0
  const updated_files = []
  const error_files = []

  // Process each file with missing fields
  for (const file of result.files) {
    const is_system_file = file.base_uri.startsWith('sys:')

    if (file.errors && file.errors.length > 0) {
      let needs_update = false

      // Check for missing required fields
      for (const error of file.errors) {
        if (error.includes('entity_id') && error.includes('required')) {
          needs_update = true
        }
        if (error.includes('user_public_key') && error.includes('required')) {
          needs_update = true
        }
        if (error.includes('created_at') && error.includes('required')) {
          needs_update = true
        }
        if (error.includes('updated_at') && error.includes('required')) {
          needs_update = true
        }
        if (needs_update) {
          break
        }
      }

      // If we need to update this file
      if (needs_update) {
        try {
          // Read the entity directly
          const entity_result = await read_entity_from_filesystem({
            absolute_path: file.absolute_path
          })

          if (!entity_result.success) {
            throw new Error(`Failed to read entity: ${entity_result.error}`)
          }

          // Get existing properties and content
          const { entity_properties, entity_content } = entity_result
          const entity_type = entity_properties.type

          // Add missing fields to properties
          const updated_properties = {
            user_public_key: is_system_file
              ? system_user_public_key
              : user_public_key,
            ...entity_properties
          }

          if (!dry_run) {
            // Write updated entity
            await write_entity_to_filesystem({
              absolute_path: file.absolute_path,
              entity_properties: updated_properties,
              entity_type,
              entity_content
            })

            updated_files.push(file.base_uri)
            updated_count++
            log(`Updated ${file.base_uri}`)
          } else {
            log(`[DRY RUN] Would update ${file.base_uri}`)
            console.log(updated_properties)
            updated_files.push(file.base_uri)
            updated_count++
          }
        } catch (err) {
          log(`Error updating ${file.base_uri}:`, err)
          error_files.push(file.base_uri)
          error_count++
        }
      }
    }
  }

  // Report results
  console.log('\nEntity Field Update Results:')
  console.log('============================')
  console.log(`Total files processed: ${result.total}`)
  console.log(
    `Files with errors: ${result.files.filter((f) => f.errors && f.errors.length > 0).length}`
  )
  console.log(`Files updated: ${updated_count}`)
  console.log(`Update errors: ${error_count}`)

  if (updated_count > 0) {
    console.log('\nUpdated files:')
    updated_files.forEach((file) => console.log(`  • ${file}`))
  }

  if (error_count > 0) {
    console.log('\nFiles with update errors:')
    error_files.forEach((file) => console.log(`  • ${file}`))
  }

  return {
    ...result,
    updated_count,
    error_count,
    updated_files,
    error_files
  }
}

export default update_entity_fields

const main = async () => {
  const argv = cli_config(yargs(hideBin(process.argv))).argv

  // Handle directory registration using the reusable function
  handle_cli_directory_registration(argv)

  let error
  try {
    const result = await update_entity_fields({
      user_public_key: argv.user_public_key,
      dry_run: argv.dry_run,
      include_path_patterns: argv.include_path_patterns,
      exclude_path_patterns: argv.exclude_path_patterns
    })

    if (result.error_count > 0) {
      error = new Error('Some files could not be updated')
    } else if (result.updated_count > 0) {
      console.log('\n✓ Successfully updated all files with missing fields')
    } else {
      console.log('\n✓ No files needed updating')
    }
  } catch (err) {
    error = err
    console.error(error)
  }

  process.exit(error ? 1 : 0)
}

if (isMain(import.meta.url)) {
  main()
}
