import express from 'express'
import path from 'path'
import fs from 'fs/promises'

import {
  resolve_base_uri_from_registry,
  parse_base_uri,
  is_valid_base_uri
} from '#libs-server/base-uri/index.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import config from '#config'

const router = express.Router()

// Unified resource endpoint
router.get('/', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { base_uri } = req.query

    if (!base_uri) {
      return res.status(400).json({
        error: 'Missing required parameter: base_uri',
        usage: {
          directory: '?base_uri=user:task/',
          entity: '?base_uri=user:task/my-task.md',
          file: '?base_uri=user:config/settings.json'
        }
      })
    }

    return await handle_resource_by_uri({ req, res, base_uri, log })
  } catch (error) {
    log(error)
    res.status(500).json({ error: error.message })
  }
})

// Handle resource requests by base_uri
async function handle_resource_by_uri({ req, res, base_uri, log }) {
  try {
    // Validate URI format
    if (!is_valid_base_uri(base_uri)) {
      return res.status(400).json({ error: `Invalid URI format: ${base_uri}` })
    }

    const parsed_uri = parse_base_uri(base_uri)
    const absolute_path = resolve_base_uri_from_registry(base_uri)

    // Check if path exists
    let stat
    try {
      stat = await fs.stat(absolute_path)
    } catch (err) {
      return res.status(404).json({
        error: `Resource not found: ${base_uri}`,
        parsed_uri
      })
    }

    // Handle directories
    if (stat.isDirectory()) {
      return await handle_directory_by_path({
        res,
        absolute_path,
        relative_path: parsed_uri.path,
        base_uri
      })
    }

    // Handle files
    if (stat.isFile()) {
      // Extract user context from request
      const user_context = get_user_context_from_request({ req })

      // Check knowledge base access for non-entity files
      if (!has_knowledge_base_access({ user_context })) {
        // Check if this is an entity file that might be public
        const file_extension = path.extname(absolute_path).toLowerCase()
        if (file_extension === '.md') {
          try {
            const entity_result = await read_entity_from_filesystem({
              absolute_path
            })

            // If it's not an entity file, deny access
            if (!entity_result.success || !entity_result.entity_properties) {
              return res.status(403).json({
                error:
                  'Access denied: Insufficient permissions for this resource',
                resource: base_uri
              })
            }
          } catch (err) {
            // If we can't read it as an entity, deny access
            return res.status(403).json({
              error:
                'Access denied: Insufficient permissions for this resource',
              resource: base_uri
            })
          }
        } else {
          // Non-markdown files require knowledge base access
          return res.status(403).json({
            error: 'Access denied: Insufficient permissions for this resource',
            resource: base_uri
          })
        }
      }

      return await handle_file_by_path({
        res,
        absolute_path,
        base_uri,
        parsed_uri,
        user_context
      })
    }

    return res
      .status(400)
      .json({ error: 'Resource is neither file nor directory' })
  } catch (error) {
    log(error)
    return res.status(404).json({
      error: `Failed to resolve resource: ${base_uri}`,
      details: error.message
    })
  }
}

// Handle directory listing
async function handle_directory_by_path({
  res,
  absolute_path,
  relative_path,
  base_uri
}) {
  const entries = await fs.readdir(absolute_path, { withFileTypes: true })

  const items = []

  // Add directories
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      items.push({
        name: entry.name,
        type: 'directory'
      })
    }
  }

  // Add files
  for (const entry of entries) {
    if (entry.isFile() && !entry.name.startsWith('.')) {
      const file_stat = await fs.stat(path.join(absolute_path, entry.name))
      items.push({
        name: entry.name,
        type: 'file',
        size: format_file_size(file_stat.size),
        modified: file_stat.mtime.toISOString()
      })
    }
  }

  // Sort items: directories first, then files, alphabetically within each group
  items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  res.json({
    type: 'directory',
    base_uri,
    path: relative_path || '',
    items
  })
}

// Handle individual file
async function handle_file_by_path({
  res,
  absolute_path,
  base_uri,
  parsed_uri,
  user_context = {}
}) {
  const raw_content = await fs.readFile(absolute_path, 'utf8')
  const file_extension = path.extname(absolute_path).toLowerCase()
  const file_name = path.basename(absolute_path)

  const response = {
    type: 'file',
    base_uri,
    name: file_name,
    path: parsed_uri.path,
    raw_content,
    is_entity: false
  }

  // Handle markdown files (potential entities)
  if (file_extension === '.md') {
    try {
      // Check for entity properties
      const entity_result = await read_entity_from_filesystem({
        absolute_path
      })

      if (entity_result.success && entity_result.entity_properties) {
        response.is_entity = true
        response.metadata = entity_result.entity_properties
        response.parsed_content = entity_result.entity_content

        // Check ownership based on entity properties
        const entity_user_id = entity_result.entity_properties.user_id
        user_context.is_owner =
          user_context.user_id && entity_user_id === user_context.user_id

        // Entity files are public by default
        user_context.is_public_entity = true
      } else {
        response.parsed_content = raw_content
        // Non-entity files require knowledge base ownership (already checked above)
        user_context.is_owner = has_knowledge_base_access({ user_context })
        user_context.is_public_entity = false
      }
    } catch (err) {
      response.parsed_content = raw_content
    }
  }

  res.json(response)
}

// Helper function to extract user context from request
function get_user_context_from_request({ req }) {
  const user_context = {
    user_id: req.auth?.user_id || null,
    roles: []
  }

  return user_context
}

// Helper function to check if user has access to the knowledge base
function has_knowledge_base_access({ user_context }) {
  // Only the knowledge base owner can access non-entity files
  return user_context.user_id === config.user_id
}

// Helper function to format file sizes
function format_file_size(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default router
