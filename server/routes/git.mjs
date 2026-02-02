import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'

import config from '#config'
import {
  get_status,
  get_multi_repo_status,
  get_working_tree_diff,
  get_file_content_for_diff,
  add_files,
  unstage_files,
  commit_changes,
  push_branch,
  pull,
  get_conflicts,
  get_conflict_versions,
  resolve_conflict,
  read_file_from_ref,
  is_merging,
  get_current_branch_name,
  get_merge_head_branch_name,
  abort_merge,
  discard_changes
} from '#libs-server/git/index.mjs'
import { parse_jwt_token } from '#server/middleware/jwt-parser.mjs'
import { attach_permission_context } from '#server/middleware/permission/middleware.mjs'
import { check_permissions_batch } from '#server/middleware/permission/permission-service.mjs'
import {
  create_base_uri_from_path,
  get_user_base_directory
} from '#libs-server/base-uri/index.mjs'
import { redact_text_content } from '#server/middleware/content-redactor.mjs'
import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'
import { generate_commit_message } from '#libs-server/git/generate-commit-message.mjs'
import {
  get_cached_status_all,
  is_cache_ready,
  get_cache_initializing
} from '#libs-server/git/git-status-cache.mjs'

const router = express.Router()
const log = debug('api:git')

/**
 * Default merge state for repos not in a merge
 */
const DEFAULT_MERGE_STATE = {
  is_merging: false,
  ours_branch: null,
  theirs_branch: null
}

/**
 * Get merge states for multiple repositories in parallel
 * @param {string[]} repo_paths - Array of repository paths
 * @returns {Promise<Map<string, Object>>} Map of repo_path to merge state
 */
const get_merge_states_for_repos = async (repo_paths) => {
  const merge_states = await Promise.all(
    repo_paths.map(async (repo_path) => {
      const merging = await is_merging({ repo_path })
      if (merging) {
        const [ours_branch, theirs_branch] = await Promise.all([
          get_current_branch_name({ repo_path }),
          get_merge_head_branch_name({ repo_path })
        ])
        return { repo_path, is_merging: true, ours_branch, theirs_branch }
      }
      return { repo_path, ...DEFAULT_MERGE_STATE }
    })
  )
  return new Map(merge_states.map((ms) => [ms.repo_path, ms]))
}

/**
 * Get user base directory dynamically
 * Falls back to config if registry is not initialized
 * @returns {string} User base directory path
 */
const get_user_base_dir = () => {
  try {
    return get_user_base_directory()
  } catch {
    return config.user_base_directory
  }
}

// Apply authentication and permission context middleware to all git routes
router.use(parse_jwt_token())
router.use(attach_permission_context())

/**
 * Validate that a repo_path is within allowed directories
 * Allowed: user_base_directory itself or any repository in repository/active/
 * @param {string} repo_path - Repository path to validate
 * @returns {Object} { valid: boolean, resolved_path: string, error?: string }
 */
const validate_repo_path = async (repo_path) => {
  if (!repo_path) {
    return { valid: false, error: 'repo_path is required' }
  }

  const user_base_dir = get_user_base_dir()

  // Resolve to absolute path
  let resolved_path = repo_path
  if (!path.isAbsolute(repo_path)) {
    resolved_path = path.resolve(user_base_dir, repo_path)
  }

  // Normalize and ensure it doesn't escape base directory
  resolved_path = path.normalize(resolved_path)

  // Check if it's the user_base_directory itself
  if (resolved_path === user_base_dir) {
    return { valid: true, resolved_path }
  }

  // Check if it's within user_base_directory
  if (!resolved_path.startsWith(user_base_dir + path.sep)) {
    return {
      valid: false,
      error: 'Repository path must be within user base directory'
    }
  }

  // Check if it's a valid git repository (has .git directory or is part of one)
  try {
    // Check if path exists
    await fs.access(resolved_path)

    // Check for .git directory or file (for worktrees)
    const git_path = path.join(resolved_path, '.git')
    try {
      await fs.access(git_path)
      return { valid: true, resolved_path }
    } catch {
      // May be inside a git repo but not the root
      // Check parent directories for .git
      let check_path = resolved_path
      while (check_path.startsWith(user_base_dir)) {
        const parent_git_path = path.join(check_path, '.git')
        try {
          await fs.access(parent_git_path)
          // Found a .git directory in parent - this is valid
          return { valid: true, resolved_path }
        } catch {
          // Move to parent directory
          const parent = path.dirname(check_path)
          if (parent === check_path) break // Reached root
          check_path = parent
        }
      }
      return { valid: false, error: 'Not a git repository' }
    }
  } catch {
    return { valid: false, error: 'Repository path does not exist' }
  }
}

/**
 * Parse git worktree list --porcelain output into worktree paths
 * Skips the first entry (main working tree) since it is already discovered
 * @param {string} output - Output from git worktree list --porcelain
 * @returns {string[]} Array of worktree absolute paths (excludes bare and main)
 */
const parse_worktree_list = (output) => {
  if (!output.trim()) {
    return []
  }

  const worktree_paths = []
  const blocks = output.trim().split('\n\n')

  // Skip the first block (main working tree)
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]
    const lines = block.split('\n')

    let worktree_path = null
    let is_bare = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        worktree_path = line.slice('worktree '.length)
      } else if (line === 'bare') {
        is_bare = true
      }
    }

    if (worktree_path && !is_bare) {
      worktree_paths.push(worktree_path)
    }
  }

  return worktree_paths
}

/**
 * Recursively parse .gitmodules files to discover submodule paths.
 * Much faster than `git submodule status --recursive` (~22ms vs ~1100ms).
 *
 * @param {string} repo_dir - Root directory to start from
 * @returns {Promise<string[]>} Array of relative submodule paths
 */
const parse_gitmodules_recursive = async (repo_dir) => {
  const paths = []
  try {
    const content = await fs.readFile(
      path.join(repo_dir, '.gitmodules'),
      'utf-8'
    )
    for (const match of content.matchAll(/^\s*path\s*=\s*(.+)$/gm)) {
      const rel_path = match[1].trim()
      paths.push(rel_path)
      // Check for nested .gitmodules in submodule
      const nested = await parse_gitmodules_recursive(
        path.join(repo_dir, rel_path)
      )
      paths.push(...nested.map((np) => path.join(rel_path, np)))
    }
  } catch {
    // No .gitmodules file or not readable - not an error
  }
  return paths
}

/**
 * Get list of known repositories (user_base, repository/active/*, and git submodules)
 * @returns {Promise<{repo_paths: string[], worktree_metadata: Map<string, {parent_repo_path: string, parent_repo_name: string}>}>}
 */
const get_known_repositories = async () => {
  const user_base_dir = get_user_base_dir()
  const repos = [user_base_dir]
  const seen = new Set([user_base_dir])
  const worktree_metadata = new Map()

  // Collect potential repos for parallel checking
  const potential_repos = []

  // Scan repository/active directory
  const active_repos_path = path.join(user_base_dir, 'repository', 'active')
  try {
    const entries = await fs.readdir(active_repos_path, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        potential_repos.push(path.join(active_repos_path, entry.name))
      }
    }
  } catch {
    log('repository/active directory not found')
  }

  // Detect git submodules by parsing .gitmodules files (fast, no shell command)
  try {
    const submodule_paths = await parse_gitmodules_recursive(user_base_dir)
    for (const relative_path of submodule_paths) {
      potential_repos.push(path.join(user_base_dir, relative_path))
    }
  } catch (error) {
    log('Failed to parse .gitmodules:', error.message)
  }

  // Check all potential repos in parallel
  const check_results = await Promise.all(
    potential_repos.map(async (repo_path) => {
      if (seen.has(repo_path)) return null
      try {
        await fs.access(path.join(repo_path, '.git'))
        return repo_path
      } catch {
        return null
      }
    })
  )

  // Add valid repos
  for (const repo_path of check_results) {
    if (repo_path && !seen.has(repo_path)) {
      repos.push(repo_path)
      seen.add(repo_path)
    }
  }

  // Discover worktrees for repos with .git directories (not worktrees themselves)
  // Worktrees have a .git file, not a directory, and return the same worktree list as their parent
  const repos_with_git_dirs = await Promise.all(
    repos.map(async (repo_path) => {
      try {
        const git_path = path.join(repo_path, '.git')
        const stats = await fs.stat(git_path)
        return stats.isDirectory() ? repo_path : null
      } catch {
        return null
      }
    })
  )

  const worktree_results = await Promise.all(
    repos_with_git_dirs.filter(Boolean).map(async (repo_path) => {
      try {
        const { stdout } = await execute_shell_command(
          'git worktree list --porcelain',
          { cwd: repo_path }
        )
        const worktree_paths = parse_worktree_list(stdout)
        return { parent_repo_path: repo_path, worktree_paths }
      } catch {
        return { parent_repo_path: repo_path, worktree_paths: [] }
      }
    })
  )

  for (const { parent_repo_path, worktree_paths } of worktree_results) {
    const parent_repo_name = path.basename(parent_repo_path)
    for (const worktree_path of worktree_paths) {
      // Only include worktrees within the user base directory
      if (!worktree_path.startsWith(user_base_dir + path.sep)) {
        log(`Skipping worktree outside user base: ${worktree_path}`)
        continue
      }
      if (!seen.has(worktree_path)) {
        repos.push(worktree_path)
        seen.add(worktree_path)
        worktree_metadata.set(worktree_path, {
          parent_repo_path,
          parent_repo_name
        })
      }
    }
  }

  return { repo_paths: repos, worktree_metadata }
}

/**
 * Check repository permission for a user
 * @param {Object} params - Parameters
 * @param {string} params.repo_path - Absolute repository path
 * @param {string|null} params.user_public_key - User's public key
 * @param {string} params.permission_type - 'read' or 'write'
 * @param {Object} params.permission_context - Permission context from request
 * @returns {Promise<{allowed: boolean, is_owner: boolean, reason: string}>}
 */
const check_repo_permission = async ({
  repo_path,
  user_public_key,
  permission_type = 'read',
  permission_context
}) => {
  const resource_path = create_base_uri_from_path(repo_path)
  log(`Checking ${permission_type} permission for repo: ${resource_path}`)

  const result = await permission_context.check_permission({ resource_path })

  const permission = permission_type === 'write' ? result.write : result.read
  const is_owner = result.read?.reason?.includes('owner') || false

  return {
    allowed: permission.allowed,
    is_owner,
    reason: permission.reason,
    resource_path
  }
}

/**
 * Check permission for a specific file within a repository
 * @param {Object} params - Parameters
 * @param {string} params.repo_path - Absolute repository path
 * @param {string} params.file_path - Relative file path within repo
 * @param {string|null} params.user_public_key - User's public key
 * @param {string} params.permission_type - 'read' or 'write'
 * @param {Object} params.permission_context - Permission context from request
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
const check_file_permission = async ({
  repo_path,
  file_path,
  user_public_key,
  permission_type = 'read',
  permission_context
}) => {
  const absolute_file_path = path.join(repo_path, file_path)
  const resource_path = create_base_uri_from_path(absolute_file_path)
  log(`Checking ${permission_type} permission for file: ${resource_path}`)

  const result = await permission_context.check_permission({ resource_path })
  const permission = permission_type === 'write' ? result.write : result.read

  return {
    allowed: permission.allowed,
    reason: permission.reason,
    resource_path
  }
}

/**
 * Filter file lists by permission, only checking .md files
 * Non-.md files are allowed by default (inherit from repo permission)
 * .md files require explicit read permission (default deny)
 *
 * @param {Object} params - Parameters
 * @param {Object} params.file_lists - Object with arrays of files keyed by list name
 * @param {string} params.repo_path - Repository path for building resource URIs
 * @param {string|null} params.user_public_key - User's public key
 * @returns {Promise<Object>} Object with same keys as file_lists, filtered arrays as values
 */
const filter_md_files_by_permission = async ({
  file_lists,
  repo_path,
  user_public_key
}) => {
  // Collect all .md files across all lists
  const all_files = Object.values(file_lists).flat()
  const md_files = all_files.filter((file) => {
    const file_path = typeof file === 'string' ? file : file.path
    return file_path.endsWith('.md')
  })

  // If no .md files, return original lists (non-.md files allowed by default)
  if (md_files.length === 0) {
    return file_lists
  }

  // Build permission map for .md files
  const resource_paths = md_files.map((file) => {
    const file_path = typeof file === 'string' ? file : file.path
    return create_base_uri_from_path(path.join(repo_path, file_path))
  })

  const permissions = await check_permissions_batch({
    user_public_key,
    resource_paths
  })

  // Build lookup map: file_path -> allowed
  const md_permission_map = new Map()
  md_files.forEach((file, index) => {
    const file_path = typeof file === 'string' ? file : file.path
    md_permission_map.set(
      file_path,
      permissions[resource_paths[index]]?.read?.allowed === true
    )
  })

  // Filter each list
  const filter_fn = (file) => {
    const file_path = typeof file === 'string' ? file : file.path
    if (!file_path.endsWith('.md')) return true
    return md_permission_map.get(file_path) ?? false
  }

  const result = {}
  for (const [key, files] of Object.entries(file_lists)) {
    result[key] = (files || []).filter(filter_fn)
  }

  return result
}

/**
 * Middleware to check repository read permission
 * Extracts repo_path from query or body, validates, and checks permission
 */
const require_repo_read_permission = async (req, res, next) => {
  try {
    const repo_path = req.query.repo_path || req.body?.repo_path

    const validation = await validate_repo_path(repo_path)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
    }

    const permission = await check_repo_permission({
      repo_path: validation.resolved_path,
      user_public_key: req.user?.user_public_key,
      permission_type: 'read',
      permission_context: req.permission_context
    })

    if (!permission.allowed) {
      log(`Read access denied to repo: ${validation.resolved_path}`)
      return res.status(403).json({
        error: 'Access denied',
        message: permission.reason,
        permission_denied: true
      })
    }

    // Attach validated path and permission info to request
    req.validated_repo_path = validation.resolved_path
    req.repo_permission = permission

    next()
  } catch (error) {
    log(`Error checking repo permission: ${error.message}`)
    next(error)
  }
}

/**
 * Middleware to check repository write permission
 * Extracts repo_path from body, validates, and checks permission
 */
const require_repo_write_permission = async (req, res, next) => {
  try {
    const repo_path = req.body?.repo_path

    const validation = await validate_repo_path(repo_path)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
    }

    const permission = await check_repo_permission({
      repo_path: validation.resolved_path,
      user_public_key: req.user?.user_public_key,
      permission_type: 'write',
      permission_context: req.permission_context
    })

    if (!permission.allowed) {
      log(`Write access denied to repo: ${validation.resolved_path}`)
      return res.status(403).json({
        error: 'Access denied',
        message: 'Write access requires repository ownership',
        permission_denied: true
      })
    }

    // Attach validated path and permission info to request
    req.validated_repo_path = validation.resolved_path
    req.repo_permission = permission

    next()
  } catch (error) {
    log(`Error checking repo permission: ${error.message}`)
    next(error)
  }
}

/**
 * Redact diff hunks for unauthorized files
 * Preserves structure but replaces content with redaction characters
 * @param {Object} diff - Diff object with hunks array
 * @returns {Object} Diff with redacted content
 */
const redact_diff_content = (diff) => {
  if (!diff || !diff.hunks) {
    return diff
  }

  return {
    ...diff,
    diff_text: redact_text_content(diff.diff_text || ''),
    hunks: diff.hunks.map((hunk) => ({
      ...hunk,
      lines: hunk.lines.map((line) => ({
        ...line,
        content: redact_text_content(line.content || '')
      }))
    })),
    redacted: true
  }
}

/**
 * GET /api/git/status
 * Get status for a repository
 * Query params: repo_path (required)
 */
router.get('/status', require_repo_read_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const user_public_key = req.user?.user_public_key

    const status = await get_status({ repo_path })

    // Check write permission for the repository
    const write_permission = await check_repo_permission({
      repo_path,
      user_public_key,
      permission_type: 'write',
      permission_context: req.permission_context
    })

    // If user has write access, skip file filtering entirely
    if (write_permission.allowed) {
      return res.json({
        ...status,
        write_allowed: true
      })
    }

    // Filter files by permission (only checks .md files, non-.md allowed by default)
    const filtered = await filter_md_files_by_permission({
      file_lists: {
        staged: status.staged,
        unstaged: status.unstaged,
        untracked: status.untracked,
        conflicts: status.conflicts
      },
      repo_path,
      user_public_key
    })

    const filtered_staged = filtered.staged
    const filtered_unstaged = filtered.unstaged
    const filtered_untracked = filtered.untracked
    const filtered_conflicts = filtered.conflicts

    res.json({
      ...status,
      staged: filtered_staged,
      unstaged: filtered_unstaged,
      untracked: filtered_untracked,
      conflicts: filtered_conflicts,
      has_changes:
        filtered_staged.length > 0 ||
        filtered_unstaged.length > 0 ||
        filtered_untracked.length > 0,
      has_conflicts: filtered_conflicts.length > 0,
      write_allowed: false
    })
  } catch (error) {
    log('Error getting git status:', error.message)
    res.status(500).json({
      error: 'Failed to get repository status',
      message: error.message
    })
  }
})

/**
 * GET /api/git/status/all
 * Get status for all known repositories
 */
router.get('/status/all', async (req, res) => {
  try {
    const user_base_dir = get_user_base_dir()
    const user_public_key = req.user?.user_public_key

    // Check if user has global_write permission - if so, skip all file-level permission checks
    const has_global_write =
      req.permission_context &&
      (await req.permission_context.get_global_write_permission())

    // Wait for cache if it's still initializing (cold start)
    const initializing = get_cache_initializing()
    if (initializing) {
      log('Cache still initializing, waiting...')
      await initializing
    }

    let repo_paths, worktree_metadata, statuses_map, merge_state_map

    if (is_cache_ready()) {
      // Read from cache (sub-millisecond)
      const cached = get_cached_status_all()
      repo_paths = cached.repo_paths
      worktree_metadata = cached.worktree_metadata

      statuses_map = {}
      merge_state_map = new Map()
      for (const repo_path of repo_paths) {
        const entry = cached.statuses.get(repo_path)
        if (entry) {
          statuses_map[repo_path] = entry.status
          merge_state_map.set(repo_path, entry.merge_state || DEFAULT_MERGE_STATE)
        }
      }
    } else {
      // Fallback: cache not ready, use live queries
      log('Cache not ready, falling back to live queries')
      const discovered = await get_known_repositories()
      repo_paths = discovered.repo_paths
      worktree_metadata = discovered.worktree_metadata
      statuses_map = await get_multi_repo_status({ repo_paths })
      merge_state_map = await get_merge_states_for_repos(Object.keys(statuses_map))
    }

    const get_worktree_fields = (repo_path) => {
      const wt_meta = worktree_metadata.get(repo_path)
      return {
        is_worktree: Boolean(wt_meta),
        parent_repo_name: wt_meta?.parent_repo_name || null
      }
    }

    // For users with global_write, skip permission filtering entirely
    if (has_global_write) {
      const repos = Object.entries(statuses_map).map(([repo_path, status]) => {
        const merge_state = merge_state_map.get(repo_path) || DEFAULT_MERGE_STATE
        return {
          repo_path,
          repo_name: path.basename(repo_path),
          relative_repo_path: path.relative(user_base_dir, repo_path),
          is_user_base: repo_path === user_base_dir,
          ...get_worktree_fields(repo_path),
          ...status,
          write_allowed: true,
          is_merging: merge_state.is_merging,
          ours_branch: merge_state.ours_branch,
          theirs_branch: merge_state.theirs_branch
        }
      })

      return res.json({ repos })
    }

    // Check permissions for all repositories
    const repo_base_uris = repo_paths.map((rp) => create_base_uri_from_path(rp))
    const permissions = await check_permissions_batch({
      user_public_key,
      resource_paths: repo_base_uris
    })

    // Filter to only repos user can access
    const accessible_repos = repo_paths.filter((_rp, index) => {
      const base_uri = repo_base_uris[index]
      return permissions[base_uri]?.read?.allowed ?? false
    })

    // Use cached statuses for accessible repos only
    const accessible_statuses = {}
    for (const rp of accessible_repos) {
      if (statuses_map[rp]) {
        accessible_statuses[rp] = statuses_map[rp]
      }
    }

    // Build a map of repo path -> base_uri for reliable lookups
    const repo_uri_map = new Map(
      repo_paths.map((rp, i) => [rp, repo_base_uris[i]])
    )

    // Build a map of repo write permissions for quick lookup
    const repo_write_permissions = new Map()
    accessible_repos.forEach((rp) => {
      const base_uri = repo_uri_map.get(rp)
      repo_write_permissions.set(
        rp,
        permissions[base_uri]?.write?.allowed ?? false
      )
    })

    // Collect files ONLY from repos where user has read-only access
    // AND only .md files (non-md files can't have explicit permissions)
    const all_file_info = [] // { repo_path, file, resource_path }
    for (const [repo_path, status] of Object.entries(accessible_statuses)) {
      // Skip file checks for repos user has write access to
      if (repo_write_permissions.get(repo_path)) {
        continue
      }

      const all_files = [
        ...(status.staged || []),
        ...(status.unstaged || []),
        ...(status.untracked || []),
        ...(status.conflicts || [])
      ]

      for (const file of all_files) {
        const file_path = typeof file === 'string' ? file : file.path
        // Only check .md files - other files can't have entity permissions
        if (!file_path.endsWith('.md')) {
          continue
        }
        const absolute_file_path = path.join(repo_path, file_path)
        all_file_info.push({
          repo_path,
          file,
          file_path,
          resource_path: create_base_uri_from_path(absolute_file_path)
        })
      }
    }

    // Single batch permission check for .md files in read-only repos
    let file_permissions = {}
    if (all_file_info.length > 0) {
      const resource_paths = all_file_info.map((info) => info.resource_path)
      file_permissions = await check_permissions_batch({
        user_public_key,
        resource_paths
      })
    }

    // Build permission lookup map for .md files in read-only repos
    const md_file_permissions = new Map()
    for (const info of all_file_info) {
      const key = `${info.repo_path}:${info.file_path}`
      md_file_permissions.set(
        key,
        file_permissions[info.resource_path]?.read?.allowed ?? false
      )
    }

    // Build response with filtered files
    const repos = Object.entries(accessible_statuses).map(
      ([repo_path, status]) => {
        const write_allowed = repo_write_permissions.get(repo_path) ?? false
        const merge_state = merge_state_map.get(repo_path) || DEFAULT_MERGE_STATE

        // If user has write access to repo, include all files (no filtering needed)
        if (write_allowed) {
          return {
            repo_path,
            repo_name: path.basename(repo_path),
            relative_repo_path: path.relative(user_base_dir, repo_path),
            is_user_base: repo_path === user_base_dir,
            ...get_worktree_fields(repo_path),
            ...status,
            write_allowed,
            is_merging: merge_state.is_merging,
            ours_branch: merge_state.ours_branch,
            theirs_branch: merge_state.theirs_branch
          }
        }

        // For read-only repos, filter files:
        // - Non-.md files: allowed (inherit from repo read permission)
        // - .md files: check explicit permission lookup
        const filter_files = (files) =>
          (files || []).filter((file) => {
            const file_path = typeof file === 'string' ? file : file.path
            // Non-.md files inherit repo permission (user has read access to repo)
            if (!file_path.endsWith('.md')) {
              return true
            }
            // .md files: check explicit permission (default deny if not in map)
            const key = `${repo_path}:${file_path}`
            return md_file_permissions.get(key) ?? false
          })

        const filtered_staged = filter_files(status.staged)
        const filtered_unstaged = filter_files(status.unstaged)
        const filtered_untracked = filter_files(status.untracked)
        const filtered_conflicts = filter_files(status.conflicts)

        return {
          repo_path,
          repo_name: path.basename(repo_path),
          relative_repo_path: path.relative(user_base_dir, repo_path),
          is_user_base: repo_path === user_base_dir,
          ...get_worktree_fields(repo_path),
          ...status,
          staged: filtered_staged,
          unstaged: filtered_unstaged,
          untracked: filtered_untracked,
          conflicts: filtered_conflicts,
          has_changes:
            filtered_staged.length > 0 ||
            filtered_unstaged.length > 0 ||
            filtered_untracked.length > 0,
          has_conflicts: filtered_conflicts.length > 0,
          write_allowed,
          is_merging: merge_state.is_merging,
          ours_branch: merge_state.ours_branch,
          theirs_branch: merge_state.theirs_branch
        }
      }
    )

    res.json({ repos })
  } catch (error) {
    log('Error getting all repo statuses:', error.message)
    res.status(500).json({
      error: 'Failed to get repository statuses',
      message: error.message
    })
  }
})

/**
 * GET /api/git/diff
 * Get diff for working tree changes
 * Query params: repo_path (required), file_path (optional), staged (optional)
 */
router.get('/diff', require_repo_read_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const { file_path, staged } = req.query

    // If specific file requested, check file-level permission
    if (file_path) {
      const file_permission = await check_file_permission({
        repo_path,
        file_path,
        user_public_key: req.user?.user_public_key,
        permission_type: 'read',
        permission_context: req.permission_context
      })

      if (!file_permission.allowed) {
        // Return redacted diff instead of denying entirely
        const diff = await get_working_tree_diff({
          repo_path,
          file_path,
          staged: staged === 'true'
        })

        return res.json(redact_diff_content(diff))
      }
    }

    const diff = await get_working_tree_diff({
      repo_path,
      file_path,
      staged: staged === 'true'
    })

    res.json(diff)
  } catch (error) {
    log('Error getting git diff:', error.message)
    res.status(500).json({
      error: 'Failed to get diff',
      message: error.message
    })
  }
})

/**
 * GET /api/git/file-content
 * Get file content for untracked/new files
 * Query params: repo_path (required), file_path (required)
 */
router.get('/file-content', require_repo_read_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const { file_path } = req.query

    if (!file_path) {
      return res.status(400).json({ error: 'file_path is required' })
    }

    // Check file-level permission
    const file_permission = await check_file_permission({
      repo_path,
      file_path,
      user_public_key: req.user?.user_public_key,
      permission_type: 'read',
      permission_context: req.permission_context
    })

    const content = await get_file_content_for_diff({
      repo_path,
      file_path
    })

    // Return redacted content if no permission
    if (!file_permission.allowed) {
      return res.json({
        content: redact_text_content(content || ''),
        file_path,
        is_redacted: true
      })
    }

    res.json({ content, file_path })
  } catch (error) {
    log('Error getting file content:', error.message)
    res.status(500).json({
      error: 'Failed to get file content',
      message: error.message
    })
  }
})

/**
 * GET /api/git/file-at-ref
 * Get file content at a specific git ref
 * Query params: repo_path (required), file_path (required), ref (optional, defaults to HEAD)
 */
router.get('/file-at-ref', require_repo_read_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const { file_path, ref = 'HEAD' } = req.query

    if (!file_path) {
      return res.status(400).json({ error: 'file_path is required' })
    }

    // Check file-level permission
    const file_permission = await check_file_permission({
      repo_path,
      file_path,
      user_public_key: req.user?.user_public_key,
      permission_type: 'read',
      permission_context: req.permission_context
    })

    let content
    let is_new_file = false
    try {
      content = await read_file_from_ref({
        repo_path,
        ref,
        file_path
      })
    } catch (error) {
      // File might not exist at this ref (e.g., new/untracked file)
      if (
        error.message.includes('does not exist') ||
        error.message.includes('fatal:')
      ) {
        // Return empty content for new files instead of 404
        content = ''
        is_new_file = true
      } else {
        throw error
      }
    }

    // Return redacted content if no permission
    if (!file_permission.allowed) {
      return res.json({
        content: redact_text_content(content || ''),
        file_path,
        ref,
        is_redacted: true,
        is_new_file
      })
    }

    res.json({ content, file_path, ref, is_redacted: false, is_new_file })
  } catch (error) {
    log('Error getting file at ref:', error.message)
    res.status(500).json({
      error: 'Failed to get file at ref',
      message: error.message
    })
  }
})

/**
 * Filter files by write permission for the current user
 * @param {Object} params - Parameters
 * @param {string[]} params.files - Array of relative file paths
 * @param {string} params.repo_path - Absolute repository path
 * @param {string|null} params.user_public_key - User's public key
 * @returns {Promise<{allowed_files: string[], denied_files: string[]}>}
 */
const filter_files_by_write_permission = async ({
  files,
  repo_path,
  user_public_key
}) => {
  const file_base_uris = files.map((f) =>
    create_base_uri_from_path(path.join(repo_path, f))
  )
  const permissions = await check_permissions_batch({
    user_public_key,
    resource_paths: file_base_uris
  })

  const allowed_files = files.filter((_f, index) => {
    const base_uri = file_base_uris[index]
    return permissions[base_uri]?.write?.allowed ?? false
  })

  const denied_files = files.filter((_f, index) => {
    const base_uri = file_base_uris[index]
    return !(permissions[base_uri]?.write?.allowed ?? false)
  })

  return { allowed_files, denied_files }
}

/**
 * POST /api/git/stage
 * Stage files
 * Body: { repo_path, files: [...] }
 */
router.post('/stage', require_repo_write_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const { files } = req.body

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required' })
    }

    const { allowed_files, denied_files } =
      await filter_files_by_write_permission({
        files,
        repo_path,
        user_public_key: req.user?.user_public_key
      })

    if (allowed_files.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'No write permission for any of the specified files',
        permission_denied: true,
        denied_files
      })
    }

    await add_files({
      worktree_path: repo_path,
      files_to_add: allowed_files
    })

    res.json({
      success: true,
      staged: allowed_files,
      denied_files: denied_files.length > 0 ? denied_files : undefined
    })
  } catch (error) {
    log('Error staging files:', error.message)
    res.status(500).json({
      error: 'Failed to stage files',
      message: error.message
    })
  }
})

/**
 * POST /api/git/unstage
 * Unstage files
 * Body: { repo_path, files: [...] }
 */
router.post('/unstage', require_repo_write_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const { files } = req.body

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required' })
    }

    const { allowed_files, denied_files } =
      await filter_files_by_write_permission({
        files,
        repo_path,
        user_public_key: req.user?.user_public_key
      })

    if (allowed_files.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'No write permission for any of the specified files',
        permission_denied: true,
        denied_files
      })
    }

    await unstage_files({
      worktree_path: repo_path,
      files_to_unstage: allowed_files
    })

    res.json({
      success: true,
      unstaged: allowed_files,
      denied_files: denied_files.length > 0 ? denied_files : undefined
    })
  } catch (error) {
    log('Error unstaging files:', error.message)
    res.status(500).json({
      error: 'Failed to unstage files',
      message: error.message
    })
  }
})

/**
 * POST /api/git/discard
 * Discard changes to files in the working tree
 * Body: { repo_path, files: [...] }
 */
router.post('/discard', require_repo_write_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const { files } = req.body

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required' })
    }

    const { allowed_files, denied_files } =
      await filter_files_by_write_permission({
        files,
        repo_path,
        user_public_key: req.user?.user_public_key
      })

    if (allowed_files.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'No write permission for any of the specified files',
        permission_denied: true,
        denied_files
      })
    }

    await discard_changes({
      worktree_path: repo_path,
      files_to_discard: allowed_files
    })

    res.json({
      success: true,
      discarded: allowed_files,
      denied_files: denied_files.length > 0 ? denied_files : undefined
    })
  } catch (error) {
    log('Error discarding changes:', error.message)
    res.status(500).json({
      error: 'Failed to discard changes',
      message: error.message
    })
  }
})

/**
 * POST /api/git/commit
 * Commit staged changes
 * Body: { repo_path, message }
 */
router.post('/commit', require_repo_write_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const { message } = req.body

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Commit message is required' })
    }

    await commit_changes({
      worktree_path: repo_path,
      commit_message: message.trim()
    })

    res.json({ success: true, message: message.trim() })
  } catch (error) {
    log('Error committing:', error.message)
    res.status(500).json({
      error: 'Failed to commit',
      message: error.message
    })
  }
})

/**
 * POST /api/git/generate-commit-message
 * Generate a commit message from staged changes using a local Ollama model
 * Body: { repo_path }
 */
router.post(
  '/generate-commit-message',
  require_repo_read_permission,
  async (req, res) => {
    try {
      const repo_path = req.validated_repo_path

      const message = await generate_commit_message({ repo_path })

      res.json({ message })
    } catch (error) {
      log('Error generating commit message:', error.message)

      if (error.message === 'No staged changes found') {
        return res.status(400).json({
          error: 'No staged changes found',
          message: error.message
        })
      }

      res.status(500).json({
        error: 'Failed to generate commit message',
        message: error.message
      })
    }
  }
)

/**
 * POST /api/git/pull
 * Pull from remote
 * Body: { repo_path, remote?, branch?, stash_changes? }
 */
router.post('/pull', require_repo_write_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const { remote, branch, stash_changes } = req.body

    const result = await pull({
      repo_path,
      remote: remote || 'origin',
      branch,
      stash_changes: stash_changes !== false
    })

    res.json(result)
  } catch (error) {
    log('Error pulling:', error.message)
    res.status(500).json({
      error: 'Failed to pull',
      message: error.message
    })
  }
})

/**
 * POST /api/git/push
 * Push to remote
 * Body: { repo_path, remote?, branch? }
 */
router.post('/push', require_repo_write_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const { remote, branch } = req.body

    // Get current branch if not specified
    let branch_name = branch
    if (!branch_name) {
      const status = await get_status({ repo_path })
      branch_name = status.branch
    }

    await push_branch({
      repo_path,
      remote: remote || 'origin',
      branch_name
    })

    res.json({ success: true, branch: branch_name, remote: remote || 'origin' })
  } catch (error) {
    log('Error pushing:', error.message)
    res.status(500).json({
      error: 'Failed to push',
      message: error.message
    })
  }
})

/**
 * GET /api/git/conflicts
 * Get list of conflicted files
 * Query params: repo_path (required)
 */
router.get('/conflicts', require_repo_read_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path
    const user_public_key = req.user?.user_public_key

    const conflicts = await get_conflicts({ repo_path })

    // If user has write access to repo, return all conflicts
    if (req.repo_permission?.is_owner) {
      return res.json({ conflicts })
    }

    // Check write permission for the repository
    const write_permission = await check_repo_permission({
      repo_path,
      user_public_key,
      permission_type: 'write',
      permission_context: req.permission_context
    })

    if (write_permission.allowed) {
      return res.json({ conflicts })
    }

    // Filter conflicts by permission (only checks .md files, non-.md allowed by default)
    const filtered = await filter_md_files_by_permission({
      file_lists: { conflicts },
      repo_path,
      user_public_key
    })

    res.json({ conflicts: filtered.conflicts })
  } catch (error) {
    log('Error getting conflicts:', error.message)
    res.status(500).json({
      error: 'Failed to get conflicts',
      message: error.message
    })
  }
})

/**
 * GET /api/git/conflict-versions
 * Get different versions of a conflicted file
 * Query params: repo_path (required), file_path (required)
 */
router.get(
  '/conflict-versions',
  require_repo_read_permission,
  async (req, res) => {
    try {
      const repo_path = req.validated_repo_path
      const { file_path } = req.query

      if (!file_path) {
        return res.status(400).json({ error: 'file_path is required' })
      }

      // Check file-level permission
      const file_permission = await check_file_permission({
        repo_path,
        file_path,
        user_public_key: req.user?.user_public_key,
        permission_type: 'read',
        permission_context: req.permission_context
      })

      const versions = await get_conflict_versions({
        repo_path,
        file_path
      })

      // Redact content if no permission
      if (!file_permission.allowed) {
        return res.json({
          ...versions,
          ours: redact_text_content(versions.ours || ''),
          theirs: redact_text_content(versions.theirs || ''),
          base: redact_text_content(versions.base || ''),
          current: redact_text_content(versions.current || ''),
          redacted: true
        })
      }

      res.json(versions)
    } catch (error) {
      log('Error getting conflict versions:', error.message)
      res.status(500).json({
        error: 'Failed to get conflict versions',
        message: error.message
      })
    }
  }
)

/**
 * POST /api/git/resolve-conflict
 * Resolve a conflict
 * Body: { repo_path, file_path, resolution: 'ours'|'theirs'|'merged', merged_content? }
 */
router.post(
  '/resolve-conflict',
  require_repo_write_permission,
  async (req, res) => {
    try {
      const repo_path = req.validated_repo_path
      const { file_path, resolution, merged_content } = req.body

      if (!file_path) {
        return res.status(400).json({ error: 'file_path is required' })
      }

      if (!resolution || !['ours', 'theirs', 'merged'].includes(resolution)) {
        return res.status(400).json({
          error: 'resolution must be one of: ours, theirs, merged'
        })
      }

      if (resolution === 'merged' && !merged_content) {
        return res.status(400).json({
          error: 'merged_content is required when resolution is "merged"'
        })
      }

      // Check file-level write permission
      const file_permission = await check_file_permission({
        repo_path,
        file_path,
        user_public_key: req.user?.user_public_key,
        permission_type: 'write',
        permission_context: req.permission_context
      })

      if (!file_permission.allowed) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'No write permission for this file',
          permission_denied: true,
          file_path
        })
      }

      await resolve_conflict({
        repo_path,
        file_path,
        resolution,
        merged_content
      })

      res.json({ success: true, file_path, resolution })
    } catch (error) {
      log('Error resolving conflict:', error.message)
      res.status(500).json({
        error: 'Failed to resolve conflict',
        message: error.message
      })
    }
  }
)

/**
 * POST /api/git/abort-merge
 * Abort an in-progress merge
 * Body: { repo_path }
 */
router.post('/abort-merge', require_repo_write_permission, async (req, res) => {
  try {
    const repo_path = req.validated_repo_path

    // Check if actually in a merge state
    const merging = await is_merging({ repo_path })
    if (!merging) {
      return res.status(400).json({
        error: 'Not in merge state',
        message: 'Repository is not currently in a merge state'
      })
    }

    await abort_merge({ repo_path })

    res.json({ success: true, message: 'Merge aborted successfully' })
  } catch (error) {
    log('Error aborting merge:', error.message)
    res.status(500).json({
      error: 'Failed to abort merge',
      message: error.message
    })
  }
})

export { get_known_repositories }
export default router
