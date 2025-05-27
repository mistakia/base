import debug from 'debug'

import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'
import { format_document_to_file_content } from './format-document-to-file-content.mjs'

const log = debug('markdown:write-document-to-filesystem')

/**
 * Writes a document to the filesystem as a markdown file with frontmatter
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - The absolute path where the document will be written
 * @param {Object} options.document_properties - The document properties to include in frontmatter
 * @param {string} [options.document_content=''] - The markdown content to include after the frontmatter
 * @returns {Promise<boolean>} - Whether the write was successful
 */
export async function write_document_to_filesystem({
  absolute_path,
  document_properties,
  document_content = ''
}) {
  try {
    log(`Writing document to filesystem at ${absolute_path}`)

    if (!absolute_path) {
      throw new Error('Absolute path is required')
    }

    if (!document_properties || typeof document_properties !== 'object') {
      throw new Error('Document properties must be a valid object')
    }

    // Format the file content with frontmatter and document content
    const file_content = format_document_to_file_content({
      document_properties,
      document_content
    })

    // Write the formatted content to the filesystem
    await write_file_to_filesystem({
      absolute_path,
      file_content
    })

    log(`Successfully wrote document to ${absolute_path}`)
    return true
  } catch (error) {
    log(`Error writing document to filesystem at ${absolute_path}:`, error)
    throw error
  }
}
