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
  resolve_conflict
} from '#libs-server/git/index.mjs'
import { parse_jwt_token } from '#server/middleware/jwt-parser.mjs'
import { attach_permission_context } from '#server/middleware/permission/middleware.mjs'
import { check_permissions_batch } from '#server/middleware/permission/permission-service.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { redact_text_content } from '#server/middleware/content-redactor.mjs'
import { execute_shell_command } from '#libs-server/utils/execute-shell-command.mjs'

const router = express.Router()
const log = debug('api:git')

// Get user base directory from config
const USER_BASE_DIR = config.user_base_directory

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

  // Resolve to absolute path
  let resolved_path = repo_path
  if (!path.isAbsolute(repo_path)) {
    resolved_path = path.resolve(USER_BASE_DIR, repo_path)
  }

  // Normalize and ensure it doesn't escape base directory
  resolved_path = path.normalize(resolved_path)

  // Check if it's the user_base_directory itself
  if (resolved_path === USER_BASE_DIR) {
    return { valid: true, resolved_path }
  }

  // Check if it's within user_base_directory
  if (!resolved_path.startsWith(USER_BASE_DIR + path.sep)) {
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
      while (check_path.startsWith(USER_BASE_DIR)) {
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
 * Parse git submodule status output and return initialized submodule paths
 * @param {string} output - Output from git submodule status --recursive
 * @returns {string[]} Array of relative submodule paths that are initialized
 */
const parse_submodule_status = (output) => {
  if (!output.trim()) {
    return []
  }

  const submodule_paths = []
  const lines = output.trim().split('\n')

  for (const line of lines) {
    // Format: " <sha> path (description)" or "+<sha> path" or "-<sha> path"
    // First char: ' ' = initialized, '+' = different commit, '-' = not initialized, 'U' = conflict
    const match = line.match(/^([ +\-U])([0-9a-f]+)\s+(\S+)/)
    if (!match) continue

    const [, status_char, , relative_path] = match
    const is_initialized = status_char !== '-'

    if (is_initialized) {
      submodule_paths.push(relative_path)
    }
  }

  return submodule_paths
}

/**
 * Get list of known repositories (user_base, repository/active/*, and git submodules)
 * @returns {Promise<string[]>} Array of repository paths
 */
const get_known_repositories = async () => {
  const repos = [USER_BASE_DIR]
  const seen = new Set([USER_BASE_DIR])

  const add_repo = async (repo_path) => {
    if (seen.has(repo_path)) return false
    try {
      await fs.access(path.join(repo_path, '.git'))
      repos.push(repo_path)
      seen.add(repo_path)
      return true
    } catch {
      return false
    }
  }

  // Scan repository/active directory
  const active_repos_path = path.join(USER_BASE_DIR, 'repository', 'active')
  try {
    const entries = await fs.readdir(active_repos_path, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        await add_repo(path.join(active_repos_path, entry.name))
      }
    }
  } catch {
    log('repository/active directory not found')
  }

  // Detect git submodules (includes nested submodules and those outside repository/active)
  try {
    const { stdout } = await execute_shell_command(
      'git submodule status --recursive',
      { cwd: USER_BASE_DIR }
    )
    const submodule_paths = parse_submodule_status(stdout)
    for (const relative_path of submodule_paths) {
      const added = await add_repo(path.join(USER_BASE_DIR, relative_path))
      if (added) {
        log(`Added submodule: ${relative_path}`)
      }
    }
  } catch (error) {
    log('Failed to get submodule status:', error.message)
  }

  return repos
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
 * Filter a list of files based on read permissions
 * @param {Object} params - Parameters
 * @param {Array} params.files - Array of file objects with path property or strings
 * @param {string} params.repo_path - Absolute repository path
 * @param {Object} params.permission_context - Permission context from request
 * @returns {Promise<Array>} Filtered array of files user can access
 */
const filter_files_by_permission = async ({
  files,
  repo_path,
  permission_context
}) => {
  if (!files || files.length === 0) {
    return files
  }

  // Build list of resource paths to check
  const resource_paths = files.map((file) => {
    const file_path = typeof file === 'string' ? file : file.path
    const absolute_file_path = path.join(repo_path, file_path)
    return create_base_uri_from_path(absolute_file_path)
  })

  // Batch check permissions
  const user_public_key = permission_context.user_public_key
  const permissions = await check_permissions_batch({
    user_public_key,
    resource_paths
  })

  // Filter files based on permissions
  return files.filter((file, index) => {
    const resource_path = resource_paths[index]
    const result = permissions[resource_path]
    return result?.read?.allowed ?? false
  })
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

    const status = await get_status({ repo_path })

    // Check write permission for the repository
    const write_permission = await check_repo_permission({
      repo_path,
      user_public_key: req.user?.user_public_key,
      permission_type: 'write',
      permission_context: req.permission_context
    })

    // Filter file lists based on permissions
    const [
      filtered_staged,
      filtered_unstaged,
      filtered_untracked,
      filtered_conflicts
    ] = await Promise.all([
      filter_files_by_permission({
        files: status.staged || [],
        repo_path,
        permission_context: req.permission_context
      }),
      filter_files_by_permission({
        files: status.unstaged || [],
        repo_path,
        permission_context: req.permission_context
      }),
      filter_files_by_permission({
        files: status.untracked || [],
        repo_path,
        permission_context: req.permission_context
      }),
      filter_files_by_permission({
        files: status.conflicts || [],
        repo_path,
        permission_context: req.permission_context
      })
    ])

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
      write_allowed: write_permission.allowed
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
    const repo_paths = await get_known_repositories()
    const user_public_key = req.user?.user_public_key

    // Check permissions for all repositories
    const repo_base_uris = repo_paths.map((rp) => create_base_uri_from_path(rp))
    const permissions = await check_permissions_batch({
      user_public_key,
      resource_paths: repo_base_uris
    })

    // Filter to only repos user can access
    const accessible_repos = repo_paths.filter((rp, index) => {
      const base_uri = repo_base_uris[index]
      return permissions[base_uri]?.read?.allowed ?? false
    })

    const statuses = await get_multi_repo_status({
      repo_paths: accessible_repos
    })

    // Filter file lists for each repo and convert to array format
    const repos = await Promise.all(
      Object.entries(statuses).map(async ([repo_path, status]) => {
        // Get base URI for this repo to look up write permission
        const base_uri = create_base_uri_from_path(repo_path)
        const repo_permissions = permissions[base_uri]
        const write_allowed = repo_permissions?.write?.allowed ?? false

        // Filter file lists based on permissions
        const [
          filtered_staged,
          filtered_unstaged,
          filtered_untracked,
          filtered_conflicts
        ] = await Promise.all([
          filter_files_by_permission({
            files: status.staged || [],
            repo_path,
            permission_context: req.permission_context
          }),
          filter_files_by_permission({
            files: status.unstaged || [],
            repo_path,
            permission_context: req.permission_context
          }),
          filter_files_by_permission({
            files: status.untracked || [],
            repo_path,
            permission_context: req.permission_context
          }),
          filter_files_by_permission({
            files: status.conflicts || [],
            repo_path,
            permission_context: req.permission_context
          })
        ])

        return {
          repo_path,
          repo_name: path.basename(repo_path),
          is_user_base: repo_path === USER_BASE_DIR,
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
          write_allowed
        }
      })
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
        redacted: true
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

    // Filter files to only those user has write permission for
    const user_public_key = req.user?.user_public_key
    const file_base_uris = files.map((f) =>
      create_base_uri_from_path(path.join(repo_path, f))
    )
    const permissions = await check_permissions_batch({
      user_public_key,
      resource_paths: file_base_uris
    })

    const allowed_files = files.filter((f, index) => {
      const base_uri = file_base_uris[index]
      return permissions[base_uri]?.write?.allowed ?? false
    })

    const denied_files = files.filter((f, index) => {
      const base_uri = file_base_uris[index]
      return !(permissions[base_uri]?.write?.allowed ?? false)
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

    // Filter files to only those user has write permission for
    const user_public_key = req.user?.user_public_key
    const file_base_uris = files.map((f) =>
      create_base_uri_from_path(path.join(repo_path, f))
    )
    const permissions = await check_permissions_batch({
      user_public_key,
      resource_paths: file_base_uris
    })

    const allowed_files = files.filter((f, index) => {
      const base_uri = file_base_uris[index]
      return permissions[base_uri]?.write?.allowed ?? false
    })

    const denied_files = files.filter((f, index) => {
      const base_uri = file_base_uris[index]
      return !(permissions[base_uri]?.write?.allowed ?? false)
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

    const conflicts = await get_conflicts({ repo_path })

    // Filter conflicts based on file permissions
    const filtered_conflicts = await filter_files_by_permission({
      files: conflicts,
      repo_path,
      permission_context: req.permission_context
    })

    res.json({ conflicts: filtered_conflicts })
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

export default router
