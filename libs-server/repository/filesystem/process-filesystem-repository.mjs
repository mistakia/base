import debug from 'debug'
import path from 'path'

import { list_entity_files_from_filesystem } from './list-entity-files-from-filesystem.mjs'
import { load_schema_definitions_from_filesystem } from './load-schema-definitions-from-filesystem.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { validate_entity_from_filesystem } from '../../entity/filesystem/validate-entity-from-filesystem.mjs'
import git from '#libs-server/git/index.mjs'
import config from '#config'

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
      schemas
    })

    // Check for validation errors
    if (!validation.success) {
      has_errors = true
      file.errors = file.errors.concat(
        validation.errors || ['Validation failed']
      )
    }

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
 * @param {string} [root_base_directory] The absolute path to the base directory
 * @param {function} [entity_processor] Function to process each entity (entity, file, schemas) => Promise
 * @returns {Promise<Object>} Processing results
 */
export async function process_repositories_from_filesystem({
  root_base_directory = config.system_base_directory,
  entity_processor
} = {}) {
  log(
    `Processing repositories from filesystem with root directory: ${root_base_directory}`
  )

  // Setup root repository
  const root_repo = {
    submodule_base_path: null
  }

  // Find all repositories including submodules
  const repositories = [root_repo]
  const submodules = await git.list_submodules({
    repo_path: root_base_directory
  })

  for (const submodule of submodules) {
    repositories.push({
      submodule_base_path: submodule.path
    })
  }

  log(
    'Processing repositories:',
    repositories.map((r) => r.submodule_base_path || 'root')
  )

  // Load schemas from filesystem
  log('Loading schema definitions from filesystem...')
  const schemas = {}

  // Load schemas only from submodules, skip the root repository
  for (const repository of repositories) {
    // Skip the root repository
    if (repository.submodule_base_path === null) {
      continue
    }

    const user_base_directory = path.join(
      root_base_directory,
      repository.submodule_base_path
    )

    const repo_schemas = await load_schema_definitions_from_filesystem({
      root_base_directory,
      user_base_directory
    })

    // Merge into main schemas object
    Object.assign(schemas, repo_schemas)
  }

  // Scan for entity files across all repositories
  log('Scanning filesystem repositories...')
  let all_files = []

  for (const repository of repositories) {
    const repo_files = await list_entity_files_from_filesystem({
      root_base_directory,
      submodule_base_path: repository.submodule_base_path
    })

    const repo_name = repository.submodule_base_path || 'root'
    log(`Found ${repo_files.length} entity files in ${repo_name}`)
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
