#!/usr/bin/env node
import debug from 'debug'
import fs from 'fs/promises'

import db from '#db'
import config from '#config'
import { isMain } from '#libs-server'
import { batch_export_markdown_entities } from '#libs-server/markdown/entity-export/index.mjs'

const log = debug('entity-batch-converter')
debug.enable('entity-batch-converter,markdown:entity_export:*')

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

    // Extract entity IDs for batch processing
    const entity_ids = entities.map((entity) => entity.entity_id)

    // Process entities in batch
    const results = await batch_export_markdown_entities({
      entity_ids,
      user_base_directory,
      overwrite: false
    })

    // Output results
    log('Batch conversion completed')
    console.log('-----------------------------')
    console.log(`Total entities processed: ${results.total}`)
    console.log(`Successfully converted: ${results.success}`)
    console.log(`Skipped (already exist): ${results.skipped}`)
    console.log(`Failed: ${results.errors.length}`)

    // Show failure details
    if (results.errors.length > 0) {
      console.log('\nFailed conversions:')
      results.errors.forEach((failure) => {
        console.log(`- ${failure.entity_id}: ${failure.message}`)
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
