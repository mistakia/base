#!/usr/bin/env node

// Move Entity CLI Tool
//
// Move entity files within the Base system while updating all references.
// Handles base_uri updates and reference integrity across the repository.
//
// Examples:
//   node cli/move-entity.mjs task/old-name.md task/new-name.md
//   node cli/move-entity.mjs user:task/old.md user:task/subdir/new.md
//   node cli/move-entity.mjs task/old.md task/new.md --dry-run

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { move_entity_filesystem } from '#libs-server/entity/filesystem/move-entity-filesystem.mjs'

// Configure debugging
const log = debug('move-entity')
debug.enable('move-entity,move-entity-filesystem,update-entity-references')

// Configure CLI options
const cli_config = (argv_parser) =>
  add_directory_cli_options(argv_parser)
    .scriptName('move-entity')
    .usage(
      `$0 <source> <destination> [options]

Move an entity file to a new location while updating all references.

Paths can be specified as:
  - Relative:  "task/old.md" (relative to user base directory)
  - Base URI:  "user:task/old.md" (full base_uri format)
  - Absolute:  "/full/path/to/entity.md"`
    )
    .positional('source', {
      type: 'string',
      description: 'Source path or base_uri of entity to move'
    })
    .positional('destination', {
      type: 'string',
      description: 'Destination path or base_uri'
    })
    .option('dry_run', {
      type: 'boolean',
      description: 'Preview changes without executing',
      default: false,
      alias: 'n'
    })
    .option('include_path_patterns', {
      type: 'array',
      description: 'Limit reference scan to matching paths',
      default: [],
      alias: 'i'
    })
    .option('exclude_path_patterns', {
      type: 'array',
      description: 'Exclude paths from reference scan',
      default: [],
      alias: 'e'
    })
    .example([
      ['$0 task/old-name.md task/new-name.md', 'Move entity to new name'],
      ['$0 task/item.md task/subdir/item.md', 'Move entity to subdirectory'],
      [
        '$0 user:task/old.md user:task/new.md --dry-run',
        'Preview move with base_uri format'
      ],
      [
        '$0 task/old.md task/new.md -i "task/**/*.md"',
        'Limit reference scan to task directory'
      ]
    ])
    .epilogue(
      `What this tool does:
  1. Validates source exists and destination does not exist
  2. Scans all entity files for references to the source
  3. Updates all relations and inline references in other files
  4. Updates the entity's own base_uri property
  5. Moves the file to the new location

Reference Updates:
  - Relations in frontmatter: "subtask_of [[user:task/old.md]]"
  - Inline wikilinks: "See [[user:task/old.md]] for details"

Exit Codes:
  0  Success
  1  Error (file not found, destination exists, etc.)`
    )
    .wrap(100)
    .help()
    .alias('help', 'h')
    .version(false)

/**
 * Format the move result for display
 */
const format_move_result = (result) => {
  const lines = []

  if (result.dry_run) {
    lines.push('Dry run - no changes made\n')
  } else if (result.success) {
    lines.push('Entity moved successfully\n')
  } else {
    lines.push('Move operation failed\n')
  }

  lines.push(`Source: ${result.source_base_uri}`)
  lines.push(`Destination: ${result.destination_base_uri}`)
  lines.push('')

  if (result.files_updated.length > 0) {
    lines.push(
      `Files with references to update (${result.files_updated.length}):`
    )
    for (const file of result.files_updated) {
      const relation_str =
        file.relation_updates > 0 ? `${file.relation_updates} relation(s)` : ''
      const content_str =
        file.content_updates > 0 ? `${file.content_updates} content ref(s)` : ''
      const details = [relation_str, content_str].filter(Boolean).join(', ')
      lines.push(`  - ${file.base_uri} (${details})`)
    }
    lines.push('')
    lines.push(`Total reference updates: ${result.reference_updates}`)
  } else {
    lines.push('No references found in other files')
  }

  if (result.errors.length > 0) {
    lines.push('')
    lines.push('Errors:')
    for (const error of result.errors) {
      lines.push(`  - ${error}`)
    }
  }

  return lines.join('\n')
}

const main = async () => {
  const argv = cli_config(yargs(hideBin(process.argv))).argv

  // Handle directory registration (required for base-uri system)
  handle_cli_directory_registration(argv)

  // Get positional arguments
  const [source, destination] = argv._

  if (!source || !destination) {
    console.error('Error: Both source and destination are required')
    console.error('Usage: move-entity <source> <destination> [options]')
    process.exit(1)
  }

  let error
  try {
    // Handle both underscore and camelCase versions of options (yargs converts --dry-run to dryRun)
    const dry_run = argv.dry_run || argv.dryRun || false
    const include_path_patterns =
      argv.include_path_patterns || argv.includePathPatterns || []
    const exclude_path_patterns =
      argv.exclude_path_patterns || argv.excludePathPatterns || []

    log('Starting move operation', {
      source,
      destination,
      dry_run
    })

    const result = await move_entity_filesystem({
      source_path: source,
      destination_path: destination,
      dry_run,
      include_path_patterns,
      exclude_path_patterns
    })

    // Display formatted result
    console.log(format_move_result(result))

    if (!result.success) {
      error = new Error(result.errors[0] || 'Move operation failed')
    }
  } catch (err) {
    error = err
    console.error(`Error: ${err.message}`)
  }

  process.exit(error ? 1 : 0)
}

if (isMain(import.meta.url)) {
  main()
}
