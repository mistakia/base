#!/usr/bin/env node

/**
 * Cleanup Notion Entities Script
 *
 * This script removes local entities that were synced from Notion.
 * It can be used to clean up before a fresh re-import.
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'
import { unlink } from 'fs/promises'

import config from '#config'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { list_files_recursive } from '#libs-server/repository/filesystem/list-files-recursive.mjs'

const log = debug('cli:notion:cleanup')

const argv = yargs(hideBin(process.argv))
  .option('dry-run', {
    describe: 'Show what would be deleted without actually deleting',
    type: 'boolean',
    default: false
  })
  .option('entity-type', {
    describe: 'Only cleanup specific entity type (e.g., physical_item, text)',
    type: 'string'
  })
  .option('database-id', {
    describe: 'Only cleanup entities from specific Notion database',
    type: 'string'
  })
  .option('force', {
    describe: 'Skip confirmation prompt',
    type: 'boolean',
    default: false
  })
  .option('verbose', {
    describe: 'Enable verbose logging',
    type: 'boolean',
    default: false
  })
  .help().argv

if (argv.verbose) {
  debug.enable('cli:notion:cleanup')
}

/**
 * Find all entities with Notion external IDs
 */
async function find_notion_entities(options = {}) {
  const { entity_type, database_id } = options
  const notion_entities = []

  // Define search directories based on entity type
  const search_directories = []

  if (entity_type) {
    // Search specific entity type directory
    const type_dir = entity_type.replace(/_/g, '-')
    const search_dir = path.join(config.user_base_directory, type_dir)
    search_directories.push(search_dir)
  } else {
    // Search all common entity directories
    const entity_dirs = [
      'text',
      'task',
      'physical-item',
      'digital-item',
      'physical-location',
      'person',
      'organization',
      'tag',
      'guideline',
      'workflow'
    ]

    for (const dir of entity_dirs) {
      const search_dir = path.join(config.user_base_directory, dir)
      search_directories.push(search_dir)
    }
  }

  // Search for markdown files in each directory
  for (const directory of search_directories) {
    try {
      const files = await list_files_recursive({
        directory,
        file_extension: '.md',
        absolute_paths: true
      })

      log(`Found ${files.length} files in directory: ${directory}`)

      // Check each file for Notion external ID
      for (const file_path of files) {
        try {
          const result = await read_entity_from_filesystem({
            absolute_path: file_path
          })

          // Check if reading was successful
          if (!result.success) {
            log(`Failed to read entity at ${file_path}: ${result.error}`)
            continue
          }

          const entity = result.entity_properties

          // Debug logging - check a few files
          if (files.indexOf(file_path) < 3) {
            log(
              `Sample entity from ${file_path}: external_id=${entity.external_id}, name=${entity.name}`
            )
          }

          // Check if entity has Notion external ID
          if (entity.external_id && entity.external_id.startsWith('notion:')) {
            log(
              `Found Notion entity: ${entity.name} with external_id: ${entity.external_id}`
            )

            // If database_id filter is specified, check it matches
            if (database_id) {
              const [, type, db_id] = entity.external_id.split(':')
              if (type === 'database' && db_id !== database_id) {
                log(
                  `Skipping entity ${entity.name} - database_id ${db_id} doesn't match filter ${database_id}`
                )
                continue
              }
            }

            notion_entities.push({
              absolute_path: file_path,
              relative_path: path.relative(
                config.user_base_directory,
                file_path
              ),
              entity,
              external_id: entity.external_id
            })
          }
        } catch (error) {
          log(`Error reading entity at ${file_path}: ${error.message}`)
        }
      }
    } catch (error) {
      // Directory might not exist, which is fine - just log and continue
      log(`Directory ${directory} not accessible: ${error.message}`)
    }
  }

  return notion_entities
}

/**
 * Display entities that will be deleted
 */
function display_entities(entities) {
  console.log(`\nFound ${entities.length} Notion-synced entities:\n`)

  // Group by entity type
  const by_type = {}
  for (const item of entities) {
    const type = item.entity.type || 'unknown'
    if (!by_type[type]) {
      by_type[type] = []
    }
    by_type[type].push(item)
  }

  // Display grouped entities
  for (const [type, items] of Object.entries(by_type)) {
    console.log(`\n${type} (${items.length})`)
    console.log('─'.repeat(50))

    for (const item of items) {
      console.log(`  ${item.entity.name || 'Untitled'}`)
      console.log(`    Path: ${item.relative_path}`)
      console.log(`    External ID: ${item.external_id}`)
    }
  }
}

/**
 * Delete entities
 */
async function delete_entities(entities, dry_run = false) {
  const results = {
    deleted: 0,
    errors: 0
  }

  for (const item of entities) {
    try {
      if (dry_run) {
        console.log(`[DRY RUN] Would delete: ${item.relative_path}`)
      } else {
        await unlink(item.absolute_path)
        console.log(`Deleted: ${item.relative_path}`)
      }
      results.deleted++
    } catch (error) {
      console.error(`Error deleting ${item.relative_path}: ${error.message}`)
      results.errors++
    }
  }

  return results
}

/**
 * Prompt for confirmation
 */
async function confirm_deletion(count) {
  if (argv.force) {
    return true
  }

  console.log(`\n⚠️  This will delete ${count} files.`)
  console.log('This action cannot be undone.')
  console.log('\nPress Enter to continue or Ctrl+C to cancel...')

  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      resolve(true)
    })
  })
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🔍 Searching for Notion-synced entities...')

    // Find all Notion entities
    const entities = await find_notion_entities({
      entity_type: argv['entity-type'],
      database_id: argv['database-id']
    })

    if (entities.length === 0) {
      console.log('\n✅ No Notion-synced entities found.')
      return
    }

    // Display what will be deleted
    display_entities(entities)

    // Confirm deletion
    const confirmed = await confirm_deletion(entities.length)
    if (!confirmed) {
      console.log('\n❌ Cleanup cancelled.')
      return
    }

    // Delete entities
    console.log('\n🗑️  Deleting entities...')
    const results = await delete_entities(entities, argv['dry-run'])

    // Display results
    console.log('\n📊 Cleanup Results:')
    console.log(`   Deleted: ${results.deleted}`)
    console.log(`   Errors: ${results.errors}`)

    if (argv['dry-run']) {
      console.log('\n⚠️  This was a dry run. No files were actually deleted.')
    }
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error.message)
    if (argv.verbose) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

// Run the script
main()
