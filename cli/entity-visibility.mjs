/**
 * Entity Visibility Library
 * Manage public_read settings for entities and thread metadata files
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import picomatch from 'picomatch'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

const log = debug('cli:entity-visibility')

export function validate_boolean(value) {
  return (
    value === 'true' || value === 'false' || value === true || value === false
  )
}

export function parse_boolean(value) {
  return typeof value === 'boolean' ? value : value === 'true'
}

function is_markdown_file(file_path) {
  return file_path.endsWith('.md')
}

function is_thread_metadata(file_path) {
  return file_path.endsWith('metadata.json')
}

export async function update_file(file_path, public_read, dry_run = false) {
  try {
    let old_value

    if (is_markdown_file(file_path)) {
      log(`Reading entity from ${file_path}`)
      const result = await read_entity_from_filesystem({
        absolute_path: file_path
      })
      if (!result.success) throw new Error(result.error)

      old_value = result.entity_properties.public_read

      if (!dry_run) {
        await write_entity_to_filesystem({
          absolute_path: file_path,
          entity_properties: { ...result.entity_properties, public_read },
          entity_type: result.entity_properties.type,
          entity_content: result.entity_content
        })
      }
    } else if (is_thread_metadata(file_path)) {
      log(`Reading thread metadata from ${file_path}`)
      const content = await fs.readFile(file_path, 'utf8')
      const metadata = JSON.parse(content)

      old_value = metadata.public_read

      if (!dry_run) {
        metadata.public_read = public_read
        await fs.writeFile(file_path, JSON.stringify(metadata, null, 2) + '\n')
      }
    } else {
      throw new Error(
        'Unsupported file type. Only .md and metadata.json files are supported.'
      )
    }

    log(
      `${dry_run ? 'Would update' : 'Updated'} ${file_path} with public_read: ${public_read}`
    )
    return {
      success: true,
      file_path,
      old_value,
      new_value: public_read,
      dry_run
    }
  } catch (error) {
    log(
      `Error ${dry_run ? 'checking' : 'updating'} ${file_path}: ${error.message}`
    )
    return { success: false, file_path, error: error.message }
  }
}

export async function process_file(file_path, public_read, dry_run = false) {
  try {
    await fs.access(file_path)
    return await update_file(file_path, public_read, dry_run)
  } catch {
    return { success: false, file_path, error: 'File not found' }
  }
}

export async function find_matching_files(pattern, user_base_directory) {
  // Check if pattern is an absolute path without glob characters (single file)
  const has_glob_chars = /[*?[\]{}]/.test(pattern)

  if (path.isAbsolute(pattern) && !has_glob_chars) {
    // Single absolute file path - check if it exists and is supported
    try {
      const stat = await fs.stat(pattern)
      if (
        stat.isFile() &&
        (is_markdown_file(pattern) || is_thread_metadata(pattern))
      ) {
        return [pattern]
      }
    } catch {
      // File doesn't exist
    }
    return []
  }

  // Handle glob patterns
  let base_dir
  let match_pattern

  if (path.isAbsolute(pattern)) {
    // For absolute paths with globs, find the first directory without glob characters
    const pattern_parts = pattern.split(path.sep)
    const glob_start_index = pattern_parts.findIndex((part) =>
      /[*?[\]{}]/.test(part)
    )

    base_dir = pattern_parts.slice(0, glob_start_index).join(path.sep) || '/'
    match_pattern = pattern_parts.slice(glob_start_index).join(path.sep)
  } else {
    base_dir = user_base_directory || process.cwd()
    match_pattern = pattern
  }

  const matcher = picomatch(match_pattern)
  const files = []

  async function walk_directory(dir, relative_path = '') {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const full_path = path.join(dir, entry.name)
        const rel_path = relative_path
          ? path.join(relative_path, entry.name)
          : entry.name

        if (entry.isDirectory()) {
          await walk_directory(full_path, rel_path)
        } else if (
          entry.isFile() &&
          (matcher(rel_path) || matcher(entry.name))
        ) {
          if (is_markdown_file(full_path) || is_thread_metadata(full_path)) {
            files.push(full_path)
          }
        }
      }
    } catch (error) {
      log(`Error reading directory ${dir}: ${error.message}`)
    }
  }

  await walk_directory(base_dir)
  return files
}

/**
 * Read the current public_read value from a file
 *
 * @param {string} file_path - Absolute path to entity or metadata file
 * @returns {Object} Result with success, file_path, and public_read value
 */
export async function get_visibility(file_path) {
  try {
    await fs.access(file_path)

    if (is_markdown_file(file_path)) {
      const result = await read_entity_from_filesystem({
        absolute_path: file_path
      })
      if (!result.success) throw new Error(result.error)
      return {
        success: true,
        file_path,
        public_read: result.entity_properties.public_read
      }
    } else if (is_thread_metadata(file_path)) {
      const content = await fs.readFile(file_path, 'utf8')
      const metadata = JSON.parse(content)
      return { success: true, file_path, public_read: metadata.public_read }
    } else {
      throw new Error(
        'Unsupported file type. Only .md and metadata.json files are supported.'
      )
    }
  } catch (error) {
    return { success: false, file_path, error: error.message }
  }
}
