#!/usr/bin/env node

/**
 * Entity Visibility CLI Tool
 * Manage public_read settings for entities and thread metadata files
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import picomatch from 'picomatch'
import config from '#config'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

const log = debug('cli:entity-visibility')

function validate_boolean(value) {
  return (
    value === 'true' || value === 'false' || value === true || value === false
  )
}

function parse_boolean(value) {
  return typeof value === 'boolean' ? value : value === 'true'
}

function is_markdown_file(file_path) {
  return file_path.endsWith('.md')
}

function is_thread_metadata(file_path) {
  return file_path.endsWith('metadata.json')
}

async function update_file(file_path, public_read, dry_run = false) {
  try {
    let old_value

    if (is_markdown_file(file_path)) {
      log(`Reading entity from ${file_path}`)
      const result = await read_entity_from_filesystem({
        absolute_path: file_path
      })
      if (!result.success) throw new Error(result.error)

      old_value = result.entity_properties.public_read

      if (!dry_run) {
        await write_entity_to_filesystem({
          absolute_path: file_path,
          entity_properties: { ...result.entity_properties, public_read },
          entity_type: result.entity_properties.type,
          entity_content: result.entity_content
        })
      }
    } else if (is_thread_metadata(file_path)) {
      log(`Reading thread metadata from ${file_path}`)
      const content = await fs.readFile(file_path, 'utf8')
      const metadata = JSON.parse(content)

      old_value = metadata.public_read

      if (!dry_run) {
        metadata.public_read = public_read
        await fs.writeFile(file_path, JSON.stringify(metadata, null, 2) + '\n')
      }
    } else {
      throw new Error(
        'Unsupported file type. Only .md and metadata.json files are supported.'
      )
    }

    log(
      `${dry_run ? 'Would update' : 'Updated'} ${file_path} with public_read: ${public_read}`
    )
    return {
      success: true,
      file_path,
      old_value,
      new_value: public_read,
      dry_run
    }
  } catch (error) {
    log(
      `Error ${dry_run ? 'checking' : 'updating'} ${file_path}: ${error.message}`
    )
    return { success: false, file_path, error: error.message }
  }
}

async function process_file(file_path, public_read, dry_run = false) {
  try {
    await fs.access(file_path)
    return await update_file(file_path, public_read, dry_run)
  } catch {
    return { success: false, file_path, error: 'File not found' }
  }
}

async function find_matching_files(pattern, user_base_directory) {
  // Check if pattern is an absolute path without glob characters (single file)
  const has_glob_chars = /[*?[\]{}]/.test(pattern)

  if (path.isAbsolute(pattern) && !has_glob_chars) {
    // Single absolute file path - check if it exists and is supported
    try {
      const stat = await fs.stat(pattern)
      if (
        stat.isFile() &&
        (is_markdown_file(pattern) || is_thread_metadata(pattern))
      ) {
        return [pattern]
      }
    } catch {
      // File doesn't exist
    }
    return []
  }

  // Handle glob patterns
  let base_dir
  let match_pattern

  if (path.isAbsolute(pattern)) {
    // For absolute paths with globs, find the first directory without glob characters
    const pattern_parts = pattern.split(path.sep)
    const glob_start_index = pattern_parts.findIndex((part) =>
      /[*?[\]{}]/.test(part)
    )

    base_dir = pattern_parts.slice(0, glob_start_index).join(path.sep) || '/'
    match_pattern = pattern_parts.slice(glob_start_index).join(path.sep)
  } else {
    base_dir = user_base_directory || process.cwd()
    match_pattern = pattern
  }

  const matcher = picomatch(match_pattern)
  const files = []

  async function walk_directory(dir, relative_path = '') {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const full_path = path.join(dir, entry.name)
        const rel_path = relative_path
          ? path.join(relative_path, entry.name)
          : entry.name

        if (entry.isDirectory()) {
          await walk_directory(full_path, rel_path)
        } else if (
          entry.isFile() &&
          (matcher(rel_path) || matcher(entry.name))
        ) {
          if (is_markdown_file(full_path) || is_thread_metadata(full_path)) {
            files.push(full_path)
          }
        }
      }
    } catch (error) {
      log(`Error reading directory ${dir}: ${error.message}`)
    }
  }

  await walk_directory(base_dir)
  return files
}

async function handle_set_command(argv) {
  const { pattern, value, dryRun } = argv
  const user_base_directory =
    argv.userBaseDirectory || config.user_base_directory

  if (!validate_boolean(value)) {
    console.error(
      `Error: Invalid boolean value '${value}'. Use 'true' or 'false'.`
    )
    process.exit(1)
  }

  const public_read = parse_boolean(value)

  console.log(`Finding files matching pattern: ${pattern}`)
  console.log(`Setting public_read to: ${public_read}`)
  if (dryRun) {
    console.log('Running in dry-run mode (no changes will be made)')
  }
  console.log()

  const files = await find_matching_files(pattern, user_base_directory)

  if (files.length === 0) {
    console.log(`No supported files found matching pattern: ${pattern}`)
    process.exit(0)
  }

  console.log(`Found ${files.length} file(s) to process:`)
  files.forEach((file) => console.log(`   ${file}`))
  console.log()

  const results = []
  for (const file of files) {
    const result = await process_file(file, public_read, dryRun)
    results.push(result)

    const filename = path.basename(result.file_path)
    if (result.success) {
      const status = result.dry_run ? '[DRY RUN]' : 'SUCCESS'
      const change =
        result.old_value !== result.new_value
          ? `${result.old_value} -> ${result.new_value}`
          : `${result.new_value} (no change)`
      console.log(`${status} ${filename}: ${change}`)
    } else {
      console.log(`ERROR ${filename}: ${result.error}`)
    }
  }

  const successful = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length
  const changed = results.filter(
    (r) => r.success && r.old_value !== r.new_value
  ).length

  console.log()
  console.log('Summary:')
  console.log(`   Successful: ${successful}`)
  console.log(`   Failed: ${failed}`)
  console.log(`   Changed: ${changed}`)

  if (dryRun && changed > 0) {
    console.log()
    console.log('Run without --dry-run to apply these changes')
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName('entity-visibility')
    .usage('Manage public_read settings for entities and thread metadata')
    .command(
      'set <pattern> <value>',
      'Set public_read field for files matching pattern',
      (yargs) => {
        return yargs
          .positional('pattern', {
            describe: 'File path or glob pattern to match files',
            type: 'string'
          })
          .positional('value', {
            describe: 'Boolean value: true or false',
            type: 'string'
          })
          .option('dry-run', {
            describe: 'Preview changes without applying them',
            type: 'boolean',
            default: false
          })
          .option('user-base-directory', {
            describe: 'User base directory path',
            type: 'string',
            default: config.user_base_directory
          })
      },
      handle_set_command
    )
    .option('verbose', {
      alias: 'v',
      describe: 'Enable verbose logging',
      type: 'boolean',
      default: false
    })
    .help()
    .alias('help', 'h')
    .example('$0 set "task/**/*.md" true', 'Set all task entities to public')
    .example(
      '$0 set "thread/*/metadata.json" false',
      'Set all thread metadata to private'
    )
    .example(
      '$0 set "**/*.md" true --dry-run',
      'Preview setting all entities to public'
    )
    .demandCommand(1, 'You must provide a command')
    .strict().argv

  // Enable debug logging if verbose
  if (argv.verbose) {
    debug.enabled = () => true
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message)
  process.exit(1)
})
