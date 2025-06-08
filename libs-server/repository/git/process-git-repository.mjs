import debug from 'debug'

import { list_entity_files_from_git } from './list-entity-files-from-git.mjs'
import { load_schema_definitions_from_git } from './load-schema-definitions-from-git.mjs'
import { validate_entity_from_git } from '#libs-server/entity/git/validate-entity-from-git.mjs'
import {
  get_system_base_directory,
  get_user_base_directory
} from '#libs-server/base-uri/index.mjs'
import config from '#config'
import git from '#libs-server/git/index.mjs'

const log = debug('markdown:process-git-repository')

/**
 * Process a single markdown file from git
 * @param {Object} options Processing options
 * @param {Object} options.file File to process
 * @param {Object} options.repository Repository configuration for this file
 * @param {Object} options.schemas Schema definitions
 * @param {string} [options.branch] Branch name
 * @param {function} [options.entity_processor] Function to process the entity
 * @param {string} options.base_uri Base relative path for the file (required)
 * @returns {Promise<Object>} Processing result
 */
async function process_git_file({
  file,
  repository,
  schemas,
  branch,
  entity_processor,
  base_uri
}) {
  file.errors = file.errors || []
  let has_errors = false
  let processed = false
  let skipped = false

  try {
    // Validate the entity against schemas
    const validation = await validate_entity_from_git({
      entity_properties: file.entity_properties,
      formatted_entity_metadata: file.formatted_entity_metadata,
      repo_path: file.file_info.repo_path,
      branch: file.file_info.branch || branch,
      schemas
    })

    // Add file info and base path
    file.base_uri = base_uri

    if (!validation.success) {
      file.errors = file.errors.concat(validation.errors || [validation.error])
      has_errors = true
    }

    // Run custom entity processor if provided
    if (entity_processor) {
      const result = await entity_processor({
        file,
        validation,
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
 * Process repositories from git using registry system
 * @param {Object} options Configuration options
 * @param {string} [options.branch] Branch override
 * @param {function} [options.entity_processor] Function to process each entity
 *   The entity_processor receives an object with the following properties:
 *   - file: {
 *       base_uri: string,              // Base URI for the entity (e.g., 'user:task/my-task.md')
 *       entity_properties: Object,     // Parsed entity properties from frontmatter
 *       formatted_entity_metadata: Object, // Additional metadata
 *       file_info: {                   // Git file information
 *         git_relative_path: string,   // Path relative to git root
 *         git_sha: string,             // Current git SHA of the file
 *         repo_path: string,           // Absolute path to repository
 *         branch: string               // Git branch name
 *       },
 *       errors: Array                  // Array of error messages (if any)
 *     }
 *   - validation: Object              // Validation result from schema validation
 *   - repository: Object              // Repository configuration
 *   - schemas: Object                 // Schema definitions for validation
 *   Returns: boolean (false to skip, true/undefined to process)
 * @param {Array<string>} [options.exclude_entity_types] Entity types to exclude
 * @returns {Promise<Object>} Processing results
 */
export async function process_repositories_from_git(options = {}) {
  // Get directories from registry
  const system_base_directory = get_system_base_directory()
  const user_base_directory = get_user_base_directory()

  log(
    `Processing repositories from git with system directory: ${system_base_directory}, user directory: ${user_base_directory}`
  )

  // Setup root repository
  const current_branch = await git.get_current_branch(system_base_directory)
  const branch = options.branch || config.system_main_branch || current_branch
  const repositories = [
    {
      path: system_base_directory,
      branch,
      is_system_repo: true
    }
  ]

  // Add user repository if it exists and is different from root
  if (user_base_directory && user_base_directory !== system_base_directory) {
    const user_branch =
      (await git.get_current_branch(user_base_directory)) || branch
    repositories.push({
      path: user_base_directory,
      branch: user_branch
    })
  }

  log(
    'Processing repositories:',
    repositories.map((r) => r.path)
  )

  // Load schemas from git
  log('Loading schema definitions from git...')

  // Load schemas using registry system
  const schemas = await load_schema_definitions_from_git()

  // Scan for markdown files across all repositories
  log('Scanning git repositories...')
  let all_files = []

  for (const repository of repositories) {
    const repo_files = await list_entity_files_from_git({
      repo_path: repository.path,
      branch: repository.branch,
      exclude_entity_types: options.exclude_entity_types || [],
      is_system_repo: repository.is_system_repo
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
    const repository = repositories.find((r) => r.path === file.repo_path)
    if (!repository) {
      log(`Warning: No repository found for path ${file.repo_path}`)
    }

    const result = await process_git_file({
      file,
      repository,
      schemas,
      branch: repository?.branch || branch,
      entity_processor: options.entity_processor,
      base_uri: file.base_uri
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
