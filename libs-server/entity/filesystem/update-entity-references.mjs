import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'
import { spawnSync } from 'child_process'

import { process_repositories_from_filesystem } from '#libs-server/repository/filesystem/process-filesystem-repository.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'

const log = debug('update-entity-references')

/**
 * Escape special regex characters in a string
 * @param {string} string - The string to escape
 * @returns {string} - Escaped string safe for use in regex
 */
function escape_regex_string(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Update references in entity relations array
 * @param {Object} options - Function options
 * @param {Array} options.relations - Array of relation strings
 * @param {string} options.old_base_uri - The old base_uri to replace
 * @param {string} options.new_base_uri - The new base_uri to use
 * @returns {Object} - { updated_relations, update_count }
 */
function update_relations_references({
  relations,
  old_base_uri,
  new_base_uri
}) {
  if (!relations || !Array.isArray(relations)) {
    return { updated_relations: relations, update_count: 0 }
  }

  let update_count = 0
  const updated_relations = relations.map((relation) => {
    if (
      typeof relation === 'string' &&
      relation.includes(`[[${old_base_uri}]]`)
    ) {
      update_count++
      return relation.replace(`[[${old_base_uri}]]`, `[[${new_base_uri}]]`)
    }

    // Handle object-format relations: { type, target, context? }
    if (
      relation &&
      typeof relation === 'object' &&
      relation.target === old_base_uri
    ) {
      update_count++
      return { ...relation, target: new_base_uri }
    }

    return relation
  })

  return { updated_relations, update_count }
}

/**
 * Update references in entity tags array
 * Tags are plain base_uri strings (e.g., "user:tag/home/my-tag.md")
 * @param {Object} options - Function options
 * @param {Array} options.tags - Array of tag base_uri strings
 * @param {string} options.old_base_uri - The old base_uri to replace
 * @param {string} options.new_base_uri - The new base_uri to use
 * @returns {Object} - { updated_tags, update_count }
 */
function update_tags_references({ tags, old_base_uri, new_base_uri }) {
  if (!tags || !Array.isArray(tags)) {
    return { updated_tags: tags, update_count: 0 }
  }

  let update_count = 0
  const updated_tags = tags.map((tag) => {
    if (typeof tag === 'string' && tag === old_base_uri) {
      update_count++
      return new_base_uri
    }
    return tag
  })

  return { updated_tags, update_count }
}

/**
 * Update references in entity content (markdown body)
 * @param {Object} options - Function options
 * @param {string} options.entity_content - The entity markdown content
 * @param {string} options.old_base_uri - The old base_uri to replace
 * @param {string} options.new_base_uri - The new base_uri to use
 * @returns {Object} - { updated_content, update_count }
 */
function update_content_references({
  entity_content,
  old_base_uri,
  new_base_uri
}) {
  if (!entity_content || typeof entity_content !== 'string') {
    return { updated_content: entity_content, update_count: 0 }
  }

  const escaped_old_uri = escape_regex_string(old_base_uri)
  const pattern = new RegExp(`\\[\\[${escaped_old_uri}\\]\\]`, 'g')

  const matches = entity_content.match(pattern)
  const update_count = matches ? matches.length : 0

  const updated_content = entity_content.replace(pattern, `[[${new_base_uri}]]`)

  return { updated_content, update_count }
}

/**
 * Scan all entity files and update references from old_base_uri to new_base_uri
 *
 * @param {Object} options - Function options
 * @param {string} options.old_base_uri - The old base_uri to find and replace
 * @param {string} options.new_base_uri - The new base_uri to use as replacement
 * @param {boolean} [options.dry_run=false] - If true, preview changes without writing
 * @param {string[]} [options.include_path_patterns=[]] - Path patterns to include
 * @param {string[]} [options.exclude_path_patterns=[]] - Path patterns to exclude
 * @returns {Promise<Object>} - Result with files_scanned, files_with_references, total_updates, errors
 */
export async function update_entity_references({
  old_base_uri,
  new_base_uri,
  dry_run = false,
  include_path_patterns = [],
  exclude_path_patterns = []
}) {
  log(
    `Updating references from ${old_base_uri} to ${new_base_uri} (dry_run: ${dry_run})`
  )

  if (!old_base_uri || !new_base_uri) {
    throw new Error('Both old_base_uri and new_base_uri are required')
  }

  if (old_base_uri === new_base_uri) {
    return {
      files_scanned: 0,
      files_with_references: [],
      total_updates: 0,
      errors: []
    }
  }

  const files_with_references = []
  const errors = []
  let total_updates = 0

  // Process all entity files
  const process_result = await process_repositories_from_filesystem({
    include_path_patterns,
    exclude_path_patterns,
    entity_processor: async ({ file }) => {
      try {
        // Read the full entity
        const entity_result = await read_entity_from_filesystem({
          absolute_path: file.absolute_path
        })

        if (!entity_result.success) {
          log(`Failed to read ${file.absolute_path}: ${entity_result.error}`)
          return false
        }

        const { entity_properties, entity_content } = entity_result
        let file_update_count = 0
        let relation_updates = 0
        let content_updates = 0
        let tag_updates = 0

        // Check and update relations
        const relations_result = update_relations_references({
          relations: entity_properties.relations,
          old_base_uri,
          new_base_uri
        })
        relation_updates = relations_result.update_count

        // Check and update tags
        const tags_result = update_tags_references({
          tags: entity_properties.tags,
          old_base_uri,
          new_base_uri
        })
        tag_updates = tags_result.update_count

        // Check and update content
        const content_result = update_content_references({
          entity_content,
          old_base_uri,
          new_base_uri
        })
        content_updates = content_result.update_count

        file_update_count = relation_updates + tag_updates + content_updates

        if (file_update_count > 0) {
          log(
            `Found ${file_update_count} references in ${file.absolute_path} (relations: ${relation_updates}, tags: ${tag_updates}, content: ${content_updates})`
          )

          files_with_references.push({
            absolute_path: file.absolute_path,
            base_uri: file.base_uri,
            relation_updates,
            tag_updates,
            content_updates,
            total_updates: file_update_count
          })

          total_updates += file_update_count

          // Write updates if not dry run
          if (!dry_run) {
            const updated_properties = {
              ...entity_properties,
              relations: relations_result.updated_relations,
              tags: tags_result.updated_tags
            }

            await write_entity_to_filesystem({
              absolute_path: file.absolute_path,
              entity_properties: updated_properties,
              entity_type: entity_properties.type,
              entity_content: content_result.updated_content
            })

            log(`Updated ${file.absolute_path}`)
          }
        }

        return true
      } catch (error) {
        log(`Error processing ${file.absolute_path}: ${error.message}`)
        errors.push({
          absolute_path: file.absolute_path,
          error: error.message
        })
        return false
      }
    }
  })

  log(
    `Scanned ${process_result.total} files, found ${files_with_references.length} with references, ${total_updates} total updates`
  )

  return {
    files_scanned: process_result.total,
    files_with_references,
    total_updates,
    errors,
    dry_run
  }
}

/**
 * Update references in thread metadata.json files
 *
 * Thread metadata.json files store relations in a `relations` array that
 * may reference entity base_uris. This function uses grep pre-filtering to
 * efficiently find only threads containing the old_base_uri, then updates
 * those references when an entity is moved.
 *
 * @param {Object} options - Function options
 * @param {string} options.old_base_uri - The old base_uri to find and replace
 * @param {string} options.new_base_uri - The new base_uri to use as replacement
 * @param {boolean} [options.dry_run=false] - If true, preview changes without writing
 * @returns {Promise<Object>} - Result with threads_with_references, total_updates, errors
 */
export async function update_thread_metadata_references({
  old_base_uri,
  new_base_uri,
  dry_run = false
}) {
  log(
    `Updating thread metadata references from ${old_base_uri} to ${new_base_uri} (dry_run: ${dry_run})`
  )

  if (!old_base_uri || !new_base_uri) {
    throw new Error('Both old_base_uri and new_base_uri are required')
  }

  if (old_base_uri === new_base_uri) {
    return {
      threads_with_references: [],
      total_updates: 0,
      errors: [],
      dry_run
    }
  }

  const thread_directory = get_thread_base_directory()
  const threads_updated = []
  const errors = []
  let total_updates = 0
  let metadata_files = []

  try {
    // Pre-filter using grep to find only metadata files containing the old_base_uri
    // This avoids parsing JSON for threads that don't have any matching references
    // Using spawnSync to avoid shell injection via old_base_uri
    try {
      const grep_result = spawnSync(
        'grep',
        ['-l', old_base_uri, '--include=metadata.json', '-r', '.'],
        {
          cwd: thread_directory,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large results
        }
      )

      // grep returns exit code 1 when no matches found, which is fine
      if (grep_result.stdout) {
        metadata_files = grep_result.stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((file) => path.join(thread_directory, file))
      }
    } catch (grep_error) {
      log(`Grep completed with no matches or error: ${grep_error.message}`)
    }

    log(
      `Found ${metadata_files.length} thread metadata files with potential matches`
    )

    for (const metadata_path of metadata_files) {
      try {
        const content = await fs.readFile(metadata_path, 'utf-8')
        const metadata = JSON.parse(content)

        if (!metadata.relations || !Array.isArray(metadata.relations)) {
          continue
        }

        // Check if any relations contain the old base_uri
        const relations_result = update_relations_references({
          relations: metadata.relations,
          old_base_uri,
          new_base_uri
        })

        if (relations_result.update_count > 0) {
          const thread_id = path.basename(path.dirname(metadata_path))
          log(
            `Found ${relations_result.update_count} references in thread ${thread_id}`
          )

          threads_updated.push({
            thread_id,
            metadata_path,
            update_count: relations_result.update_count
          })

          total_updates += relations_result.update_count

          if (!dry_run) {
            metadata.relations = relations_result.updated_relations
            await write_file_to_filesystem({
              absolute_path: metadata_path,
              file_content: JSON.stringify(metadata, null, 2)
            })
            log(`Updated thread metadata: ${metadata_path}`)
          }
        }
      } catch (error) {
        log(`Error processing ${metadata_path}: ${error.message}`)
        errors.push({
          metadata_path,
          error: error.message
        })
      }
    }
  } catch (error) {
    log(`Error scanning thread directory: ${error.message}`)
    errors.push({
      metadata_path: thread_directory,
      error: error.message
    })
  }

  log(
    `Found ${metadata_files.length} threads with matches, updated ${threads_updated.length} with ${total_updates} reference updates`
  )

  return {
    threads_with_references: threads_updated,
    total_updates,
    errors,
    dry_run
  }
}
