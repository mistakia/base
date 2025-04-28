import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import {
  process_repositories_from_filesystem,
  process_repositories_from_git
} from '#libs-server/markdown/repository/process-repository.mjs'

const log = debug('scan-validate-knowledge-base')
debug.enable(
  'scan-validate-knowledge-base,markdown:process-repository,markdown:scanner'
)

const run = async ({ system_branch, user_branch }) => {
  log({
    system_branch,
    user_branch
  })
  log('Starting knowledge base validation...')

  // Process from filesystem
  log('Processing repositories from filesystem...')
  const filesystem_result = await process_repositories_from_filesystem({
    system_branch,
    user_branch,
    validate_content: true
  })

  // Process from git
  log('Processing repositories from git...')
  const git_result = await process_repositories_from_git({
    system_branch,
    user_branch,
    validate_content: true
  })

  // Report filesystem results
  console.log('\nFilesystem Validation Results:')
  console.log('============================')
  console.log(`Total files processed: ${filesystem_result.total}`)
  console.log(`Successfully validated: ${filesystem_result.processed}`)
  console.log(`Skipped: ${filesystem_result.skipped}`)
  console.log(`Errors: ${filesystem_result.errors}`)

  // Output filesystem errors
  let filesystem_has_errors = false
  for (const file of filesystem_result.files) {
    if (file.errors && file.errors.length > 0) {
      if (!filesystem_has_errors) {
        console.error('\nFilesystem Validation Errors:')
        console.error('===========================')
        filesystem_has_errors = true
      }
      console.error(`\nFile: ${file.absolute_path}`)
      file.errors.forEach((error) => {
        console.error(`  • ${error}`)
      })
    }
  }

  // Report git results
  console.log('\nGit Validation Results:')
  console.log('=====================')
  console.log(`Total files processed: ${git_result.total}`)
  console.log(`Successfully validated: ${git_result.processed}`)
  console.log(`Skipped: ${git_result.skipped}`)
  console.log(`Errors: ${git_result.errors}`)

  // Output git errors
  let git_has_errors = false
  for (const file of git_result.files) {
    if (file.errors && file.errors.length > 0) {
      if (!git_has_errors) {
        console.error('\nGit Validation Errors:')
        console.error('====================')
        git_has_errors = true
      }
      console.error(`\nFile: ${file.git_relative_path || file.path}`)
      file.errors.forEach((error) => {
        console.error(`  • ${error}`)
      })
    }
  }

  // Final status output
  const has_errors = filesystem_has_errors || git_has_errors
  if (has_errors) {
    console.log('\nValidation failed with errors')
    return false
  } else {
    console.log('\n✓ All files validated successfully')
    return true
  }
}

export default run

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
    const success = await run({
      system_branch: argv['system-branch'],
      user_branch: argv['user-branch']
    })
    if (!success) {
      error = new Error('Validation failed')
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
