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

const log = debug('markdown:scanner:filesystem')
debug.enable('markdown:scanner:filesystem')

/**
 * Get list of markdown files from the filesystem recursively, including submodules
 * @param {Object} params - Parameters
 * @param {string} [params.path_pattern] - Optional glob pattern for filtering files by path
 * @returns {Promise<Array>} Array of file metadata objects
 */
export async function list_markdown_files_in_filesystem({ path_pattern }) {
  const files = []
  const file_paths_seen = new Set() // Track file paths to handle duplicates

  try {
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
        path_pattern
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
  const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
    .option('path_pattern', {
      alias: 'p',
      description: 'Path pattern to filter files by (e.g., "*.md")',
      type: 'string'
    })
    .help().argv

  const main = async () => {
    // Handle directory registration using the reusable function
    handle_cli_directory_registration(argv)

    let error
    try {
      const files = await list_markdown_files_in_filesystem({
        path_pattern: argv.path_pattern
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
