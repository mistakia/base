import path from 'path'
import debug from 'debug'
import glob from 'glob'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { create_file_info } from '#root/libs-server/repository/create-file-info.mjs'
import git from '#libs-server/git/index.mjs'
import is_main from '#libs-server/utils/is-main.mjs'
import config from '#config'

const log = debug('markdown:scanner:filesystem')
debug.enable('markdown:scanner:filesystem')

/**
 * Checks if a file is a markdown file
 * @param {string} file_name - The name of the file
 * @returns {boolean} True if the file is a markdown file
 */
function is_markdown_file(file_name) {
  return /\.(md|markdown)$/i.test(file_name)
}

/**
 * Get list of markdown files from the filesystem recursively, including submodules
 * @param {Object} params - Parameters
 * @param {string} params.root_base_directory - The root base directory to search in
 * @returns {Promise<Array>} Array of file metadata objects
 */
export async function list_markdown_files_in_filesystem({
  root_base_directory
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

    // Process root repository system files
    const system_files = glob.sync('system/**/*.md', {
      cwd: root_base_directory,
      absolute: false,
      nodir: true
    })

    // Add system files from root repository
    for (const relative_path of system_files) {
      const absolute_path = path.join(root_base_directory, relative_path)

      if (
        !is_markdown_file(relative_path) ||
        file_paths_seen.has(absolute_path)
      ) {
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

    // Process each submodule
    for (const submodule of submodules) {
      const submodule_path = path.join(root_base_directory, submodule.path)

      const submodule_files = glob.sync('**/*.md', {
        cwd: submodule_path,
        absolute: false,
        nodir: true
      })

      for (const relative_path of submodule_files) {
        const absolute_path = path.join(submodule_path, relative_path)

        if (
          !is_markdown_file(relative_path) ||
          file_paths_seen.has(absolute_path)
        ) {
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
    }

    log(`Found ${files.length} markdown files from filesystem`)
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
    .help().argv

  const main = async () => {
    let error
    try {
      const files = await list_markdown_files_in_filesystem({
        root_base_directory: argv.root_base_directory
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
