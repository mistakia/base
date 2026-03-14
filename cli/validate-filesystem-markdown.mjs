#!/usr/bin/env node
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import { process_repositories_from_filesystem } from '#libs-server/repository/filesystem/process-filesystem-repository.mjs'
import { list_markdown_files_in_filesystem } from '#libs-server/repository/filesystem/list-markdown-files-in-filesystem.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'

const log = debug('validate-filesystem-markdown')
debug.enable(
  'validate-filesystem-markdown,markdown:process-repository,markdown:scanner'
)

const validate_filesystem = async ({
  include_path_patterns = [],
  exclude_path_patterns = [],
  strict = false
} = {}) => {
  // Process from filesystem
  log('Processing repositories from filesystem...')
  const result = await process_repositories_from_filesystem({
    include_path_patterns,
    exclude_path_patterns
  })

  // Scan for unparseable files that entity listing silently skipped.
  // list_entity_files_from_filesystem (used by process_repositories_from_filesystem)
  // drops files that fail to parse, so broken entity files are invisible to validation.
  // This second pass discovers all markdown files and identifies those with frontmatter
  // that failed to parse -- likely broken entities rather than intentional non-entity files.
  log('Scanning for unparseable entity files...')
  const all_markdown_files = await list_markdown_files_in_filesystem({
    include_path_patterns,
    exclude_path_patterns
  })

  const validated_paths = new Set(result.files.map((f) => f.absolute_path))

  const unparseable_files = []
  let non_entity_count = 0

  for (const file of all_markdown_files) {
    if (validated_paths.has(file.absolute_path)) {
      continue
    }

    const read_result = await read_entity_from_filesystem({
      absolute_path: file.absolute_path,
      metadata_only: true
    })

    if (read_result.success) {
      // Entity parsed fine but was filtered out by type/path -- not a problem
      continue
    }

    if (read_result.error_code === 'NO_FRONTMATTER') {
      non_entity_count++
      continue
    }

    // File has frontmatter but failed to parse -- likely a broken entity
    unparseable_files.push({
      absolute_path: file.absolute_path,
      base_uri: file.base_uri,
      error: read_result.error,
      error_code: read_result.error_code
    })
  }

  // In strict mode, promote warnings to errors before output
  if (strict) {
    for (const file of result.files) {
      if (Array.isArray(file.warnings) && file.warnings.length > 0) {
        file.errors = (file.errors || []).concat(file.warnings)
        file.warnings = []
      }
    }
  }

  // Count totals from files (accounts for strict promotion)
  let warning_count = 0
  let error_file_count = 0
  for (const file of result.files) {
    if (Array.isArray(file.warnings)) {
      warning_count += file.warnings.length
    }
    if (Array.isArray(file.errors) && file.errors.length > 0) {
      error_file_count++
    }
  }

  // Report results
  console.log('\nFilesystem Validation Results:')
  console.log('============================')
  console.log(`Total files processed: ${result.total}`)
  console.log(`Successfully validated: ${result.processed}`)
  console.log(`Skipped: ${result.skipped}`)
  console.log(`Errors: ${error_file_count}`)
  console.log(`Warnings: ${warning_count}`)
  if (unparseable_files.length > 0) {
    console.log(`Unparseable entity files: ${unparseable_files.length}`)
  }
  if (non_entity_count > 0) {
    console.log(`Non-entity markdown files: ${non_entity_count}`)
  }

  // Output entity validation errors
  let has_errors = false
  for (const file of result.files) {
    if (file.errors && file.errors.length > 0) {
      if (!has_errors) {
        console.error('\nFilesystem Validation Errors:')
        console.error('===========================')
        has_errors = true
      }
      console.error(`\nFile: ${file.absolute_path}`)
      console.error(`Base Path: ${file.base_uri || 'N/A'}`)
      file.errors.forEach((error) => {
        console.error(`  • ${error}`)
      })
    }
  }

  // Output validation warnings
  let has_warnings = false
  for (const file of result.files) {
    if (Array.isArray(file.warnings) && file.warnings.length > 0) {
      if (!has_warnings) {
        console.warn('\nValidation Warnings:')
        console.warn('====================')
        has_warnings = true
      }
      console.warn(`\nFile: ${file.absolute_path}`)
      console.warn(`Base Path: ${file.base_uri || 'N/A'}`)
      file.warnings.forEach((warning) => {
        console.warn(`  • ${warning}`)
      })
    }
  }

  // Output unparseable file errors
  if (unparseable_files.length > 0) {
    if (!has_errors) {
      console.error('\nFilesystem Validation Errors:')
      console.error('===========================')
    }
    console.error('\nUnparseable Entity Files:')
    console.error('------------------------')
    for (const file of unparseable_files) {
      console.error(`\nFile: ${file.absolute_path}`)
      console.error(`Base Path: ${file.base_uri || 'N/A'}`)
      console.error(`  • ${file.error_code}: ${file.error}`)
    }
    has_errors = true
  }

  return {
    ...result,
    unparseable_files,
    non_entity_count,
    has_errors
  }
}

export default validate_filesystem

const main = async () => {
  const argv = add_directory_cli_options(
    yargs(hideBin(process.argv)).parserConfiguration({
      'comma-separated-values': true,
      'flatten-duplicate-arrays': true
    })
  )
    .option('include_path_patterns', {
      alias: 'i',
      description:
        'Path patterns to include files by (e.g., "system/*.md,user/*.md")',
      type: 'array'
    })
    .option('exclude_path_patterns', {
      alias: 'e',
      description:
        'Path patterns to exclude files by (e.g., "system/temp/*.md")',
      type: 'array'
    })
    .option('strict', {
      description: 'Promote warnings to errors',
      type: 'boolean',
      default: false
    })
    .strict()
    .help().argv

  // Handle directory registration using the reusable function
  handle_cli_directory_registration(argv)

  let error
  try {
    const result = await validate_filesystem({
      include_path_patterns: argv.include_path_patterns,
      exclude_path_patterns: argv.exclude_path_patterns,
      strict: argv.strict
    })

    if (result.has_errors) {
      error = new Error('Filesystem validation failed')
    } else {
      console.log('\n✓ All filesystem files validated successfully')
    }
  } catch (err) {
    error = err
    console.error(error)
  }

  process.exit(error ? 1 : 0)
}

if (isMain(import.meta.url)) {
  main()
}
