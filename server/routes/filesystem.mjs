import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'
import fm from 'front-matter'

import config from '#config'
import {
  check_filesystem_permission,
  check_permissions_batch,
  PermissionContext
} from '#server/middleware/permission/index.mjs'
import { load_identity_by_public_key } from '#libs-server/users/identity-loader.mjs'
import { apply_redaction_interceptor } from '#server/middleware/permissions.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'
import {
  find_git_root,
  get_file_status,
  get_file_diff_stats
} from '#libs-server/git/index.mjs'

const router = express.Router()
const log = debug('api:filesystem')

// Concurrency limiter for parallel file operations
const FILE_READ_CONCURRENCY = 10
const CONCURRENCY_TIMEOUT_MS = 30000 // 30 second timeout for waiting in queue

const create_concurrency_limiter = (max_concurrency) => {
  const limiter_state = { active_count: 0 }
  const pending_queue = []

  return async (async_fn) => {
    // Wait for a slot to open up, with timeout protection
    while (limiter_state.active_count >= max_concurrency) {
      await new Promise((resolve, reject) => {
        const timeout_id = setTimeout(() => {
          // Remove this resolver from queue if it's still there
          const index = pending_queue.findIndex(
            (item) => item.resolve === resolve
          )
          if (index !== -1) {
            pending_queue.splice(index, 1)
          }
          reject(new Error('Concurrency limiter timeout'))
        }, CONCURRENCY_TIMEOUT_MS)

        pending_queue.push({
          resolve: () => {
            clearTimeout(timeout_id)
            resolve()
          }
        })
      })
    }

    limiter_state.active_count++
    try {
      return await async_fn()
    } finally {
      limiter_state.active_count--
      if (pending_queue.length > 0) {
        const next = pending_queue.shift()
        next.resolve()
      }
    }
  }
}

// Apply permission checking middleware to all filesystem routes
router.use(check_filesystem_permission())
router.use(apply_redaction_interceptor())

// Get user base directory from config
const USER_BASE_DIR = config.user_base_directory

// Helper function to validate and resolve paths
const resolve_user_path = (request_path = '') => {
  // Normalize the path - remove leading slash and resolve relative paths
  const normalized_path = request_path.replace(/^\/+/, '')
  const full_path = path.join(USER_BASE_DIR, normalized_path)

  // Security check: ensure the resolved path is within user base directory
  if (!full_path.startsWith(USER_BASE_DIR)) {
    throw new Error('Invalid path: outside user base directory')
  }

  return { full_path, relative_path: normalized_path }
}

// GET /api/filesystem/directory - List directory contents
router.get('/directory', async (req, res) => {
  const request_path = req.query.path || ''
  const normalized_path = request_path.replace(/^\/+/, '')

  try {
    const { full_path, relative_path } = resolve_user_path(request_path)

    log(`Listing directory: ${full_path}`)

    // Check if path exists and is a directory
    const stats = await fs.stat(full_path)
    if (!stats.isDirectory()) {
      return res.status(400).json({
        error: 'Path is not a directory',
        path: relative_path
      })
    }

    // Read directory contents
    const files = await fs.readdir(full_path)

    // Get detailed info for each file/directory
    const items = []
    const file_permission_results = {}

    // Collect file paths for batch permission checking
    const file_paths_to_check = []
    for (const file_name of files) {
      // Skip hidden files and git directories
      if (file_name.startsWith('.')) {
        continue
      }

      const file_relative_path = path
        .join(relative_path, file_name)
        .replace(/\\/g, '/')
      file_paths_to_check.push(file_relative_path)
    }

    // Batch check permissions for all files
    if (file_paths_to_check.length > 0) {
      const user_public_key = req.user?.user_public_key || null
      const resource_paths = file_paths_to_check.map((file_path) => {
        const full_file_path = path.join(USER_BASE_DIR, file_path)
        return create_base_uri_from_path(full_file_path)
      })
      const batch_results = await check_permissions_batch({
        user_public_key,
        resource_paths
      })

      // Map results back to file paths
      file_paths_to_check.forEach((file_path, index) => {
        const resource_path = resource_paths[index]
        file_permission_results[file_path] = batch_results[resource_path]?.read
      })
    }

    // Filter to non-hidden files
    const visible_files = files.filter(
      (file_name) => !file_name.startsWith('.')
    )

    // Parallel stat all files
    const file_stats_results = await Promise.all(
      visible_files.map(async (file_name) => {
        const file_path = path.join(full_path, file_name)
        try {
          const stats = await fs.stat(file_path)
          return { file_name, file_path, stats, error: null }
        } catch (error) {
          log(`Error getting stats for ${file_path}:`, error.message)
          return { file_name, file_path, stats: null, error }
        }
      })
    )

    // Filter successful stats and identify markdown files needing frontmatter
    const successful_stats = file_stats_results.filter((r) => r.stats !== null)
    const markdown_files = successful_stats.filter(
      (r) => !r.stats.isDirectory() && r.file_name.endsWith('.md')
    )

    // Read frontmatter for markdown files with concurrency limit
    const limit_concurrent = create_concurrency_limiter(FILE_READ_CONCURRENCY)
    const frontmatter_results = new Map()

    await Promise.all(
      markdown_files.map(async ({ file_path }) => {
        const result = await limit_concurrent(async () => {
          try {
            const content = await fs.readFile(file_path, 'utf8')
            const parsed = fm(content)
            if (
              parsed.attributes &&
              Object.keys(parsed.attributes).length > 0
            ) {
              return {
                has_frontmatter: true,
                entity_type: parsed.attributes.type || null
              }
            }
            return { has_frontmatter: false, entity_type: null }
          } catch (error) {
            log(`Error parsing frontmatter for ${file_path}:`, error.message)
            return { has_frontmatter: false, entity_type: null }
          }
        })
        frontmatter_results.set(file_path, result)
      })
    )

    // Build items from results
    for (const { file_name, file_path, stats } of successful_stats) {
      const is_directory = stats.isDirectory()
      const frontmatter_info = frontmatter_results.get(file_path) || {
        has_frontmatter: false,
        entity_type: null
      }

      const file_info = {
        name: file_name,
        type: is_directory ? 'directory' : 'file',
        size: is_directory ? null : stats.size,
        modified: stats.mtime.toISOString(),
        entity_type: frontmatter_info.entity_type,
        has_frontmatter: frontmatter_info.has_frontmatter
      }

      // Check if this specific file requires redaction
      const file_relative_path = path
        .join(relative_path, file_name)
        .replace(/\\/g, '/')
      const permission_result = file_permission_results[file_relative_path]

      // Set access information for each item
      const item_read_allowed =
        !permission_result || !!permission_result.allowed

      items.push({
        ...file_info,
        access: { read_allowed: item_read_allowed }
      })
    }

    // Sort: directories first, then files alphabetically
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'directory') return 1
      return a.name.localeCompare(b.name)
    })

    res.json({
      path: relative_path,
      type: 'directory',
      items
    })
  } catch (error) {
    log('Error listing directory:', error.message)

    if (error.code === 'ENOENT') {
      return res.status(404).json({
        error: 'Directory not found',
        path: normalized_path
      })
    }

    if (error.message.includes('Invalid path')) {
      return res.status(400).json({
        error: error.message,
        path: normalized_path
      })
    }

    res.status(500).json({
      error: 'Internal server error',
      path: normalized_path
    })
  }
})

// GET /api/filesystem/file - Get file content
router.get('/file', async (req, res) => {
  const request_path = req.query.path || ''
  const normalized_path = request_path.replace(/^\/+/, '')

  try {
    const { full_path, relative_path } = resolve_user_path(request_path)

    log(`Reading file: ${full_path}`)

    // Check if path exists and is a file
    const stats = await fs.stat(full_path)
    if (!stats.isFile()) {
      return res.status(400).json({
        error: 'Path is not a file',
        path: relative_path
      })
    }

    // Read file content
    const content = await fs.readFile(full_path, 'utf8')

    let frontmatter = null
    let markdown = content

    // Parse YAML frontmatter if it's a markdown file
    if (relative_path.endsWith('.md')) {
      try {
        const parsed = fm(content)
        if (parsed.attributes && Object.keys(parsed.attributes).length > 0) {
          frontmatter = parsed.attributes
          markdown = parsed.body
        }
      } catch (error) {
        log(`Error parsing frontmatter for ${full_path}:`, error.message)
      }
    }

    // Get git context for the file
    let git_context = null
    try {
      const repo_path = find_git_root({ file_path: full_path })
      if (repo_path) {
        const file_relative_to_repo = path.relative(repo_path, full_path)
        const { status, is_staged } = await get_file_status({
          repo_path,
          file_path: file_relative_to_repo
        })

        // Get diff stats if file has changes
        let additions = 0
        let deletions = 0
        if (status) {
          const stats = await get_file_diff_stats({
            repo_path,
            file_path: file_relative_to_repo,
            staged: is_staged
          })
          additions = stats.additions
          deletions = stats.deletions
        }

        git_context = {
          repo_path,
          relative_path: file_relative_to_repo,
          status,
          is_staged,
          additions,
          deletions
        }
      }
    } catch (error) {
      log(`Error getting git context for ${full_path}:`, error.message)
    }

    res.json({
      path: relative_path,
      type: 'file',
      content,
      frontmatter,
      markdown,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      git_context
    })
  } catch (error) {
    log('Error reading file:', error.message)

    if (error.code === 'ENOENT') {
      return res.status(404).json({
        error: 'File not found',
        path: normalized_path
      })
    }

    if (error.message.includes('Invalid path')) {
      return res.status(400).json({
        error: error.message,
        path: normalized_path
      })
    }

    res.status(500).json({
      error: 'Internal server error',
      path: normalized_path
    })
  }
})

// GET /api/filesystem/file/raw - Serve raw file content (for images and other binary files)
router.get('/file/raw', async (req, res) => {
  const request_path = req.query.path || ''
  const normalized_path = request_path.replace(/^\/+/, '')

  try {
    const { full_path, relative_path } = resolve_user_path(request_path)

    log(`Serving raw file: ${full_path}`)

    // Check read permission (redaction interceptor only covers res.json)
    if (req.access && req.access.read_allowed === false) {
      return res.status(403).json({
        error: 'Access denied',
        path: relative_path
      })
    }

    const stats = await fs.stat(full_path)
    if (!stats.isFile()) {
      return res.status(400).json({
        error: 'Path is not a file',
        path: relative_path
      })
    }

    const ext = path.extname(full_path).toLowerCase().slice(1)
    const mime_types = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
      tiff: 'image/tiff',
      tif: 'image/tiff'
    }

    const content_type = mime_types[ext]
    if (!content_type) {
      return res.status(400).json({
        error: 'Unsupported file type for raw serving',
        path: relative_path
      })
    }

    res.setHeader('Content-Type', content_type)
    res.setHeader('Content-Length', stats.size)
    res.setHeader('Cache-Control', 'private, max-age=300')

    const file_buffer = await fs.readFile(full_path)
    res.send(file_buffer)
  } catch (error) {
    log('Error serving raw file:', error.message)

    if (error.code === 'ENOENT') {
      return res.status(404).json({
        error: 'File not found',
        path: normalized_path
      })
    }

    if (error.message.includes('Invalid path')) {
      return res.status(400).json({
        error: error.message,
        path: normalized_path
      })
    }

    res.status(500).json({
      error: 'Internal server error',
      path: normalized_path
    })
  }
})

// GET /api/filesystem/info - Get path info (file or directory)
router.get('/info', async (req, res) => {
  // Normalize path early so error handlers return consistent paths
  const request_path = req.query.path || ''
  const normalized_path = request_path.replace(/^\/+/, '')

  try {
    const { full_path, relative_path } = resolve_user_path(request_path)

    log(`Getting info for: ${full_path}`)

    const stats = await fs.stat(full_path)
    const is_directory = stats.isDirectory()

    const response = {
      path: relative_path,
      type: is_directory ? 'directory' : 'file',
      size: is_directory ? null : stats.size,
      modified: stats.mtime.toISOString(),
      exists: true
    }

    // Add additional info for files
    if (!is_directory) {
      const file_name = path.basename(full_path)
      if (file_name.endsWith('.md')) {
        try {
          const content = await fs.readFile(full_path, 'utf8')
          const parsed = fm(content)
          if (parsed.attributes && Object.keys(parsed.attributes).length > 0) {
            response.has_frontmatter = true
            response.entity_type = parsed.attributes.type || null
          }
        } catch (error) {
          log(`Error parsing frontmatter for ${full_path}:`, error.message)
        }
      }
    }

    res.json(response)
  } catch (error) {
    log('Error getting path info:', error.message)

    if (error.code === 'ENOENT') {
      return res.json({
        path: normalized_path,
        exists: false
      })
    }

    if (error.message.includes('Invalid path')) {
      return res.status(400).json({
        error: error.message,
        path: normalized_path
      })
    }

    res.status(500).json({
      error: 'Internal server error',
      path: normalized_path
    })
  }
})

// GET /api/filesystem/homepage-content - Resolve identity-specific homepage variant
router.get('/homepage-content', async (req, res) => {
  try {
    const user_public_key = req.user?.user_public_key || null
    const candidate_paths = []

    if (user_public_key) {
      const identity = await load_identity_by_public_key({
        public_key: user_public_key
      })

      if (identity) {
        // Try username-specific variant first
        if (identity.username) {
          candidate_paths.push(`text/homepage/${identity.username}.md`)
        }

        // Try role-specific variant
        const relations = identity.relations || []
        for (const relation of relations) {
          const role_match = relation.match(
            /^has_role\s+\[\[user:role\/([^/]+)\.md\]\]$/
          )
          if (role_match) {
            candidate_paths.push(`text/homepage/${role_match[1]}.md`)
          }
        }
      }
    }

    // Fall back to public variant, then ABOUT.md
    candidate_paths.push('text/homepage/public.md')
    candidate_paths.push('ABOUT.md')

    const context = new PermissionContext({ user_public_key })

    for (const candidate of candidate_paths) {
      try {
        const { full_path, relative_path } = resolve_user_path(candidate)
        const stats = await fs.stat(full_path)
        if (!stats.isFile()) continue

        // Check permission on the resolved file
        const resource_path = create_base_uri_from_path(full_path)
        const permission = await context.check_permission({ resource_path })
        if (permission?.read?.allowed === false) continue

        const content = await fs.readFile(full_path, 'utf8')

        let frontmatter = null
        let markdown = content

        if (relative_path.endsWith('.md')) {
          try {
            const parsed = fm(content)
            if (
              parsed.attributes &&
              Object.keys(parsed.attributes).length > 0
            ) {
              frontmatter = parsed.attributes
              markdown = parsed.body
            }
          } catch (error) {
            log(`Error parsing frontmatter for ${full_path}:`, error.message)
          }
        }

        return res.json({
          path: relative_path,
          type: 'file',
          content,
          frontmatter,
          markdown,
          size: stats.size,
          modified: stats.mtime.toISOString()
        })
      } catch (error) {
        if (error.code !== 'ENOENT') {
          log(`Skipping homepage candidate ${candidate}: ${error.message}`)
        }
        continue
      }
    }

    // No homepage variant found
    res.json({ content: null })
  } catch (error) {
    log('Error resolving homepage content:', error.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
