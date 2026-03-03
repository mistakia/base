import debug from 'debug'
import fs from 'fs/promises'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import is_main from '#libs-server/utils/is-main.mjs'

import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'
import { format_entity_from_file_content } from '#libs-server/entity/format/format-entity-from-file-content.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'

const log = debug('read-entity-from-filesystem')

// Maximum bytes to read when only frontmatter metadata is needed.
// Sized to accommodate the largest known frontmatter (~88KB) with headroom.
const METADATA_READ_LIMIT = 128 * 1024

/**
 * Read only the leading portion of a file sufficient for frontmatter extraction.
 * Uses a file descriptor with a fixed-size buffer to avoid reading entire large files.
 *
 * @param {string} absolute_path - Path to read
 * @returns {Promise<string>} - The leading content as a UTF-8 string
 */
async function read_file_head(absolute_path) {
  const handle = await fs.open(absolute_path, 'r')
  try {
    const buffer = Buffer.alloc(METADATA_READ_LIMIT)
    const { bytesRead } = await handle.read(buffer, 0, METADATA_READ_LIMIT, 0)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * Reads an entity from the filesystem and parses its content
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - The absolute path to the entity file
 * @param {boolean} [options.metadata_only=false] - When true, read only the leading
 *   portion of the file needed for frontmatter extraction instead of the full file.
 *   Avoids loading large files into memory when only entity properties are needed.
 * @returns {Promise<Object>} - The parsed entity data
 */
export async function read_entity_from_filesystem({
  absolute_path,
  metadata_only = false
} = {}) {
  try {
    log(`Reading entity from filesystem at ${absolute_path}`)

    if (!absolute_path) {
      throw new Error('Absolute path is required')
    }

    // Check if file exists
    const file_exists = await file_exists_in_filesystem({
      absolute_path
    })

    if (!file_exists) {
      return {
        success: false,
        error: `File not found at ${absolute_path}`,
        error_code: 'FILE_NOT_FOUND',
        absolute_path
      }
    }

    // Read file content (partial when only metadata is needed)
    const file_content = metadata_only
      ? await read_file_head(absolute_path)
      : await fs.readFile(absolute_path, 'utf8')

    // Check if file appears to have frontmatter (starts with ---)
    const has_frontmatter_delimiter = file_content.trimStart().startsWith('---')

    // Parse the entity from file content
    const { entity_properties, entity_content, formatted_entity_metadata } =
      format_entity_from_file_content({
        file_content,
        file_path: absolute_path
      })

    // Add base_uri to entity properties (derived from file path)
    try {
      const base_uri = create_base_uri_from_path(absolute_path)
      entity_properties.base_uri = base_uri
    } catch (error) {
      // If base_uri can't be created (e.g., path outside managed repositories),
      // continue without it - this allows tests and edge cases to work
      log(`Could not create base_uri for ${absolute_path}: ${error.message}`)
    }

    // Get entity type from properties
    const entity_type = entity_properties.type

    if (!entity_type) {
      return {
        success: false,
        error: `No entity type found in properties for ${absolute_path}`,
        error_code: has_frontmatter_delimiter
          ? 'MISSING_TYPE'
          : 'NO_FRONTMATTER',
        absolute_path
      }
    }

    // Create result object with raw content included by default
    const result = {
      success: true,
      entity_properties,
      entity_content,
      formatted_entity_metadata,
      raw_content: file_content,
      absolute_path
    }

    log(`Successfully read ${entity_type} entity from ${absolute_path}`)
    return result
  } catch (error) {
    log(`Error reading entity from filesystem at ${absolute_path}:`, error)
    return {
      success: false,
      error: error.message,
      error_code: 'PARSE_ERROR',
      absolute_path
    }
  }
}

if (is_main(import.meta.url)) {
  const argv = yargs(hideBin(process.argv))
    .option('absolute_path', {
      alias: 'a',
      description: 'Absolute path to the entity file',
      type: 'string',
      demandOption: true
    })
    .help().argv

  const main = async () => {
    let error
    try {
      const result = await read_entity_from_filesystem({
        absolute_path: argv.absolute_path
      })
      if (result.success) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        console.error('Error:', result.error)
      }
    } catch (err) {
      error = err
      console.error('Error:', error.message)
    }
    process.exit(error ? 1 : 0)
  }

  main()
}
