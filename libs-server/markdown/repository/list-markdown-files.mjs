import { promisify } from 'util'
import { exec } from 'child_process'
import path from 'path'
import debug from 'debug'
import fs from 'fs/promises'
import { get_file_git_sha } from '#libs-server/git/file-operations.mjs'

const log = debug('markdown:scanner')
const execute = promisify(exec)

/**
 * Get list of markdown files using git commands
 * @param {Array} repos Array of repository configs [{path, branch, is_submodule}]
 * @returns {Array} Array of file metadata objects
 */
export async function list_markdown_files_from_git(repos) {
  // Validate input
  if (!Array.isArray(repos)) {
    throw new Error('repos must be an array')
  }

  const files = []
  const file_paths_seen = new Set() // Track file paths to handle duplicates

  for (const repo of repos) {
    // Validate repo config
    if (!repo || typeof repo !== 'object') {
      log('Invalid repository configuration, skipping:', repo)
      continue
    }

    if (!repo.path) {
      log('Repository path is required, skipping')
      continue
    }

    if (!repo.branch) {
      log('Repository branch is required, skipping')
      continue
    }

    const repo_path = path.resolve(repo.path)

    try {
      // List all markdown files in the specified branch
      const { stdout: file_list } = await execute(
        `git ls-tree -r --name-only ${repo.branch} | grep -E "\\.(md|markdown)$"`,
        { cwd: repo_path }
      )

      // Process each file
      let files_array = file_list.trim().split('\n').filter(Boolean)

      if (repo.repo_type === 'system') {
        files_array = files_array.filter((file) => file.startsWith('system/'))
      }

      for (const file_path of files_array) {
        // Skip if this path was already seen (prioritize system over user files)
        const absolute_path = path.join(repo_path, file_path)
        if (file_paths_seen.has(absolute_path)) {
          continue
        }

        // Determine the correct path to use for git commands
        const git_relative_path = file_path

        // Handle system directory - prepend 'system/' for non-submodules when repo is system
        // TODO not sure this is needed
        // if (!is_submodule && repo_type === 'system') {
        //   git_relative_path = `system/${file_path}`
        // }

        // Get file hash in the specified branch
        const git_sha = await get_file_git_sha({
          repo_path,
          file_path: git_relative_path,
          branch: repo.branch
        })

        if (!git_sha) {
          log(
            `Failed to get git SHA for ${git_relative_path} in ${repo.branch}, skipping`
          )
          continue
        }

        const file_info = {
          repo_type: repo.repo_type,
          repo_path: repo.path,
          git_relative_path,
          absolute_path,
          git_sha,
          branch: repo.branch,
          is_submodule: repo.is_submodule
        }

        files.push(file_info)
        file_paths_seen.add(absolute_path)
      }
    } catch (error) {
      console.log(error)
      log(`Error scanning repository ${repo.path}:`, error)
    }
  }

  log(
    `Scanned ${files.length} markdown files from ${repos.length} repositories`
  )
  return files
}

/**
 * Get list of markdown files from the filesystem recursively
 * @param {Array} repos Array of repository configs [{path, repo_type}]
 * @returns {Promise<Array>} Array of file metadata objects
 */
export async function list_markdown_files_from_filesystem(repos) {
  // Validate input
  if (!Array.isArray(repos)) {
    throw new Error('repos must be an array')
  }

  const files = []
  const file_paths_seen = new Set() // Track file paths to handle duplicates

  // Helper function to recursively scan directories
  async function scan_directory(dir_path, repo_config) {
    try {
      const entries = await fs.readdir(dir_path, { withFileTypes: true })

      for (const entry of entries) {
        const full_path = path.join(dir_path, entry.name)

        // Skip hidden files and directories
        if (entry.name.startsWith('.')) {
          continue
        }

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await scan_directory(full_path, repo_config)
        } else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
          // Process markdown files
          if (file_paths_seen.has(full_path)) {
            continue
          }

          // Calculate relative path from repo root
          const relative_path = path.relative(repo_config.path, full_path)

          // Filter system files if needed
          if (
            repo_config.repo_type === 'system' &&
            !relative_path.startsWith('system/')
          ) {
            continue
          }

          const file_info = {
            repo_type: repo_config.repo_type,
            repo_path: repo_config.path,
            file_path: relative_path,
            absolute_path: full_path,
            // No git info for filesystem files
            source: 'filesystem'
          }

          files.push(file_info)
          file_paths_seen.add(full_path)
        }
      }
    } catch (error) {
      log(`Error scanning directory ${dir_path}:`, error)
    }
  }

  // Process each repository
  for (const repo of repos) {
    // Validate repo config
    if (!repo || typeof repo !== 'object') {
      log('Invalid repository configuration, skipping:', repo)
      continue
    }

    if (!repo.path) {
      log('Repository path is required, skipping')
      continue
    }

    const repo_path = path.resolve(repo.path)

    // Check if directory exists
    try {
      await fs.access(repo_path)
      await scan_directory(repo_path, repo)
    } catch (error) {
      log(`Error accessing repository directory ${repo_path}:`, error)
    }
  }

  log(
    `Scanned ${files.length} markdown files from ${repos.length} repositories (filesystem)`
  )
  return files
}
