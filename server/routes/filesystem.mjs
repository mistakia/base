import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'
import fm from 'front-matter'

import config from '#config'
import {
  check_filesystem_permission,
  check_permissions_batch
} from '#server/middleware/permission/index.mjs'
import { apply_redaction_interceptor } from '#server/middleware/permissions.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'
import {
  find_git_root,
  get_file_status,
  get_file_diff_stats
} from '#libs-server/git/index.mjs'

const router = express.Router()
const log = debug('api:filesystem')

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

// Helper function to get file stats and type information
const get_file_info = async (file_path, file_name) => {
  try {
    const stats = await fs.stat(file_path)
    const is_directory = stats.isDirectory()

    let entity_type = null
    let has_frontmatter = false

    if (!is_directory && file_name.endsWith('.md')) {
      try {
        // Check if file has YAML frontmatter
        const content = await fs.readFile(file_path, 'utf8')
        const parsed = fm(content)
        if (parsed.attributes && Object.keys(parsed.attributes).length > 0) {
          has_frontmatter = true
          entity_type = parsed.attributes.type || null
        }
      } catch (error) {
        log(`Error parsing frontmatter for ${file_path}:`, error.message)
      }
    }

    return {
      name: file_name,
      type: is_directory ? 'directory' : 'file',
      size: is_directory ? null : stats.size,
      modified: stats.mtime.toISOString(),
      entity_type,
      has_frontmatter
    }
  } catch (error) {
    log(`Error getting file info for ${file_path}:`, error.message)
    return null
  }
}

// GET /api/filesystem/directory - List directory contents
router.get('/directory', async (req, res) => {
  try {
    const request_path = req.query.path || ''
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

    for (const file_name of files) {
      // Skip hidden files and git directories
      if (file_name.startsWith('.')) {
        continue
      }

      const file_path = path.join(full_path, file_name)
      const file_info = await get_file_info(file_path, file_name)

      if (file_info) {
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
        path: req.query.path || ''
      })
    }

    if (error.message.includes('Invalid path')) {
      return res.status(400).json({
        error: error.message,
        path: req.query.path || ''
      })
    }

    res.status(500).json({
      error: 'Internal server error',
      path: req.query.path || ''
    })
  }
})

// GET /api/filesystem/file - Get file content
router.get('/file', async (req, res) => {
  try {
    const request_path = req.query.path || ''
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
        path: req.query.path || ''
      })
    }

    if (error.message.includes('Invalid path')) {
      return res.status(400).json({
        error: error.message,
        path: req.query.path || ''
      })
    }

    res.status(500).json({
      error: 'Internal server error',
      path: req.query.path || ''
    })
  }
})

// GET /api/filesystem/info - Get path info (file or directory)
router.get('/info', async (req, res) => {
  try {
    const request_path = req.query.path || ''
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
        path: req.query.path || '',
        exists: false
      })
    }

    if (error.message.includes('Invalid path')) {
      return res.status(400).json({
        error: error.message,
        path: req.query.path || ''
      })
    }

    res.status(500).json({
      error: 'Internal server error',
      path: req.query.path || ''
    })
  }
})

export default router
