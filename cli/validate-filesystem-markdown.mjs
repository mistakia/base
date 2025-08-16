#!/usr/bin/env node
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import { process_repositories_from_filesystem } from '#libs-server/repository/filesystem/process-filesystem-repository.mjs'
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
  exclude_path_patterns = []
} = {}) => {
  // Process from filesystem
  log('Processing repositories from filesystem...')
  const result = await process_repositories_from_filesystem({
    include_path_patterns,
    exclude_path_patterns
  })

  // Report results
  console.log('\nFilesystem Validation Results:')
  console.log('============================')
  console.log(`Total files processed: ${result.total}`)
  console.log(`Successfully validated: ${result.processed}`)
  console.log(`Skipped: ${result.skipped}`)
  console.log(`Errors: ${result.errors}`)

  // Output errors
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

  return {
    ...result,
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
    .strict()
    .help().argv

  // Handle directory registration using the reusable function
  handle_cli_directory_registration(argv)

  let error
  try {
    const result = await validate_filesystem({
      include_path_patterns: argv.include_path_patterns,
      exclude_path_patterns: argv.exclude_path_patterns
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
