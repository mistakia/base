/**
 * Stream Entity Files
 *
 * Async generator that walks entity directories and yields parsed entities
 * in chunks, avoiding loading all entities into memory at once.
 * Replaces upfront-load list_entity_files_from_filesystem() for rebuild
 * and resync paths to reduce peak memory.
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { create_file_info } from '#libs-server/repository/create-file-info.mjs'

const log = debug('embedded-index:sync:stream-entity-files')

/**
 * Async generator that walks entity directories and yields arrays of
 * parsed entities in chunks.
 *
 * @param {Object} params
 * @param {string[]} params.entity_directories - Directory names to scan (e.g., ['task', 'tag'])
 * @param {number} [params.chunk_size=100] - Number of entities per yielded chunk
 * @yields {Array<{ entity_properties: Object, entity_content: string, formatted_entity_metadata: Object, file_info: Object }>}
 */
export async function* stream_entity_file_chunks({
  entity_directories,
  chunk_size = 100
}) {
  const user_base_directory = config.user_base_directory
  let chunk = []

  for (const dir_name of entity_directories) {
    const dir_path = path.join(user_base_directory, dir_name)

    let entries
    try {
      entries = await fs.readdir(dir_path, {
        withFileTypes: true,
        recursive: true
      })
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue
      }
      log('Error reading directory %s: %s', dir_name, error.message)
      continue
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue
      }

      const absolute_path = path.join(entry.parentPath, entry.name)
      const relative_path = path.relative(user_base_directory, absolute_path)

      try {
        const entity_result = await read_entity_from_filesystem({
          absolute_path
        })

        if (!entity_result.success || !entity_result.entity_properties) {
          continue
        }

        const file_info = create_file_info({
          repo_path: user_base_directory,
          relative_path,
          absolute_path
        })

        chunk.push({
          entity_properties: entity_result.entity_properties,
          entity_content: entity_result.entity_content,
          formatted_entity_metadata: entity_result.formatted_entity_metadata,
          file_info
        })

        if (chunk.length >= chunk_size) {
          yield chunk
          chunk = []
        }
      } catch (error) {
        log('Error reading entity %s: %s', relative_path, error.message)
      }
    }

    // Yield to event loop between directories
    await new Promise((resolve) => setImmediate(resolve))
  }

  // Yield remaining entities
  if (chunk.length > 0) {
    yield chunk
  }
}
