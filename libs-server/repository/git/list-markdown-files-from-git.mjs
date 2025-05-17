import debug from 'debug'
import path from 'path'
import {
  list_files,
  get_file_git_sha
} from '#libs-server/git/file-operations.mjs'

import { create_file_info } from '#libs-server/repository/common/file-utils.mjs'

const log = debug('repository:git:list-files')

/**
 * List markdown files from a git repository
 *
 * @param {Object} params - Parameters
 * @param {string} params.repo_path - Path to the git repository
 * @param {string} params.branch - Git branch to scan
 * @param {string} [params.path_pattern] - Pattern for files to include (default: '*.md')
 * @param {string} [params.submodule_base_path] - Base path if repository is a submodule
 * @returns {Promise<Array>} - Array of file information objects
 */
export async function list_markdown_files_from_git({
  repo_path,
  branch,
  path_pattern = '*.md',
  submodule_base_path = null
}) {
  // Validate required parameters
  if (!repo_path) {
    throw new Error('repo_path is required')
  }

  if (!branch) {
    throw new Error('branch is required')
  }

  const files = []
  const file_paths_seen = new Set()

  try {
    // Use the list_files function to get all markdown files
    const markdown_files = await list_files({
      repo_path,
      ref: branch,
      path_pattern
    })

    // Process each file
    for (const file_path of markdown_files) {
      // Skip if this path was already seen
      const absolute_path = path.join(repo_path, file_path)
      if (file_paths_seen.has(absolute_path)) {
        continue
      }

      // Check if file should be processed based on repo type
      if (repo_type === 'system' && !file_path.startsWith('system/')) {
        continue
      }

      // Get file hash using get_file_git_sha function
      const git_sha = await get_file_git_sha({
        repo_path,
        file_path,
        branch
      })

      if (!git_sha) {
        log(`Could not get git SHA for ${file_path}, skipping`)
        continue
      }

      const file_info = create_file_info({
        repo_path,
        relative_path: file_path,
        absolute_path,
        source: 'git',
        submodule_base_path,
        // Git-specific properties
        git_sha,
        branch
      })

      files.push(file_info)
      file_paths_seen.add(absolute_path)
    }

    log(`Found ${files.length} markdown files from git repository`)
    return files
  } catch (error) {
    log(`Error scanning git repository ${repo_path}:`, error)
    throw error
  }
}

export default list_markdown_files_from_git
