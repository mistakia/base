import path from 'path'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { create_file_info } from '#root/libs-server/repository/create-file-info.mjs'
import is_main from '#libs-server/utils/is-main.mjs'
import { list_files_recursive } from './list-files-recursive.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration,
  get_registered_directories
} from '#libs-server/base-uri/index.mjs'
import { load_entity_scan_config } from '#libs-server/entity/filesystem/entity-scan-config.mjs'

const log = debug('markdown:scanner:filesystem')

/**
 * Get list of markdown files from the filesystem recursively, including separate user repositories
 * @param {Object} params - Parameters
 * @param {string[]} [params.include_path_patterns] - Optional array of glob patterns for including files by path
 * @param {string[]} [params.exclude_path_patterns] - Optional array of glob patterns for excluding files by path
 * @returns {Promise<Array>} Array of file metadata objects
 */
export async function list_markdown_files_in_filesystem({
  include_path_patterns = [],
  exclude_path_patterns = []
}) {
  const files = []
  const file_paths_seen = new Set() // Track file paths to handle duplicates

  try {
    // Load entity scan config and merge exclude patterns
    const scan_config = await load_entity_scan_config()
    const merged_exclude_patterns = [
      ...scan_config.exclude_path_patterns,
      ...exclude_path_patterns
    ]

    // Get registered directories
    const { system_base_directory, user_base_directory } =
      get_registered_directories()

    // Process both system and user directories
    const directories = [
      { base_directory: system_base_directory, name: 'system' },
      { base_directory: user_base_directory, name: 'user' }
    ]

    for (const { base_directory, name } of directories) {
      if (!base_directory) continue

      // Process files from this directory
      const directory_files = await list_files_recursive({
        directory: base_directory,
        file_extension: '.md',
        absolute_paths: false,
        include_path_patterns,
        exclude_path_patterns: merged_exclude_patterns
      })

      // Add files from this directory
      for (const relative_path of directory_files) {
        const absolute_path = path.join(base_directory, relative_path)

        if (file_paths_seen.has(absolute_path)) {
          continue
        }

        const file_info = create_file_info({
          repo_path: base_directory,
          relative_path,
          absolute_path
        })

        files.push(file_info)
        file_paths_seen.add(absolute_path)
      }

      log(
        `Found ${directory_files.length} markdown files from filesystem in ${name} repository`
      )
    }

    log(`Found ${files.length} total markdown files from filesystem`)
    return files
  } catch (error) {
    log('Error scanning directories:', error)
    throw error
  }
}

if (is_main(import.meta.url)) {
  debug.enable('markdown:scanner:filesystem')

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

  const main = async () => {
    // Handle directory registration using the reusable function
    handle_cli_directory_registration(argv)

    let error
    try {
      const files = await list_markdown_files_in_filesystem({
        include_path_patterns: argv.include_path_patterns,
        exclude_path_patterns: argv.exclude_path_patterns
      })
      console.log(`Found ${files.length} markdown files`)
      console.log(JSON.stringify(files, null, 2))
    } catch (err) {
      error = err
      console.error('Error:', error.message)
    }
    process.exit(error ? 1 : 0)
  }

  main()
}
