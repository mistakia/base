#!/usr/bin/env node
import debug from 'debug'
import fs from 'fs/promises'

import db from '#db'
import config from '#config'
import { isMain } from '#libs-server'
import { generate_entity_file_from_database } from '#libs-server/markdown/entity-converter/index.mjs'

const log = debug('entity-batch-converter')
debug.enable('entity-batch-converter,markdown:entity_converter:*')

/**
 * Run the entity batch converter to export all entities from database to files
 */
const run = async () => {
  try {
    // Get all entities from the database
    const entities = await db('entities').select('entity_id', 'title', 'type')

    log(`Found ${entities.length} entities to export`)

    // Ensure base output directory exists
    const user_base_directory = config.user_base_directory
    await fs.mkdir(user_base_directory, { recursive: true })

    const results = { success: [], failed: [] }

    // Process each entity
    for (const entity of entities) {
      try {
        log(`Processing entity: ${entity.entity_id} (${entity.title})`)

        const result = await generate_entity_file_from_database({
          entity_id: entity.entity_id,
          user_base_directory,
          overwrite: false
        })

        if (result.success) {
          results.success.push({
            entity_id: entity.entity_id,
            file_path: result.file_path
          })
        } else {
          results.failed.push({
            entity_id: entity.entity_id,
            error: result.message
          })
        }
      } catch (error) {
        log(`Error processing entity ${entity.entity_id}: ${error.message}`)
        results.failed.push({
          entity_id: entity.entity_id,
          error: error.message
        })
      }
    }

    // Output results
    log('Batch conversion completed')
    console.log('-----------------------------')
    console.log(`Total entities processed: ${entities.length}`)
    console.log(`Successfully converted: ${results.success.length}`)
    console.log(`Failed: ${results.failed.length}`)

    // Show success details
    if (results.success.length > 0) {
      log('Successfully converted entities:')
      results.success.forEach((success) => {
        log(`- ${success.entity_id}: ${success.file_path}`)
      })
    }

    // Show failure details
    if (results.failed.length > 0) {
      console.log('\nFailed conversions:')
      results.failed.forEach((failure) => {
        console.log(`- ${failure.entity_id}: ${failure.error}`)
      })
    }
  } catch (error) {
    log('Error:', error)
    console.error(`Error: ${error.message}`)
    process.exit(1)
  }
}

const main = async () => {
  let error
  try {
    await run()
  } catch (err) {
    error = err
    console.error(error)
  }

  process.exit()
}

if (isMain(import.meta.url)) {
  main()
}

export default run
