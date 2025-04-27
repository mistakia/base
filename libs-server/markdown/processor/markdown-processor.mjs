import debug from 'debug'

import {
  read_markdown_from_file,
  read_markdown_from_git
} from '#libs-server/markdown/file-operations/read.mjs'
import {
  parse_markdown_content,
  parse_markdown_schema_content
} from '#libs-server/markdown/processor/markdown-parser.mjs'
import { validate_markdown_entity } from '#libs-server/markdown/validation/validate-markdown-entity.mjs'
import {
  extract_entity_tags,
  extract_entity_relations,
  extract_entity_references,
  extract_entity_observations
} from './extractors/index.mjs'

const log = debug('markdown:processor')

/**
 * Extracts metadata from a parsed markdown document
 * @param {Object} params
 * @param {Object} params.parsed_markdown The parsed markdown document
 * @returns {Object} Extracted entity metadata
 */
export function extract_entity_metadata({ parsed_markdown }) {
  if (!parsed_markdown) {
    throw new Error('Parsed markdown is required for metadata extraction')
  }

  try {
    return {
      tags: extract_entity_tags(parsed_markdown),
      relations: extract_entity_relations(parsed_markdown),
      references: extract_entity_references(parsed_markdown),
      observations: extract_entity_observations(parsed_markdown)
    }
  } catch (error) {
    log('Error extracting metadata:', error)
    throw new Error(`Failed to extract metadata: ${error.message}`)
  }
}

/**
 * Format markdown entity after parsing
 * @param {Object} params
 * @param {Object} params.parsed_markdown The parsed markdown document
 * @param {Object} [params.schemas={}] Schema definitions for validation
 * @param {string} [params.system_branch] System branch reference for git
 * @param {string} [params.user_branch] User branch reference for git
 * @param {boolean} [params.skip_entity_validations=false] Whether to skip entity validations
 * @returns {Promise<Object>} Processed markdown document
 */
async function format_markdown_entity({
  parsed_markdown,
  schemas = {},
  system_branch = null,
  user_branch = null,
  skip_entity_validations = false
}) {
  try {
    // Extract metadata first
    const entity_metadata = extract_entity_metadata({ parsed_markdown })

    // Create formatted entity with metadata
    const formatted_markdown_entity = {
      ...parsed_markdown,
      entity_metadata
    }

    // Validate the formatted entity against schemas
    const validation = await validate_markdown_entity({
      formatted_markdown_entity,
      schemas,
      system_branch,
      user_branch,
      skip_entity_validations
    })

    // Return complete processed document
    return {
      ...formatted_markdown_entity,
      ...validation
    }
  } catch (error) {
    log('Error processing parsed markdown:', error)
    throw new Error(`Failed to process parsed markdown: ${error.message}`)
  }
}

/**
 * Process markdown from a file on disk
 * @param {Object} params
 * @param {string} params.absolute_path Absolute path to the markdown file
 * @param {string} [params.user_branch] User branch reference for git
 * @param {string} [params.system_branch] System branch reference for git
 * @param {Object} [params.schemas={}] Schema definitions for validation
 * @param {string} [params.encoding='utf8'] File encoding
 * @returns {Promise<Object>} Processed markdown document
 */
export async function process_markdown_from_file({
  absolute_path,
  user_branch = null,
  system_branch = null,
  schemas = {},
  encoding = 'utf8'
}) {
  try {
    // Read content
    const content = await read_markdown_from_file({
      absolute_path,
      encoding
    })

    // Parse content
    const parsed_markdown = await parse_markdown_content({
      content,
      file_path: absolute_path
    })

    // Return formatted markdown entity
    return await format_markdown_entity({
      parsed_markdown,
      schemas,
      system_branch,
      user_branch
    })
  } catch (error) {
    console.log(error)
    log(`Error processing markdown file ${absolute_path}:`, error)
    throw new Error(`Failed to process markdown file: ${error.message}`)
  }
}

/**
 * Process markdown from a git repository
 * @param {Object} params
 * @param {string} params.git_relative_path Git relative path to the markdown file
 * @param {string} params.branch Branch reference for git
 * @param {string} params.repo_path Repository path
 * @param {string} [params.user_branch] User branch reference for git
 * @param {string} [params.system_branch] System branch reference for git
 * @param {Object} [params.schemas={}] Schema definitions for validation
 * @returns {Promise<Object>} Processed markdown document
 */
export async function process_markdown_from_git({
  git_relative_path,
  branch,
  repo_path,
  user_branch = null,
  system_branch = null,
  schemas = {}
}) {
  try {
    // Read content
    const content = await read_markdown_from_git({
      git_relative_path,
      branch,
      repo_path
    })

    // Parse content
    const parsed_markdown = await parse_markdown_content({
      content,
      file_path: git_relative_path
    })

    // Return formatted markdown entity
    return await format_markdown_entity({
      parsed_markdown,
      schemas,
      system_branch,
      user_branch
    })
  } catch (error) {
    log(`Error processing markdown file ${git_relative_path}:`, error)
    throw new Error(`Failed to process markdown file: ${error.message}`)
  }
}

/**
 * Process markdown schema from a file on disk
 * @param {Object} params
 * @param {string} params.absolute_path Absolute path to the markdown schema file
 * @param {string} [params.user_branch] User branch reference for git
 * @param {string} [params.system_branch] System branch reference for git
 * @param {Object} [params.schemas={}] Schema definitions for validation
 * @param {string} [params.encoding='utf8'] File encoding
 * @returns {Promise<Object>} Processed markdown schema document
 */
export async function process_markdown_schema_from_file({
  absolute_path,
  user_branch = null,
  system_branch = null,
  schemas = {},
  encoding = 'utf8'
}) {
  try {
    // Read content
    const content = await read_markdown_from_file({
      absolute_path,
      encoding
    })

    // Parse content using schema-specific parser
    const parsed_markdown = await parse_markdown_schema_content({
      file_path: absolute_path,
      content
    })

    // Return formatted markdown entity
    return await format_markdown_entity({
      parsed_markdown,
      schemas,
      system_branch,
      user_branch
    })
  } catch (error) {
    log(`Error processing markdown schema file ${absolute_path}:`, error)
    throw new Error(`Failed to process markdown schema file: ${error.message}`)
  }
}

/**
 * Process markdown schema from a git repository
 * @param {Object} params
 * @param {string} params.git_relative_path Git relative path to the markdown schema file
 * @param {string} params.branch Branch reference for git
 * @param {string} params.repo_path Repository path
 * @param {string} [params.user_branch] User branch reference for git
 * @param {string} [params.system_branch] System branch reference for git
 * @param {Object} [params.schemas={}] Schema definitions for validation
 * @returns {Promise<Object>} Processed markdown schema document
 */
export async function process_markdown_schema_from_git({
  git_relative_path,
  branch,
  repo_path,
  user_branch = null,
  system_branch = null,
  schemas = {}
}) {
  try {
    // Read content
    const content = await read_markdown_from_git({
      git_relative_path,
      branch,
      repo_path
    })

    // Parse content using schema-specific parser
    const parsed_markdown = await parse_markdown_schema_content({
      file_path: git_relative_path,
      content
    })

    // Return formatted markdown entity
    return await format_markdown_entity({
      parsed_markdown,
      schemas,
      system_branch,
      user_branch
    })
  } catch (error) {
    log(`Error processing markdown schema file ${git_relative_path}:`, error)
    throw new Error(`Failed to process markdown schema file: ${error.message}`)
  }
}

/**
 * Process markdown content directly without file access
 * @param {Object} params
 * @param {string} params.content Raw markdown content
 * @param {string} params.file_path Path to markdown file
 * @param {Object} [params.schemas={}] Schema definitions for validation
 * @returns {Object} Processed markdown document
 */
export async function process_markdown_content({
  content,
  file_path,
  schemas = {}
}) {
  try {
    // Parse content
    const parsed_markdown = await parse_markdown_content({ content, file_path })

    // Return formatted markdown entity
    return await format_markdown_entity({
      parsed_markdown,
      schemas,
      skip_entity_validations: true
    })
  } catch (error) {
    log('Error processing markdown content:', error)
    throw new Error(`Failed to process markdown content: ${error.message}`)
  }
}
