import express from 'express'
import path from 'path'
import fs from 'fs/promises'

import config from '#config'
import { format_entity_from_file_content } from '#libs-server/entity/format/format-entity-from-file-content.mjs'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { type, path: directory_path } = req.query

    if (!type || !['user', 'system'].includes(type)) {
      return res
        .status(400)
        .json({ error: 'Invalid type parameter. Must be "user" or "system"' })
    }

    let base_path
    if (type === 'user') {
      base_path = config.user_base_directory
      if (!base_path) {
        console.error('user_base_directory not configured')
        return res
          .status(500)
          .json({ error: 'User base directory not configured' })
      }
    } else {
      base_path = path.join(process.cwd(), 'system')
    }

    // If directory_path is provided, append it to base_path
    let full_path = base_path
    if (directory_path) {
      // Sanitize the path to prevent directory traversal
      const sanitized_path = directory_path
        .replace(/\.\./g, '')
        .replace(/^\/+/, '')
      full_path = path.join(base_path, sanitized_path)

      // Ensure the resolved path is still within the base directory
      if (!full_path.startsWith(base_path)) {
        return res.status(400).json({ error: 'Invalid directory path' })
      }
    }

    // Check if directory exists
    try {
      const stat = await fs.stat(full_path)
      if (!stat.isDirectory()) {
        return res.status(404).json({ error: 'Path is not a directory' })
      }
    } catch (err) {
      console.error('Directory does not exist:', full_path, err)
      return res.status(404).json({ error: 'Directory not found' })
    }

    // Read directory contents
    const entries = await fs.readdir(full_path, { withFileTypes: true })

    // Separate directories and files, exclude hidden items
    const directory_entries = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Check each directory for subdirectories
    const directories = await Promise.all(
      directory_entries.map(async (entry) => {
        const dir_path = path.join(full_path, entry.name)
        let has_subdirectories = false

        try {
          const sub_entries = await fs.readdir(dir_path, {
            withFileTypes: true
          })
          has_subdirectories = sub_entries.some(
            (sub_entry) =>
              sub_entry.isDirectory() && !sub_entry.name.startsWith('.')
          )
        } catch (err) {
          console.warn(`Could not check subdirectories for ${dir_path}:`, err)
        }

        return {
          name: entry.name,
          path: directory_path ? `${directory_path}/${entry.name}` : entry.name,
          type: 'directory',
          has_subdirectories
        }
      })
    )

    const files = entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: directory_path ? `${directory_path}/${entry.name}` : entry.name,
        type: 'file'
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    res.json({ directories, files })
  } catch (error) {
    console.error('Error reading directory contents:', error)
    res.status(500).json({
      error: 'Failed to read directory contents',
      details: error.message
    })
  }
})

// Route for getting file content
router.get('/file', async (req, res) => {
  try {
    const { type, path: file_path } = req.query

    if (!type || !['user', 'system'].includes(type)) {
      return res
        .status(400)
        .json({ error: 'Invalid type parameter. Must be "user" or "system"' })
    }

    if (!file_path) {
      return res.status(400).json({ error: 'File path is required' })
    }

    let base_path
    if (type === 'user') {
      base_path = config.user_base_directory
      if (!base_path) {
        console.error('user_base_directory not configured')
        return res
          .status(500)
          .json({ error: 'User base directory not configured' })
      }
    } else {
      base_path = path.join(process.cwd(), 'system')
    }

    // Sanitize the path to prevent directory traversal
    const sanitized_path = file_path.replace(/\.\./g, '').replace(/^\/+/, '')
    const full_path = path.join(base_path, sanitized_path)

    // Ensure the resolved path is still within the base directory
    if (!full_path.startsWith(base_path)) {
      return res.status(400).json({ error: 'Invalid file path' })
    }

    // Check if file exists
    try {
      const stat = await fs.stat(full_path)
      if (!stat.isFile()) {
        return res.status(404).json({ error: 'Path is not a file' })
      }
    } catch (err) {
      console.error('File does not exist:', full_path, err)
      return res.status(404).json({ error: 'File not found' })
    }

    // Read file content
    const content = await fs.readFile(full_path, 'utf8')
    const file_extension = path.extname(full_path).toLowerCase()
    const file_name = path.basename(full_path)

    const response = {
      name: file_name,
      path: file_path,
      extension: file_extension,
      content,
      type: 'file'
    }

    // Check if it's a markdown file that might be an entity
    if (file_extension === '.md') {
      try {
        const { entity_properties, entity_content } =
          format_entity_from_file_content({
            file_content: content,
            file_path: full_path
          })

        // Check if it has entity properties
        if (
          entity_properties &&
          (entity_properties.entity_id || entity_properties.type)
        ) {
          response.is_entity = true
          response.entity_properties = entity_properties
          response.markdown_content = entity_content
        } else {
          response.is_entity = false
          response.markdown_content = entity_content || content
        }
      } catch (err) {
        console.warn('Failed to parse entity:', err)
        response.is_entity = false
        response.markdown_content = content
      }
    }

    // For JSON files, try to parse and format
    if (file_extension === '.json') {
      try {
        response.parsed_json = JSON.parse(content)
      } catch (err) {
        console.warn('Failed to parse JSON:', err)
      }
    }

    res.json(response)
  } catch (error) {
    console.error('Error reading file content:', error)
    res
      .status(500)
      .json({ error: 'Failed to read file content', details: error.message })
  }
})

export default router
