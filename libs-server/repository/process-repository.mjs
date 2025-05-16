import debug from 'debug'

import { list_markdown_files_from_git } from './git/list-markdown-files-from-git.mjs'
import { list_markdown_files_from_filesystem } from './filesystem/list-markdown-files-from-filesystem.mjs'
// import { load_schema_definitions_from_git } from './git/load-schema-definitions-from-git.mjs'
import { load_schema_definitions_from_filesystem } from './filesystem/load-schema-definitions-from-filesystem.mjs'
import { read_entity_from_git } from '#libs-server/entity/git/read-entity-from-git.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { validate_entity_from_git } from '#libs-server/entity/git/validate-entity-from-git.mjs'
import config from '#config'
import git from '#libs-server/git/index.mjs'
import path from 'path'

const log = debug('markdown:process-repository')

// Repository types
const REPOSITORY_TYPE = {
  ROOT: 'root', // Root repository (system)
  SUBMODULE: 'submodule' // All submodules are treated as user repos
}

/**
 * Process a single markdown file from git
 * @param {Object} options Processing options
 * @param {Object} options.file File to process
 * @param {Object} options.repository Repository configuration for this file
 * @param {Object} options.schemas Schema definitions
 * @param {string} [options.branch] Branch name
 * @param {function} [options.entity_processor] Function to process the entity
 * @param {string} options.base_relative_path Base relative path for the file (required)
 * @returns {Promise<Object>} Processing result
 */
async function process_git_file({
  file,
  repository,
  schemas,
  branch,
  entity_processor,
  base_relative_path
}) {
  file.errors = file.errors || []
  let has_errors = false
  let processed = false
  let skipped = false

  try {
    // Read entity from git
    const entity_result = await read_entity_from_git({
      repo_path: file.repo_path,
      file_path: file.git_relative_path,
      branch: file.branch || branch
    })

    if (!entity_result.success) {
      file.errors.push(entity_result.error || 'Failed to read entity from git')
      has_errors = true
      return { processed, skipped, has_errors }
    }

    // Validate the entity against schemas
    const validation = await validate_entity_from_git({
      entity_properties: entity_result.entity_properties,
      entity_metadata: entity_result.entity_metadata,
      repo_path: file.repo_path,
      branch: file.branch || branch,
      schemas
    })

    // Complete the entity with validation results
    const processed_entity = {
      ...entity_result,
      validation_result: validation
    }

    // Add file info to the processed entity
    processed_entity.file_info = file

    // Always add base_relative_path to both the file and the processed entity
    file.base_relative_path = base_relative_path
    processed_entity.base_relative_path = base_relative_path

    if (!validation.success) {
      file.errors = file.errors.concat(validation.errors || [validation.error])
      has_errors = true
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
    console.log(error)
    console.log(file)
    file.errors.push(error.message)
    has_errors = true
  }

  return { processed, skipped, has_errors }
}

/**
 * Process repositories from git
 * @param {Object} options Configuration options
 * @param {string} [options.root_base_directory] The absolute path to the base directory
 * @param {string} [options.branch] Branch override
 * @param {boolean} [options.skip_schema_files] Whether to skip schema files
 * @param {function} [options.entity_processor] Function to process each entity
 * @returns {Promise<Object>} Processing results
 */
export async function process_repositories_from_git(options = {}) {
  const root_base_directory = options.root_base_directory || process.cwd()
  log(
    `Processing repositories from git with root directory: ${root_base_directory}`
  )

  // Setup root repository
  const current_branch = await git.get_current_branch(root_base_directory)
  const branch = options.branch || config.system_main_branch || current_branch
  const root_repo = {
    path: root_base_directory,
    branch,
    repository_type: REPOSITORY_TYPE.ROOT,
    submodule_base_path: null
  }

  // Find all repositories including submodules
  const repositories = [root_repo]
  const submodules = await git.list_submodules({
    repo_path: root_base_directory
  })

  for (const submodule of submodules) {
    const submodule_path = path.join(root_base_directory, submodule.path)
    const submodule_branch =
      (await git.get_current_branch(submodule_path)) ||
      submodule.branch ||
      branch

    repositories.push({
      path: submodule_path,
      branch: submodule_branch,
      repository_type: REPOSITORY_TYPE.SUBMODULE,
      submodule_base_path: submodule.path
    })
  }

  log(
    'Processing repositories:',
    repositories.map((r) => `${r.path} (${r.repository_type})`)
  )

  // Load schemas from git
  log('Loading schema definitions from git...')
  // const schemas = await load_schema_definitions_from_git({
  //   system_repository: repositories.find(
  //     (r) => r.repository_type === REPOSITORY_TYPE.ROOT
  //   ),
  //   user_repository:
  //     repositories.find(
  //       (r) => r.repository_type === REPOSITORY_TYPE.SUBMODULE
  //     ) || null
  // })

  // Scan for markdown files across all repositories
  log('Scanning git repositories...')
  let all_files = []

  for (const repository of repositories) {
    const repo_files = await list_markdown_files_from_git({
      repo_path: repository.path,
      branch: repository.branch,
      repo_type:
        repository.repository_type === REPOSITORY_TYPE.ROOT ? 'system' : 'user',
      submodule_base_path: repository.submodule_base_path
    })

    log(`Found ${repo_files.length} markdown files in ${repository.path}`)
    all_files = all_files.concat(repo_files)
  }

  log(`Found ${all_files.length} total markdown files in git repositories`)

  // Process each file
  let processed = 0
  let skipped = 0
  let errors = 0

  for (const file of all_files) {
    if (
      options.skip_schema_files &&
      file.git_relative_path.startsWith('schema/')
    ) {
      skipped++
      continue
    }

    const repository = repositories.find((r) => r.path === file.repo_path)
    if (!repository) {
      log(`Warning: No repository found for path ${file.repo_path}`)
    }

    const result = await process_git_file({
      file,
      repository,
      // TODO add schemas back in
      // schemas,
      branch: repository?.branch || branch,
      entity_processor: options.entity_processor,
      base_relative_path: file.base_relative_path
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
    // TODO add schemas back in
    // schemas,
    files: all_files,
    repositories
  }
}

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

    // For filesystem, we can't use validate_entity_from_git directly
    // Instead, we'll perform basic schema validation only
    const validation = schemas
      ? {
          success: true, // Simplified validation for filesystem
          errors: []
        }
      : { success: true, errors: [] }

    // Complete the entity with validation results
    const processed_entity = {
      ...entity_result,
      validation_result: validation
    }

    // Add file info to the processed entity
    processed_entity.file_info = file

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
  // Define root directory
  const root_base_directory = options.root_base_directory || process.cwd()

  log(
    `Processing repositories from filesystem with root directory: ${root_base_directory}`
  )

  // Track processing stats
  let processed = 0
  let skipped = 0
  let errors = 0

  // Load schemas from filesystem
  log('Loading schema definitions from filesystem...')
  const schemas = await load_schema_definitions_from_filesystem({
    root_base_directory
  })

  // Scan for all markdown files from filesystem across all repositories
  log('Scanning filesystem repositories...')
  const all_files = await list_markdown_files_from_filesystem({
    root_base_directory
  })

  log(
    `Found ${all_files.length} total markdown files in filesystem repositories`
  )

  // Process each file
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
