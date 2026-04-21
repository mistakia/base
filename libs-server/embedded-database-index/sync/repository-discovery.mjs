/**
 * Repository Discovery
 *
 * Dynamically discover main repository and all git submodules.
 * Provides utilities for multi-repository sync state management.
 */

import path from 'path'
import debug from 'debug'

import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const log = debug('embedded-index:sync:repo-discovery')

/** Discover all repositories (main repo + submodules) */
export async function discover_repositories({ repo_path }) {
  const repositories = [
    {
      path: repo_path,
      relative_path: '.',
      is_submodule: false
    }
  ]

  try {
    // Get submodule paths using git submodule status --recursive
    // Output format: " abc123 path/to/submodule (branch)" or "-abc123 path (not initialized)"
    const { stdout } = await execute_shell_command(
      'git submodule status --recursive',
      { cwd: repo_path }
    )

    if (!stdout.trim()) {
      log('No submodules found in %s', repo_path)
      return repositories
    }

    for (const line of stdout.trim().split('\n')) {
      if (!line.trim()) continue

      // Parse submodule status line
      // Format: [+-U ]<sha> <path> [(description)]
      // - prefix: not initialized or inactive (submodule.<path>.active=false)
      // + prefix: checked out to different commit than recorded
      // U prefix: merge conflicts
      // space prefix: normal
      if (line.startsWith('-')) {
        log('Skipping inactive submodule: %s', line.trim())
        continue
      }
      const match = line.match(/^[\s+U]?([a-f0-9]+)\s+(\S+)/)

      if (match) {
        const [, , submodule_path] = match
        const absolute_path = path.join(repo_path, submodule_path)

        // Check if submodule is initialized (has .git)
        const is_initialized = await check_submodule_initialized({
          submodule_path: absolute_path
        })

        if (is_initialized) {
          repositories.push({
            path: absolute_path,
            relative_path: submodule_path,
            is_submodule: true
          })
          log('Discovered submodule: %s', submodule_path)
        } else {
          log('Skipping uninitialized submodule: %s', submodule_path)
        }
      }
    }
  } catch (error) {
    // No submodules or git error - continue with main repo only
    log('Error discovering submodules: %s', error.message)
  }

  log('Discovered %d repositories', repositories.length)
  return repositories
}

/**
 * Check if a submodule is initialized
 *
 * @param {Object} params
 * @param {string} params.submodule_path - Absolute path to submodule
 * @returns {Promise<boolean>}
 */
async function check_submodule_initialized({ submodule_path }) {
  try {
    // Try to get HEAD - will fail if not initialized
    await execute_shell_command('git rev-parse HEAD', { cwd: submodule_path })
    return true
  } catch {
    return false
  }
}

/** Get current HEAD SHA for a repository */
export async function get_repository_head_sha({ repo_path }) {
  try {
    const { stdout } = await execute_shell_command('git rev-parse HEAD', {
      cwd: repo_path
    })
    return stdout.trim()
  } catch (error) {
    log('Failed to get HEAD SHA for %s: %s', repo_path, error.message)
    throw error
  }
}

/**
 * Verify if a commit SHA exists in a repository's history.
 * SECURITY: SHA validated with strict regex [a-f0-9]{4,40}, quoted for defense-in-depth.
 */
export async function verify_commit_exists({ repo_path, sha }) {
  // Validate SHA format - only hex characters (4-40 chars for abbreviated or full SHA)
  if (!sha || !/^[a-f0-9]{4,40}$/i.test(sha)) {
    log('Invalid SHA format: %s', sha)
    return false
  }

  try {
    // Single quotes prevent command injection even if validation is loosened
    await execute_shell_command(`git cat-file -t '${sha}'`, { cwd: repo_path })
    return true
  } catch {
    return false
  }
}

/** Get changed files within a single repository since a given SHA */
export async function get_changed_files_in_repo({
  repo_path,
  last_sha,
  relative_prefix = ''
}) {
  const changed_files = new Set()

  // Get committed changes since last sync
  if (last_sha) {
    const sha_exists = await verify_commit_exists({ repo_path, sha: last_sha })

    if (sha_exists) {
      try {
        // SHA already validated by verify_commit_exists, quotes for defense-in-depth
        const { stdout } = await execute_shell_command(
          `git diff --name-only '${last_sha}' HEAD`,
          { cwd: repo_path }
        )

        if (stdout.trim()) {
          for (const file of stdout.trim().split('\n')) {
            if (file.trim()) {
              changed_files.add(file.trim())
            }
          }
        }
      } catch (error) {
        log('Failed to get git diff for %s: %s', repo_path, error.message)
      }
    } else {
      log(
        'Last sync SHA %s no longer exists in %s, will include all uncommitted',
        last_sha,
        repo_path
      )
    }
  }

  // Get uncommitted changes (staged, unstaged, untracked)
  try {
    const { stdout } = await execute_shell_command('git status --porcelain', {
      cwd: repo_path
    })

    if (stdout.trim()) {
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue

        // Parse porcelain format: XY filename or XY orig -> renamed
        // X = index status, Y = worktree status
        const file_part = line.slice(3) // Skip status codes and space
        const arrow_index = file_part.indexOf(' -> ')
        let file_path =
          arrow_index >= 0 ? file_part.slice(arrow_index + 4) : file_part

        if (file_path.trim()) {
          file_path = file_path.trim()

          // Untracked directories appear with trailing slash (e.g., "uuid/")
          // For thread submodule (relative_prefix === 'thread'), expand to include metadata.json
          // so the incremental sync can detect new/modified thread metadata
          if (
            file_path.endsWith('/') &&
            relative_prefix === 'thread' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/i.test(
              file_path
            )
          ) {
            changed_files.add(`${file_path}metadata.json`)
            log(
              'Expanded untracked thread directory %s to include metadata.json',
              file_path
            )
          } else {
            changed_files.add(file_path)
          }
        }
      }
    }
  } catch (error) {
    log('Failed to get git status for %s: %s', repo_path, error.message)
  }

  // Apply relative prefix for submodules
  if (relative_prefix && relative_prefix !== '.') {
    return Array.from(changed_files).map((file) =>
      path.join(relative_prefix, file)
    )
  }

  return Array.from(changed_files)
}

/** Get all changed files across main repo and all submodules */
export async function get_all_changed_files({ repo_path, sync_state = {} }) {
  const repositories = await discover_repositories({ repo_path })
  const all_changed_files = new Set()
  const new_sync_state = {}

  for (const repo of repositories) {
    const last_sha = sync_state[repo.relative_path]?.sha || null
    let current_sha

    try {
      current_sha = await get_repository_head_sha({ repo_path: repo.path })
    } catch (error) {
      log('Failed to get HEAD for %s, skipping: %s', repo.path, error.message)
      continue
    }

    const changed_files = await get_changed_files_in_repo({
      repo_path: repo.path,
      last_sha,
      relative_prefix: repo.is_submodule ? repo.relative_path : ''
    })

    for (const file of changed_files) {
      all_changed_files.add(file)
    }

    new_sync_state[repo.relative_path] = { sha: current_sha }

    log(
      'Repository %s: %d changed files (SHA: %s -> %s)',
      repo.relative_path,
      changed_files.length,
      last_sha?.slice(0, 7) || 'none',
      current_sha.slice(0, 7)
    )
  }

  return {
    changed_files: Array.from(all_changed_files),
    new_sync_state
  }
}
