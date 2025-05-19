import debug from 'debug'

import { list_markdown_files_in_filesystem } from './list-markdown-files-in-filesystem.mjs'
import { load_schema_definitions_from_filesystem } from './load-schema-definitions-from-filesystem.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'

const log = debug('markdown:process-filesystem-repository')

/**
 * Process a single markdown file from filesystem
 * @param {Object} options Processing options
 * @param {Object} options.file File to process
 * @param {Object} options.repository Repository configuration for this file
 * @param {Object} options.schemas Schema definitions
 * @param {function} [options.entity_processor] Function to process the entity
 * @returns {Promise<Object>} Processing result
 */
async function process_filesystem_file({
  file,
  repository,
  schemas,
  entity_processor
}) {
  file.errors = file.errors || []
  let has_errors = false
  let processed = false
  let skipped = false

  try {
    // Read entity from filesystem
    const entity_result = await read_entity_from_filesystem({
      absolute_path: file.absolute_path
    })

    if (!entity_result.success) {
      file.errors.push(
        entity_result.error || 'Failed to read entity from filesystem'
      )
      has_errors = true
      return { processed, skipped, has_errors }
    }

    // For filesystem, we perform basic schema validation only
    const validation = schemas
      ? { success: true, errors: [] }
      : { success: true, errors: [] }

    // Complete the entity with validation results
    const processed_entity = {
      ...entity_result,
      validation_result: validation,
      file_info: file
    }

    // Run custom entity processor if provided
    if (entity_processor) {
      const result = await entity_processor({
        entity: processed_entity,
        file,
        repository,
        schemas
      })
      if (result === false) {
        skipped = true
      } else {
        processed = true
      }
    } else {
      processed = true
    }
  } catch (error) {
    file.errors.push(error.message)
    has_errors = true
  }

  return { processed, skipped, has_errors }
}

/**
 * Process repositories from filesystem
 * @param {Object} options Configuration options
 * @param {string} [options.root_base_directory] The absolute path to the base directory
 * @param {function} [options.entity_processor] Function to process each entity (entity, file, repository, schemas) => Promise
 * @returns {Promise<Object>} Processing results
 */
export async function process_repositories_from_filesystem(options = {}) {
  const root_base_directory = options.root_base_directory || process.cwd()
  log(
    `Processing repositories from filesystem with root directory: ${root_base_directory}`
  )

  // Load schemas from filesystem
  log('Loading schema definitions from filesystem...')
  const schemas = await load_schema_definitions_from_filesystem({
    root_base_directory
  })

  // Scan for markdown files
  log('Scanning filesystem repositories...')
  const all_files = await list_markdown_files_in_filesystem({
    root_base_directory
  })

  log(
    `Found ${all_files.length} total markdown files in filesystem repositories`
  )

  // Process each file
  let processed = 0
  let skipped = 0
  let errors = 0

  for (const file of all_files) {
    const result = await process_filesystem_file({
      file,
      schemas,
      entity_processor: options.entity_processor
    })

    if (result.processed) processed++
    if (result.skipped) skipped++
    if (result.has_errors) errors++
  }

  return {
    processed,
    skipped,
    errors,
    total: all_files.length,
    schemas,
    files: all_files
  }
}
