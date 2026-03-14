import debug from 'debug'

import { list_entity_files_from_filesystem } from './list-entity-files-from-filesystem.mjs'
import { load_schema_definitions_from_filesystem } from './load-schema-definitions-from-filesystem.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { validate_entity_from_filesystem } from '../../entity/filesystem/validate-entity-from-filesystem.mjs'
import {
  get_system_base_directory,
  get_user_base_directory
} from '#libs-server/base-uri/index.mjs'

const log = debug('markdown:process-filesystem-repository')

/**
 * Process a single markdown file from filesystem
 * @param {Object} options Processing options
 * @param {Object} options.file File to process
 * @param {Object} options.schemas Schema definitions
 * @param {function} [options.entity_processor] Function to process the entity
 * @returns {Promise<Object>} Processing result
 */
async function process_filesystem_file({ file, schemas, entity_processor }) {
  file.errors = file.errors || []
  file.warnings = file.warnings || []
  let has_errors = false
  let has_warnings = false
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
    // Validate entity against schemas
    const validation = await validate_entity_from_filesystem({
      entity_properties: entity_result.entity_properties,
      formatted_entity_metadata: entity_result.formatted_entity_metadata,
      schemas,
      entity_content: entity_result.entity_content
    })

    // Check for validation errors
    if (!validation.success) {
      has_errors = true
      file.errors = file.errors.concat(
        validation.errors || ['Validation failed']
      )
    }

    // Propagate warnings
    if (Array.isArray(validation.warnings) && validation.warnings.length > 0) {
      has_warnings = true
      file.warnings = file.warnings.concat(validation.warnings)
    }

    // Run custom entity processor if provided
    if (entity_processor) {
      const result = await entity_processor({
        file: {
          ...file,
          entity_properties: entity_result.entity_properties,
          formatted_entity_metadata: entity_result.formatted_entity_metadata,
          base_uri: file.base_uri
        },
        validation,
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

  return { processed, skipped, has_errors, has_warnings }
}

/**
 * Process repositories from filesystem using registry system
 * @param {function} [entity_processor] Function to process each entity
 *   The entity_processor receives an object with the following properties:
 *   - file: {
 *       absolute_path: string,         // Absolute filesystem path
 *       base_uri: string,              // Base URI for the entity (e.g., 'user:task/my-task.md')
 *       git_relative_path: string,     // Path relative to base directory
 *       repo_path: string,             // Repository base path
 *       entity_properties: Object,     // Parsed entity properties from frontmatter
 *       formatted_entity_metadata: Object, // Additional metadata
 *       errors: Array                  // Array of error messages (if any)
 *     }
 *   - validation: Object              // Validation result from schema validation
 *   - schemas: Object                 // Schema definitions for validation
 *   Returns: boolean (false to skip, true/undefined to process)
 * @param {string[]} [include_entity_types] Entity types to include
 * @param {string[]} [exclude_entity_types] Entity types to exclude
 * @param {string[]} [include_path_patterns] Path patterns to include
 * @param {string[]} [exclude_path_patterns] Path patterns to exclude
 * @returns {Promise<Object>} Processing results
 */
export async function process_repositories_from_filesystem({
  entity_processor,
  include_entity_types = [],
  exclude_entity_types = [],
  include_path_patterns = [],
  exclude_path_patterns = []
} = {}) {
  // Get directories from registry
  const system_base_directory = get_system_base_directory()
  const user_base_directory = get_user_base_directory()

  log(
    `Processing repositories from filesystem with root directory: ${system_base_directory}, user directory: ${user_base_directory}`
  )

  // Load schemas from filesystem
  log('Loading schema definitions from filesystem...')

  // Load schemas using registry system
  const schemas = await load_schema_definitions_from_filesystem()

  // Scan for entity files (list_entity_files_from_filesystem handles both directories internally)
  log('Scanning filesystem repositories...')
  const entity_files = await list_entity_files_from_filesystem({
    include_entity_types,
    exclude_entity_types,
    include_path_patterns,
    exclude_path_patterns
  })

  const all_files = entity_files.map((file) => file.file_info)
  log(`Found ${all_files.length} total entity files in filesystem repositories`)

  // Process each file
  let processed = 0
  let skipped = 0
  let errors = 0
  let warnings = 0

  for (const file of all_files) {
    const result = await process_filesystem_file({
      file,
      schemas,
      entity_processor
    })

    if (result.processed) processed++
    if (result.skipped) skipped++
    if (result.has_errors) errors++
    if (result.has_warnings) warnings++
  }

  return {
    processed,
    skipped,
    errors,
    warnings,
    total: all_files.length,
    schemas,
    files: all_files,
    directories: {
      system_base_directory,
      user_base_directory
    }
  }
}
