#!/usr/bin/env node

// Tag Management CLI Tool
//
// Apply and remove tags from Base system entities using pattern-based file discovery.
// Follows Base system patterns for consistent CLI behavior and entity processing.
//
// Examples:
//   node cli/manage-tags.mjs add -t javascript -i "task/*.md"
//   node cli/manage-tags.mjs remove -t legacy -i "**/*.md" -e "archive/*"
//   node cli/manage-tags.mjs add -t urgent -i "task/*.md" --dry_run

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { resolve_tag_shorthand } from '#libs-server/tag/filesystem/resolve-tag-shorthand.mjs'
import { tag_exists_in_filesystem } from '#libs-server/tag/filesystem/tag-exists-in-filesystem.mjs'
import { process_tag_batch } from '#libs-server/tag/filesystem/process-tag-batch.mjs'

// Configure debugging
const log = debug('manage-tags')

// Shared option definitions to avoid repetition
const shared_options = (yargs, operation_verb) => {
  return yargs
    .option('tag', {
      type: 'string',
      description: `Tag(s) to ${operation_verb}. Accepts shorthand (e.g., "javascript") or full base-uri format (e.g., "user:tag/javascript.md"). Use commas for multiple tags.`,
      required: true,
      alias: 't'
    })
    .option('include_path_patterns', {
      type: 'array',
      description: 'Glob patterns to match files. Patterns are relative to the user base directory.',
      default: ['*.md'],
      alias: 'i'
    })
    .option('exclude_path_patterns', {
      type: 'array',
      description: 'Glob patterns to exclude files from processing.',
      default: [],
      alias: 'e'
    })
    .option('dry_run', {
      type: 'boolean',
      description: 'Preview changes without modifying any files.',
      default: false,
      alias: 'd'
    })
}

// Configure CLI options following Base system pattern
const cli_config = (argv_parser) =>
  add_directory_cli_options(argv_parser)
    .scriptName('manage-tags')
    .usage(`$0 <command> [options]

Batch add or remove tags from Base system entities.

Tags can be specified as:
  - Shorthand: "javascript" resolves to "user:tag/javascript.md"
  - Full URI:  "user:tag/javascript.md" used as-is
  - Multiple:  "javascript,react,frontend" (comma-separated)`)
    .command(
      'add',
      'Add tags to matching entities',
      (yargs) => shared_options(yargs, 'add')
    )
    .command(
      'remove',
      'Remove tags from matching entities',
      (yargs) => shared_options(yargs, 'remove')
    )
    .demandCommand(1, 'You must specify a command: add or remove')
    .example([
      ['$0 add -t javascript -i "task/*.md"', 'Add javascript tag to all tasks'],
      ['$0 add -t "react,frontend" -i "task/league/*.md"', 'Add multiple tags to league tasks'],
      ['$0 remove -t legacy -i "**/*.md" -e "archive/*"', 'Remove tag, excluding archive'],
      ['$0 add -t urgent -i "task/*.md" --dry_run', 'Preview changes without applying']
    ])
    .epilogue(`Tag Format:
  Shorthand tags are automatically expanded:
    "javascript"     -> "user:tag/javascript.md"
    "base-project"   -> "user:tag/base-project.md"

  Full base-uri format is passed through unchanged:
    "user:tag/custom.md" -> "user:tag/custom.md"

Pattern Examples:
  "task/*.md"           Match all markdown files in task/
  "task/**/*.md"        Match all markdown files in task/ recursively
  "**/*.md"             Match all markdown files in user base
  "task/league/*.md"    Match markdown files in task/league/

Exit Codes:
  0  Success (all files processed)
  1  Error (some files failed or invalid input)`)
    .wrap(100)
    .help()
    .alias('help', 'h')
    .version(false)

/**
 * Main tag management orchestrator function
 * Coordinates the complete tag management workflow following update-entity-fields pattern
 */
const manage_tags = async ({
  operation,
  tags,
  include_path_patterns = ['*.md'],
  exclude_path_patterns = [],
  dry_run = false
}) => {
  try {
    log('Tag management process started', { operation, tags, include_path_patterns, exclude_path_patterns, dry_run })

    if (!operation || !['add', 'remove'].includes(operation)) {
      throw new Error('Operation must be either "add" or "remove"')
    }

    if (!tags) {
      throw new Error('Tags parameter is required')
    }

    // Step 1: Resolve tag shorthand to base-uri format
    log('Resolving tag shorthand...')
    const resolved_tags = resolve_tag_shorthand(tags)
    log('Resolved tags:', resolved_tags)

    // Step 2: Validate tags exist using existing tag_exists_in_filesystem
    log('Validating tag existence...')
    const validation_results = await Promise.all(
      resolved_tags.map(async (tag) => {
        const exists = await tag_exists_in_filesystem({ base_uri: tag })
        return { tag, exists }
      })
    )

    const missing_tags = validation_results.filter(result => !result.exists)

    if (missing_tags.length > 0) {
      const missing_tag_list = missing_tags.map(t => t.tag).join(', ')
      throw new Error(`The following tags do not exist: ${missing_tag_list}`)
    }

    log('All tags validated successfully')

    // Step 3: Call batch processing with validated inputs
    log('Starting batch processing...')
    const batch_result = await process_tag_batch({
      operation,
      resolved_tags,
      include_path_patterns,
      exclude_path_patterns,
      dry_run
    })

    return batch_result

  } catch (error) {
    log('Error in tag management orchestration:', error)
    return {
      success: false,
      error: error.message,
      updated_count: 0,
      error_count: 1
    }
  }
}

export default manage_tags

const main = async () => {
  const argv = cli_config(yargs(hideBin(process.argv))).argv

  // Handle directory registration (required for base-uri system)
  handle_cli_directory_registration(argv)

  // Determine operation type from command
  const command = argv._[0]
  if (!['add', 'remove'].includes(command)) {
    console.error('Invalid command. Use "add" or "remove"')
    process.exit(1)
  }

  let error
  try {
    const result = await manage_tags({
      operation: command,
      tags: argv.tag,
      include_path_patterns: argv.include_path_patterns,
      exclude_path_patterns: argv.exclude_path_patterns,
      dry_run: argv.dry_run
    })

    // Check for errors using both success flag and error_count for robustness
    if (!result.success || result.error_count > 0) {
      const error_message = result.error || 'Some files could not be processed'
      console.error(`\nError: ${error_message}`)
      error = new Error(error_message)
    } else if (result.updated_count > 0) {
      console.log('\nSuccessfully processed all files')
    } else {
      console.log('\nNo files needed processing')
    }
  } catch (err) {
    error = err
    console.error(err.message || err)
  }

  process.exit(error ? 1 : 0)
}

if (isMain(import.meta.url)) {
  main()
}