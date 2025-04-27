import debug from 'debug'

import {
  list_markdown_files_from_git,
  list_markdown_files_from_filesystem
} from '#root/libs-server/markdown/repository/list-markdown-files.mjs'
import { load_schema_definitions_from_git } from '#libs-server/markdown/markdown-schema.mjs'
import {
  process_markdown_from_file,
  process_markdown_from_git
} from '#libs-server/markdown/processor/markdown-processor.mjs'
import config from '#config'
import git from '#libs-server/git/index.mjs'

const log = debug('markdown:process-repository')

/**
 * Process repositories from git
 * @param {Object} options Configuration options
 * @param {Object} [options.system_repository] System repository config
 * @param {Object} [options.user_repository] User repository config
 * @param {string} [options.system_branch] System branch override
 * @param {string} [options.user_branch] User branch override
 * @param {boolean} [options.skip_schema_files] Whether to skip schema files
 * @param {boolean} [options.validate_content] Whether to run full validation checks
 * @param {function} [options.process_file] Custom file processor function (processed_entity) => Promise
 * @returns {Promise<Object>} Processing results
 */
export async function process_repositories_from_git(options = {}) {
  // Define default repositories if not provided
  const current_system_branch = await git.get_current_branch()
  const system_branch =
    options.system_branch || config.system_main_branch || current_system_branch
  const system_repository = options.system_repository || {
    path: './',
    branch: system_branch,
    is_submodule: false,
    repo_type: 'system'
  }

  const current_user_branch = await git.get_current_branch('./data')
  const user_branch =
    options.user_branch || config.user_main_branch || current_user_branch
  const user_repository = options.user_repository || {
    path: './data',
    branch: user_branch,
    is_submodule: true,
    repo_type: 'user'
  }

  log({
    system_repository,
    user_repository
  })

  // Track processing stats
  let processed = 0
  let skipped = 0
  let errors = 0

  // Load schemas from git
  log('Loading schema definitions from git...')
  const schemas = await load_schema_definitions_from_git({
    system_repository,
    user_repository
  })

  // Scan for all markdown files using git
  log('Scanning git repositories...')
  const files = await list_markdown_files_from_git([
    system_repository,
    user_repository
  ])
  log(`Found ${files.length} markdown files in git`)

  // Process each file
  for (const file of files) {
    file.errors = []
    let has_errors = false
    try {
      // Skip schema files if configured to do so
      if (
        options.skip_schema_files &&
        file.git_relative_path.startsWith('schema/')
      ) {
        skipped++
        continue
      }

      // Parse, format and validate the markdown file from git
      const formatted_markdown_entity = await process_markdown_from_git({
        git_relative_path: file.git_relative_path,
        branch: file.branch,
        repo_path: file.repo_path,
        user_branch,
        system_branch,
        schemas
      })

      // Add file info to the processed entity
      formatted_markdown_entity.file_info = file

      if (
        formatted_markdown_entity.errors &&
        formatted_markdown_entity.errors.length > 0
      ) {
        file.errors = file.errors.concat(formatted_markdown_entity.errors)
        has_errors = true
      }

      // Run custom file processor if provided
      if (options.process_file) {
        const result = await options.process_file(formatted_markdown_entity)
        if (result === false) {
          skipped++
        } else {
          processed++
        }
      } else {
        processed++
      }
    } catch (error) {
      file.errors.push(error.message)
      has_errors = true
    }

    if (has_errors) {
      errors++
    }
  }

  return {
    processed,
    skipped,
    errors,
    total: files.length,
    schemas,
    files
  }
}

/**
 * Process repositories from filesystem
 * @param {Object} options Configuration options
 * @param {Object} [options.system_repository] System repository config
 * @param {Object} [options.user_repository] User repository config
 * @param {boolean} [options.skip_schema_files] Whether to skip schema files
 * @param {boolean} [options.validate_content] Whether to run full validation checks
 * @param {function} [options.process_file] Custom file processor function (processed_entity) => Promise
 * @returns {Promise<Object>} Processing results
 */
export async function process_repositories_from_filesystem(options = {}) {
  // Define default repositories
  const system_repository = options.system_repository || {
    path: './',
    repo_type: 'system'
  }

  const user_repository = options.user_repository || {
    path: './data',
    repo_type: 'user'
  }

  log({
    system_repository,
    user_repository
  })

  // Track processing stats
  let processed = 0
  let skipped = 0
  let errors = 0

  // Load schemas from filesystem
  // TODO: implement load_schema_definitions_from_filesystem
  log('Loading schema definitions from filesystem...')
  const schemas = {} // Empty schemas for now

  // Scan for all markdown files from filesystem
  log('Scanning filesystem repositories...')
  const files = await list_markdown_files_from_filesystem([
    system_repository,
    user_repository
  ])
  log(`Found ${files.length} markdown files in filesystem`)

  // Process each file
  for (const file of files) {
    file.errors = []
    let has_errors = false
    try {
      // Skip schema files if configured to do so
      if (options.skip_schema_files && file.file_path.startsWith('schema/')) {
        skipped++
        continue
      }

      // Parse, format and validate the markdown file from filesystem
      const formatted_markdown_entity = await process_markdown_from_file({
        absolute_path: file.absolute_path,
        schemas
      })

      // Add file info to the processed entity
      formatted_markdown_entity.file_info = file

      // Add any validation errors to the file errors
      if (
        formatted_markdown_entity.errors &&
        formatted_markdown_entity.errors.length > 0
      ) {
        file.errors = file.errors.concat(formatted_markdown_entity.errors)
        has_errors = true
      }

      // Run custom file processor if provided
      if (options.process_file) {
        const result = await options.process_file(formatted_markdown_entity)
        if (result === false) {
          skipped++
        } else {
          processed++
        }
      } else {
        processed++
      }
    } catch (error) {
      file.errors.push(error.message)
      has_errors = true
    }

    if (has_errors) {
      errors++
    }
  }

  return {
    processed,
    skipped,
    errors,
    total: files.length,
    schemas,
    files
  }
}
