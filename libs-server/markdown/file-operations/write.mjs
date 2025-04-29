import fs from 'fs/promises'
import debug from 'debug'
import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'

const log = debug('markdown:file-operations:write')

/**
 * Write a markdown entity to a file with frontmatter
 * @param {Object} params - Parameters for writing markdown entity
 * @param {String} params.absolute_path - Absolute path to the markdown file
 * @param {Object} params.frontmatter - Frontmatter object
 * @param {String} [params.content=''] - Markdown content
 * @returns {Promise<Boolean>} True if successful
 */
export async function write_markdown_entity({
  absolute_path,
  frontmatter,
  content = ''
}) {
  try {
    log(`Writing markdown entity to ${absolute_path}`)

    // Ensure frontmatter is valid
    if (!frontmatter || typeof frontmatter !== 'object') {
      throw new Error('Frontmatter must be a valid object')
    }

    // Create frontmatter block
    const yaml_lines = ['---']

    // Sort keys for consistent output, with 'title', 'type', and 'status' first
    const sorted_keys = Object.keys(frontmatter).sort((a, b) => {
      if (a === 'title') return -1
      if (b === 'title') return 1
      if (a === 'type') return -1
      if (b === 'type') return 1
      if (a === 'status') return -1
      if (b === 'status') return 1
      return a.localeCompare(b)
    })

    for (const key of sorted_keys) {
      const value = frontmatter[key]

      // Handle different value types
      if (value === null || value === undefined) {
        continue
      } else if (Array.isArray(value)) {
        yaml_lines.push(`${key}:`)
        value.forEach((item) => {
          yaml_lines.push(
            `  - ${typeof item === 'string' ? JSON.stringify(item) : JSON.stringify(item)}`
          )
        })
      } else if (typeof value === 'object') {
        // Simple one-level object serialization
        yaml_lines.push(`${key}:`)
        Object.entries(value).forEach(([k, v]) => {
          yaml_lines.push(
            `  ${k}: ${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`
          )
        })
      } else if (typeof value === 'string') {
        // For key status values, don't add quotes
        if (key === 'status') {
          yaml_lines.push(`${key}: ${value}`)
        } else {
          // For other strings, ensure proper quoting
          yaml_lines.push(`${key}: ${JSON.stringify(value)}`)
        }
      } else {
        // For non-strings like numbers, booleans
        yaml_lines.push(`${key}: ${value}`)
      }
    }

    yaml_lines.push('---')

    // Combine frontmatter and content
    const full_content = `${yaml_lines.join('\n')}\n\n${content.trim()}`

    // Write the file
    await write_file_to_filesystem({
      absolute_path,
      file_content: full_content
    })

    log(`Successfully wrote markdown entity to ${absolute_path}`)
    return true
  } catch (error) {
    log(`Error writing markdown entity ${absolute_path}:`, error)
    throw error
  }
}
