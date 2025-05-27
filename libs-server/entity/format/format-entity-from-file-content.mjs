import debug from 'debug'
import { format_document_from_file_content } from '#libs-server/markdown/format-document-from-file-content.mjs'
import {
  extract_entity_tags,
  extract_entity_observations,
  extract_entity_relations,
  extract_entity_references
} from './extractors/index.mjs'

const log = debug('entity:format')

/**
 * Parses a markdown file with frontmatter to extract entity properties and content
 *
 * @param {Object} options - Function options
 * @param {string} options.file_content - The raw file content to parse
 * @param {string} options.file_path - The path of the file for error reporting
 * @returns {Object} - Object containing entity_properties, entity_content, and formatted_entity_metadata
 */
export function format_entity_from_file_content({ file_content, file_path }) {
  try {
    log(`Parsing entity content from ${file_path}`)

    // Use the general document formatter to get basic document structure
    const { document_properties, document_content, tokens } =
      format_document_from_file_content({
        file_content,
        file_path
      })

    // Map document properties to entity properties
    const entity_properties = document_properties
    const entity_content = document_content

    // Extract entity metadata using the extractors
    const { property_tags } = extract_entity_tags({
      entity_properties
    })
    const formatted_entity_metadata = {
      property_tags,
      observations: extract_entity_observations({ entity_properties }),
      relations: extract_entity_relations({ entity_properties }),
      references: extract_entity_references({ entity_content, tokens })
    }

    return {
      entity_properties,
      entity_content,
      formatted_entity_metadata
    }
  } catch (error) {
    log(`Error parsing entity content from ${file_path}:`, error)
    throw error
  }
}
