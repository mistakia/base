#!/usr/bin/env node
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import { process_repositories_from_git } from '#libs-server/markdown/repository/process-repository.mjs'

const log = debug('validate-git-markdown')
debug.enable(
  'validate-git-markdown,markdown:process-repository,markdown:scanner'
)

const validate_git = async ({ system_branch, user_branch }) => {
  log({
    system_branch,
    user_branch
  })

  // Process from git
  log('Processing repositories from git...')
  const result = await process_repositories_from_git({
    system_branch,
    user_branch,
    validate_content: true
  })

  // Report results
  console.log('\nGit Validation Results:')
  console.log('=====================')
  console.log(`Total files processed: ${result.total}`)
  console.log(`Successfully validated: ${result.processed}`)
  console.log(`Skipped: ${result.skipped}`)
  console.log(`Errors: ${result.errors}`)

  // Output errors
  let has_errors = false
  for (const file of result.files) {
    if (file.errors && file.errors.length > 0) {
      if (!has_errors) {
        console.error('\nGit Validation Errors:')
        console.error('====================')
        has_errors = true
      }
      console.error(`\nFile: ${file.git_relative_path || file.path}`)
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

export default validate_git

const main = async () => {
  const argv = yargs(hideBin(process.argv))
    .option('system-branch', {
      type: 'string',
      description: 'Branch to use for the system knowledge base',
      default: undefined
    })
    .option('user-branch', {
      type: 'string',
      description: 'Branch to use for the user knowledge base',
      default: undefined
    })
    .help().argv

  let error
  try {
    const result = await validate_git({
      system_branch: argv['system-branch'],
      user_branch: argv['user-branch']
    })

    if (result.has_errors) {
      error = new Error('Git validation failed')
    } else {
      console.log('\n✓ All git files validated successfully')
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
