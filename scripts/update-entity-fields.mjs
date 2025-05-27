#!/usr/bin/env node
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import config from '#config'
import { process_repositories_from_filesystem } from '#libs-server/repository/filesystem/process-filesystem-repository.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'

const log = debug('update-entity-fields')
debug.enable(
  'update-entity-fields,markdown:process-repository,markdown:scanner,write-entity-to-filesystem'
)

const system_user_id = '00000000-0000-0000-0000-000000000000'

const update_entity_fields = async ({
  root_base_directory = config.root_base_directory,
  user_id = config.user_id,
  dry_run = false
}) => {
  // Process from filesystem
  log('Processing repositories from filesystem...')
  const result = await process_repositories_from_filesystem({
    root_base_directory
  })

  // Track statistics
  let updated_count = 0
  let error_count = 0
  const updated_files = []
  const error_files = []

  // Process each file with missing fields
  for (const file of result.files) {
    const is_system_file =
      file.base_relative_path.startsWith('system') ||
      file.base_relative_path.startsWith('tests')

    if (file.errors && file.errors.length > 0) {
      let needs_update = false

      // Check for missing required fields
      for (const error of file.errors) {
        if (error.includes('entity_id') && error.includes('required')) {
          needs_update = true
        }
        if (error.includes('user_id') && error.includes('required')) {
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
            user_id: is_system_file ? system_user_id : user_id,
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

            updated_files.push(file.base_relative_path)
            updated_count++
            log(`Updated ${file.base_relative_path}`)
          } else {
            log(`[DRY RUN] Would update ${file.base_relative_path}`)
            console.log(updated_properties)
            updated_files.push(file.base_relative_path)
            updated_count++
          }
        } catch (err) {
          log(`Error updating ${file.base_relative_path}:`, err)
          error_files.push(file.base_relative_path)
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
  const argv = yargs(hideBin(process.argv))
    .option('root_base_directory', {
      type: 'string',
      description: 'Root base directory to use for the knowledge base',
      default: config.root_base_directory
    })
    .option('user_id', {
      type: 'string',
      description: 'User ID to use for the knowledge base',
      default: config.user_id
    })
    .option('dry_run', {
      type: 'boolean',
      description: 'Run in dry-run mode without making actual changes',
      default: false
    })
    .help().argv

  let error
  try {
    const result = await update_entity_fields({
      root_base_directory: argv.root_base_directory,
      dry_run: argv.dry_run
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
