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
    // Validate entity against schemas
    const validation = await validate_entity_from_filesystem({
      entity_properties: entity_result.entity_properties,
      formatted_entity_metadata: entity_result.formatted_entity_metadata,
      schemas
    })

    // Check for validation errors
    if (!validation.success) {
      has_errors = true
      file.errors = file.errors.concat(
        validation.errors || ['Validation failed']
      )
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

  return { processed, skipped, has_errors }
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
 * @param {string} [path_pattern] Glob pattern for filtering paths
 * @returns {Promise<Object>} Processing results
 */
export async function process_repositories_from_filesystem({
  entity_processor,
  include_entity_types = [],
  exclude_entity_types = [],
  path_pattern
} = {}) {
  // Get directories from registry
  const system_base_directory = get_system_base_directory()
  const user_base_directory = get_user_base_directory()

  log(
    `Processing repositories from filesystem with root directory: ${system_base_directory}, user directory: ${user_base_directory}`
  )

  // Setup repositories
  const repositories = [
    {
      base_path: system_base_directory
    }
  ]

  // Add user repository if it exists and is different from root
  if (user_base_directory && user_base_directory !== system_base_directory) {
    repositories.push({
      base_path: user_base_directory
    })
  }

  log(
    'Processing repositories:',
    repositories.map((r) => r.base_path)
  )

  // Load schemas from filesystem
  log('Loading schema definitions from filesystem...')

  // Load schemas using registry system
  const schemas = await load_schema_definitions_from_filesystem()

  // Scan for entity files across all repositories
  log('Scanning filesystem repositories...')
  let all_files = []

  for (const repository of repositories) {
    const repo_files = await list_entity_files_from_filesystem({
      base_directory: repository.base_path,
      include_entity_types,
      exclude_entity_types,
      path_pattern
    })

    log(`Found ${repo_files.length} entity files in ${repository.base_path}`)
    all_files = all_files.concat(repo_files.map((file) => file.file_info))
  }

  log(`Found ${all_files.length} total entity files in filesystem repositories`)

  // Process each file
  let processed = 0
  let skipped = 0
  let errors = 0

  for (const file of all_files) {
    const result = await process_filesystem_file({
      file,
      schemas,
      entity_processor
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
    files: all_files,
    repositories
  }
}
