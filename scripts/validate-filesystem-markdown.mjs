#!/usr/bin/env node
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import { process_repositories_from_filesystem } from '#libs-server/repository/filesystem/process-filesystem-repository.mjs'

const log = debug('validate-filesystem-markdown')
debug.enable(
  'validate-filesystem-markdown,markdown:process-repository,markdown:scanner'
)

const validate_filesystem = async ({ root_base_directory }) => {
  // Process from filesystem
  log('Processing repositories from filesystem...')
  const result = await process_repositories_from_filesystem({
    root_base_directory
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
      console.error(`Base Path: ${file.base_relative_path || 'N/A'}`)
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
  const argv = yargs(hideBin(process.argv))
    .option('root_base_directory', {
      type: 'string',
      description: 'Root base directory to use for the knowledge base',
      default: undefined
    })
    .help().argv

  let error
  try {
    const result = await validate_filesystem({
      root_base_directory: argv.root_base_directory
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
