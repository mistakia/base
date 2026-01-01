import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { update_entity_references } from '#libs-server/entity/filesystem/update-entity-references.mjs'
import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import {
  create_base_uri_from_path,
  resolve_base_uri,
  is_valid_base_uri
} from '#libs-server/base-uri/base-uri-utilities.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'

const log = debug('move-entity-filesystem')

/**
 * Resolve an input path (base_uri, relative, or absolute) to an absolute path
 * @param {string} path_input - The path input to resolve
 * @returns {Object} - { absolute_path, base_uri }
 */
function resolve_entity_path_input(path_input) {
  // Check if it's a valid base_uri
  if (is_valid_base_uri(path_input)) {
    const absolute_path = resolve_base_uri(path_input)
    return { absolute_path, base_uri: path_input }
  }

  // Check if it's an absolute path
  if (path.isAbsolute(path_input)) {
    const base_uri = create_base_uri_from_path(path_input)
    return { absolute_path: path_input, base_uri }
  }

  // Treat as relative path within user base directory
  const user_base_directory = get_user_base_directory()
  const absolute_path = path.join(user_base_directory, path_input)
  const base_uri = create_base_uri_from_path(absolute_path)
  return { absolute_path, base_uri }
}

/**
 * Move an entity file and update all references to it
 *
 * @param {Object} options - Function options
 * @param {string} options.source_path - Source path (base_uri, relative, or absolute)
 * @param {string} options.destination_path - Destination path (base_uri, relative, or absolute)
 * @param {boolean} [options.dry_run=false] - If true, preview changes without executing
 * @param {string[]} [options.include_path_patterns=[]] - Path patterns to include for reference scan
 * @param {string[]} [options.exclude_path_patterns=[]] - Path patterns to exclude from reference scan
 * @returns {Promise<Object>} - Result with success, source_base_uri, destination_base_uri, files_updated, etc.
 */
export async function move_entity_filesystem({
  source_path,
  destination_path,
  dry_run = false,
  include_path_patterns = [],
  exclude_path_patterns = []
}) {
  log(
    `Moving entity from ${source_path} to ${destination_path} (dry_run: ${dry_run})`
  )

  const result = {
    success: false,
    source_base_uri: null,
    destination_base_uri: null,
    files_updated: [],
    file_moved: false,
    reference_updates: 0,
    errors: [],
    dry_run
  }

  try {
    // Resolve source path
    const source_resolved = resolve_entity_path_input(source_path)
    result.source_base_uri = source_resolved.base_uri
    log(
      `Source resolved: ${source_resolved.absolute_path} (${source_resolved.base_uri})`
    )

    // Resolve destination path
    const destination_resolved = resolve_entity_path_input(destination_path)
    result.destination_base_uri = destination_resolved.base_uri
    log(
      `Destination resolved: ${destination_resolved.absolute_path} (${destination_resolved.base_uri})`
    )

    // Validate source exists
    const source_exists = await file_exists_in_filesystem({
      absolute_path: source_resolved.absolute_path
    })

    if (!source_exists) {
      result.errors.push(
        `Source file does not exist: ${source_resolved.absolute_path}`
      )
      return result
    }

    // Validate destination does not exist
    const destination_exists = await file_exists_in_filesystem({
      absolute_path: destination_resolved.absolute_path
    })

    if (destination_exists) {
      result.errors.push(
        `Destination file already exists: ${destination_resolved.absolute_path}`
      )
      return result
    }

    // Check if source and destination are the same
    if (source_resolved.base_uri === destination_resolved.base_uri) {
      result.errors.push('Source and destination are the same')
      return result
    }

    // Read the source entity
    const entity_result = await read_entity_from_filesystem({
      absolute_path: source_resolved.absolute_path
    })

    if (!entity_result.success) {
      result.errors.push(`Failed to read source entity: ${entity_result.error}`)
      return result
    }

    // Update references in all other files
    log('Scanning for references to update...')
    const reference_result = await update_entity_references({
      old_base_uri: source_resolved.base_uri,
      new_base_uri: destination_resolved.base_uri,
      dry_run,
      include_path_patterns,
      exclude_path_patterns
    })

    result.files_updated = reference_result.files_with_references
    result.reference_updates = reference_result.total_updates

    if (reference_result.errors.length > 0) {
      result.errors.push(...reference_result.errors.map((e) => e.error))
    }

    if (!dry_run) {
      // Create destination directory if needed
      const destination_directory = path.dirname(
        destination_resolved.absolute_path
      )
      await fs.mkdir(destination_directory, { recursive: true })
      log(`Ensured destination directory exists: ${destination_directory}`)

      // Update the entity's base_uri and write to destination
      const updated_properties = {
        ...entity_result.entity_properties,
        base_uri: destination_resolved.base_uri
      }

      await write_entity_to_filesystem({
        absolute_path: destination_resolved.absolute_path,
        entity_properties: updated_properties,
        entity_type: entity_result.entity_properties.type,
        entity_content: entity_result.entity_content
      })
      log(`Wrote entity to destination: ${destination_resolved.absolute_path}`)

      // Remove the source file
      await fs.unlink(source_resolved.absolute_path)
      log(`Removed source file: ${source_resolved.absolute_path}`)

      result.file_moved = true
    }

    result.success = true
    log(`Move operation completed successfully (dry_run: ${dry_run})`)

    return result
  } catch (error) {
    log(`Error during move operation: ${error.message}`)
    result.errors.push(error.message)
    return result
  }
}
