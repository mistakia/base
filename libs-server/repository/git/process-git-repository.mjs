import debug from 'debug'
import path from 'path'

import { list_entity_files_from_git } from './list-entity-files-from-git.mjs'
import { load_schema_definitions_from_git } from './load-schema-definitions-from-git.mjs'
import { validate_entity_from_git } from '#libs-server/entity/git/validate-entity-from-git.mjs'
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
    // Validate the entity against schemas
    const validation = await validate_entity_from_git({
      entity_properties: file.entity_properties,
      formatted_entity_metadata: file.formatted_entity_metadata,
      repo_path: file.file_info.repo_path,
      branch: file.file_info.branch || branch,
      schemas
    })

    // Add file info and base path
    file.base_relative_path = base_relative_path

    if (!validation.success) {
      file.errors = file.errors.concat(validation.errors || [validation.error])
      has_errors = true
    }

    // Run custom entity processor if provided
    if (entity_processor) {
      // TODO make sure both entity_process functions share same properties schema
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
      submodule_base_path: submodule.path
    })
  }

  log(
    'Processing repositories:',
    repositories.map((r) => r.path)
  )

  // Load schemas from git
  log('Loading schema definitions from git...')
  const schemas = {}

  // Load schemas from all repositories
  for (const repository of repositories) {
    // Skip the root repository if it's not needed
    if (repository.submodule_base_path === null && repositories.length > 1) {
      continue
    }

    const repo_schemas = await load_schema_definitions_from_git({
      root_base_directory,
      user_base_directory: repository.path
    })

    // Merge into main schemas object
    Object.assign(schemas, repo_schemas)
  }

  // Scan for markdown files across all repositories
  log('Scanning git repositories...')
  let all_files = []

  for (const repository of repositories) {
    const repo_files = await list_entity_files_from_git({
      repo_path: repository.path,
      branch: repository.branch,
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
      schemas,
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
    schemas,
    files: all_files,
    repositories
  }
}
