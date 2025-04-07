import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'

import { scan_repositories, get_file_content } from './scanner.mjs'
import { parse_markdown, parse_schema_file } from './parser.mjs'
import { validate_entity } from './validator.mjs'
import { import_markdown_entity, remove_stale_entities } from './importer.mjs'
import { load_schema_definitions, build_validation_schema } from './schema.mjs'
import { git } from '#libs-server'
import config from '#config'

const log = debug('markdown')

export {
  scan_repositories,
  get_file_content,
  parse_markdown,
  parse_schema_file,
  validate_entity,
  import_markdown_entity,
  remove_stale_entities,
  load_schema_definitions,
  build_validation_schema
}

/**
 * Centralized function to process a markdown entity - handles parsing, validation, and extraction
 *
 * @param {String} content Raw markdown content with frontmatter
 * @param {Object} file_info File information object
 * @param {Object} schemas Schema definitions for validation

 * @returns {Object} Processed entity with validation results and extracted data
 */
export async function process_markdown_entity(
  content,
  file_info,
  schemas = {}
) {
  try {
    // Set up a file-like object if only content is provided
    const file = file_info || {
      file_path: 'unknown.md',
      git_sha: null,
      absolute_path: null
    }

    // Parse the markdown content
    const parsed = await parse_markdown({ ...file, content })

    if (!parsed) {
      return { valid: false, errors: ['Failed to parse markdown'] }
    }

    // Validate against schema if available
    let validation = { valid: true }
    if (Object.keys(schemas).length > 0) {
      validation = validate_entity(parsed, schemas)
    }

    // Extract tags, relations, and observations
    const extracted = {
      tags: extract_tags(parsed),
      relations: extract_relations(parsed),
      observations: extract_observations(parsed),
      frontmatter_relations: extract_frontmatter_relations(parsed)
    }

    return {
      ...parsed,
      validation,
      extracted
    }
  } catch (error) {
    log('Error processing markdown entity:', error)
    return { valid: false, errors: [error.message] }
  }
}

/**
 * Extract tags from markdown frontmatter and content
 * @param {Object} parsed Parsed markdown entity
 * @returns {Array} Extracted tags
 */
export function extract_tags(parsed) {
  const tags = []
  const frontmatter = parsed.frontmatter || {}

  // Extract tags from frontmatter
  if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
    frontmatter.tags.forEach((tag) => {
      tags.push({
        name: tag
      })
    })
  }

  // Extract hashtags from markdown content
  if (parsed.markdown) {
    const hashtag_regex = /(?<!^|\n)#([a-zA-Z0-9_/-]+)/g
    let match
    while ((match = hashtag_regex.exec(parsed.markdown)) !== null) {
      tags.push({
        name: match[1]
      })
    }
  }

  return tags
}

/**
 * Extract relations from frontmatter
 * @param {Object} parsed Parsed markdown entity
 * @returns {Array} Extracted relations
 */
export function extract_relations(parsed) {
  const relations = []
  const frontmatter = parsed.frontmatter || {}

  // Extract relations from frontmatter
  if (frontmatter.relations && Array.isArray(frontmatter.relations)) {
    frontmatter.relations.forEach((relation_str) => {
      // Parse relation string in format: "relation_type [[target_title]] (optional context)"
      const relation_match = relation_str.match(
        /^(.*?) \[\[(.*?)\]\]( \((.*?)\))?$/
      )

      if (relation_match) {
        relations.push({
          relation_type: relation_match[1],
          target_title: relation_match[2],
          context: relation_match[4] || null
        })
      }
    })
  }

  return relations
}

/**
 * Extract observations from frontmatter
 * @param {Object} parsed Parsed markdown entity
 * @returns {Array} Extracted observations
 */
export function extract_observations(parsed) {
  const observations = []
  const frontmatter = parsed.frontmatter || {}

  // Extract observations from frontmatter
  if (frontmatter.observations && Array.isArray(frontmatter.observations)) {
    frontmatter.observations.forEach((observation_str) => {
      // Parse observation string in format: "[category] content #tag (optional context)"
      const observation_match = observation_str.match(
        /^\[(.*?)\] (.*?)( \((.*?)\))?$/
      )

      if (observation_match) {
        observations.push({
          category: observation_match[1],
          content: observation_match[2],
          context: observation_match[4] || null
        })
      }
    })
  }

  return observations
}

/**
 * Extract relations from frontmatter based on entity type
 * @param {Object} parsed Parsed markdown entity
 * @returns {Array} Extracted frontmatter relations
 */
export function extract_frontmatter_relations(parsed) {
  const relations = []
  const frontmatter = parsed.frontmatter || {}
  const entity_type = frontmatter.type

  if (!entity_type) return relations

  // Define mapping of frontmatter keys to relation types based on entity type
  const relation_mappings = {
    task: {
      persons: 'assigned_to',
      physical_items: 'requires',
      digital_items: 'requires',
      parent_tasks: 'child_of',
      dependent_tasks: 'depends_on',
      activities: 'executes',
      organizations: 'involves'
    },
    physical_item: {
      parent_items: 'part_of',
      child_items: 'contains'
    },
    person: {
      organizations: 'member_of'
    },
    organization: {
      members: 'has_member'
    },
    activity: {
      guidelines: 'follows'
    }
  }

  // Get the appropriate relation mapping for this entity type
  const entity_mappings = relation_mappings[entity_type] || {}

  // Process each mapped property
  Object.keys(entity_mappings).forEach((property_key) => {
    if (frontmatter[property_key] && Array.isArray(frontmatter[property_key])) {
      frontmatter[property_key].forEach((target_title) => {
        relations.push({
          relation_type: entity_mappings[property_key],
          target_title
        })
      })
    }
  })

  return relations
}

/**
 * Import markdown files from repositories
 * @param {Object} options Configuration options
 * @param {String} user_id User ID
 * @returns {Object} Import statistics
 */
export async function import_repositories(options, user_id) {
  // Validate input parameters
  if (!options || typeof options !== 'object') {
    throw new Error('Options must be an object')
  }

  if (!user_id) {
    throw new Error('User ID must be provided')
  }

  // Define default repositories if not provided
  const current_system_branch = await git.get_current_branch()
  const system_branch =
    options.system_branch || config.system_main_branch || current_system_branch
  const system_repository = options.system_repository || {
    path: './system',
    branch: system_branch,
    is_submodule: false
  }

  const current_user_branch = await git.get_current_branch('./data')
  const user_branch =
    options.user_branch || config.user_main_branch || current_user_branch
  const user_repository = options.user_repository || {
    path: './data',
    branch: user_branch,
    is_submodule: true
  }

  // Track import stats
  let imported = 0
  let skipped = 0
  let errors = 0

  // Load schemas from filesystem
  log('Loading schema definitions...')
  const schemas = await load_schema_definitions({
    system_repository,
    user_repository
  })

  // Scan for all markdown files
  log('Scanning repositories...')
  const files = await scan_repositories([system_repository, user_repository])
  log(`Found ${files.length} markdown files`)

  // Import each file
  for (const file of files) {
    try {
      // Skip schema files if configured to do so
      if (options.skip_schema_files && file.file_path.startsWith('schema/')) {
        continue
      }

      // Get file content
      const content = await get_file_content(file)

      // Process the markdown entity with centralized function
      const processed = await process_markdown_entity(content, file, schemas)

      if (processed.validation.valid) {
        // Pass schemas and force_update option if specified
        await import_markdown_entity(processed, file, user_id, {
          force_update: options.force_update,
          schemas
        })
        imported++
      } else {
        log(
          `Validation failed for ${file.file_path}:`,
          processed.validation.errors
        )
        skipped++
      }
    } catch (error) {
      log(`Error processing file ${file.file_path}:`, error)
      errors++
    }
  }

  // Archive entities that no longer exist if enabled
  const removed = await remove_stale_entities(files, user_id)

  return { imported, skipped, errors, removed }
}

export function format_repository({ type = 'system', branch = 'main' }) {
  if (type === 'system') {
    return {
      path: './system',
      branch,
      is_submodule: false
    }
  }

  if (type === 'user') {
    return {
      path: './data',
      branch,
      is_submodule: true
    }
  }
}

/**
 * Read a markdown entity from a file with frontmatter
 * @param {String} file_path Relative path to the markdown file
 * @returns {Promise<Object>} Parsed markdown with frontmatter and content
 */
export async function read_markdown_entity(file_path) {
  try {
    log(`Reading markdown entity from ${file_path}`)

    // For test safety, see if the file can be read directly without requiring absolute path
    try {
      const content = await fs.readFile(file_path, 'utf8')
      const processed = await parse_markdown({ file_path, content })
      return {
        frontmatter: processed.frontmatter || {},
        content: processed.content || processed.markdown || ''
      }
    } catch (direct_read_error) {
      // If direct read failed, try with get_file_content
      log(
        `Direct file read failed, trying with file object: ${direct_read_error.message}`
      )
      const content = await get_file_content({
        file_path,
        absolute_path: path.resolve(file_path)
      })

      if (!content) {
        throw new Error(`File not found or empty: ${file_path}`)
      }

      // Use the existing process_markdown_entity function
      const processed = await process_markdown_entity(content, { file_path })

      return {
        frontmatter: processed.frontmatter || {},
        content: processed.content || processed.markdown || ''
      }
    }
  } catch (error) {
    log(`Error reading markdown entity ${file_path}:`, error)
    throw error
  }
}

/**
 * Write a markdown entity to a file with frontmatter
 * @param {String} file_path Relative path to the markdown file
 * @param {Object} frontmatter Frontmatter object
 * @param {String} content Markdown content
 * @returns {Promise<Boolean>} True if successful
 */
export async function write_markdown_entity(
  file_path,
  frontmatter,
  content = ''
) {
  try {
    log(`Writing markdown entity to ${file_path}`)

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

    // Ensure directory exists
    const dir_path = file_path.substring(0, file_path.lastIndexOf('/'))
    if (dir_path) {
      await fs.mkdir(dir_path, { recursive: true })
    }

    // Write the file
    await fs.writeFile(file_path, full_content)

    log(`Successfully wrote markdown entity to ${file_path}`)
    return true
  } catch (error) {
    log(`Error writing markdown entity ${file_path}:`, error)
    throw error
  }
}
