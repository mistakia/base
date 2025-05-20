import path from 'path'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { create_file_info } from '#root/libs-server/repository/create-file-info.mjs'
import git from '#libs-server/git/index.mjs'
import is_main from '#libs-server/utils/is-main.mjs'
import config from '#config'
import { list_files_recursive } from './list-files-recursive.mjs'

const log = debug('markdown:scanner:filesystem')
debug.enable('markdown:scanner:filesystem')

/**
 * Get list of markdown files from the filesystem recursively, including submodules
 * @param {Object} params - Parameters
 * @param {string} params.root_base_directory - The root base directory to search in
 * @param {string} [params.submodule_base_path] - If provided, only search within this specific submodule
 * @param {string} [params.path_pattern] - Optional glob pattern for filtering files by path
 * @returns {Promise<Array>} Array of file metadata objects
 */
export async function list_markdown_files_in_filesystem({
  root_base_directory,
  submodule_base_path,
  path_pattern
}) {
  // Validate required parameters
  if (!root_base_directory) {
    throw new Error('root_base_directory is required')
  }

  const files = []
  const file_paths_seen = new Set() // Track file paths to handle duplicates

  try {
    // Find all submodules
    let submodules = []
    try {
      submodules = await git.list_submodules({
        repo_path: root_base_directory
      })
    } catch (error) {
      log('Warning: Error listing submodules:', error.message)
    }

    // If submodule_base_path is provided, only search in that submodule
    if (submodule_base_path) {
      log(`Searching only in submodule path: ${submodule_base_path}`)
      const submodule = submodules.find((s) => s.path === submodule_base_path)

      if (!submodule) {
        log(`Submodule ${submodule_base_path} not found`)
        return []
      }

      const submodule_path = path.join(root_base_directory, submodule_base_path)
      const submodule_files = await list_files_recursive({
        directory: submodule_path,
        file_extension: '.md',
        absolute_paths: false,
        path_pattern
      })

      for (const relative_path of submodule_files) {
        const absolute_path = path.join(submodule_path, relative_path)

        if (file_paths_seen.has(absolute_path)) {
          continue
        }

        const file_info = create_file_info({
          repo_path: submodule_path,
          relative_path,
          absolute_path,
          source: 'filesystem',
          submodule_base_path: submodule.path
        })

        files.push(file_info)
        file_paths_seen.add(absolute_path)
      }

      log(
        `Found ${files.length} markdown files from filesystem in submodule ${submodule_base_path}`
      )
      return files
    }

    // Process root repository system files
    const system_files = await list_files_recursive({
      directory: root_base_directory,
      file_extension: '.md',
      absolute_paths: false,
      path_pattern
    })

    // Add system files from root repository
    for (const relative_path of system_files) {
      const absolute_path = path.join(root_base_directory, relative_path)

      if (file_paths_seen.has(absolute_path)) {
        continue
      }

      const file_info = create_file_info({
        repo_path: root_base_directory,
        relative_path,
        absolute_path,
        source: 'filesystem'
      })

      files.push(file_info)
      file_paths_seen.add(absolute_path)
    }

    // If no submodule_base_path was provided, we search the root repo but exclude submodules
    // So we don't need to process submodules here anymore

    log(
      `Found ${files.length} markdown files from filesystem in root repository (excluding submodules)`
    )
    return files
  } catch (error) {
    log(`Error scanning directory ${root_base_directory}:`, error)
    throw error
  }
}

if (is_main(import.meta.url)) {
  const argv = yargs(hideBin(process.argv))
    .option('root_base_directory', {
      alias: 'r',
      description: 'Root base directory to search in',
      type: 'string',
      demandOption: true,
      default: config.system_base_directory
    })
    .option('submodule_base_path', {
      alias: 's',
      description: 'If provided, only search within this specific submodule',
      type: 'string'
    })
    .option('path_pattern', {
      alias: 'p',
      description: 'Path pattern to filter files by (e.g., "*.md")',
      type: 'string'
    })
    .help().argv

  const main = async () => {
    let error
    try {
      const files = await list_markdown_files_in_filesystem({
        root_base_directory: argv.root_base_directory,
        submodule_base_path: argv.submodule_base_path,
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
