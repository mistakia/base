import {
  list_markdown_files_from_git,
  list_markdown_files_from_filesystem
} from './repository/list-markdown-files.mjs'
import {
  process_markdown_schema_from_git,
  process_markdown_schema_from_file
} from './processor/markdown-processor.mjs'
import debug from 'debug'

const log = debug('markdown:schema')

const SYSTEM_SCHEMA_GIT_RELATIVE_DIR = 'system/schema'
const USER_SCHEMA_GIT_RELATIVE_DIR = 'schema'

/**
 * Load schema definitions from markdown files using git
 * @param {Object} params Configuration options
 * @param {Object} params.system_repository System repository config
 * @param {Object} params.user_repository User repository config
 * @returns {Promise<Object>} Map of schema definitions by type
 */
export async function load_schema_definitions_from_git({
  system_repository,
  user_repository
} = {}) {
  // TODO validate input
  if (!system_repository) {
    throw new Error('system_repository is required')
  }

  // TODO validate input
  if (!user_repository) {
    throw new Error('user_repository is required')
  }

  try {
    // Collect all schema files from repositories
    log('Scanning repositories for schema files')
    const all_files = await list_markdown_files_from_git([
      system_repository,
      user_repository
    ])
    const schema_files = all_files.filter((file) => {
      return (
        (file.git_relative_path.startsWith(SYSTEM_SCHEMA_GIT_RELATIVE_DIR) ||
          file.git_relative_path.startsWith(USER_SCHEMA_GIT_RELATIVE_DIR)) &&
        file.git_relative_path.endsWith('.md')
      )
    })

    log(`Found ${schema_files.length} schema files`)

    // Process schema files
    const schema_map = {}
    const type_extensions = []

    for (const file of schema_files) {
      try {
        // Parse schema file
        const formatted_markdown_entity =
          await process_markdown_schema_from_git({
            git_relative_path: file.git_relative_path,
            branch: file.branch,
            repo_path: file.repo_path
          })

        if (formatted_markdown_entity.frontmatter.type === 'type_definition') {
          schema_map[formatted_markdown_entity.frontmatter.name] = {
            ...formatted_markdown_entity.frontmatter,
            git_relative_path: file.git_relative_path
          }
        } else if (
          formatted_markdown_entity.frontmatter.type === 'type_extension'
        ) {
          // Store extensions for later processing
          type_extensions.push({
            ...formatted_markdown_entity.frontmatter,
            git_relative_path: file.git_relative_path
          })
        }
      } catch (error) {
        log(`Error parsing schema file ${file.git_relative_path}:`, error)
      }
    }

    // Apply type extensions
    log(`Applying ${type_extensions.length} type extensions`)
    for (const extension of type_extensions) {
      const base_type = extension.extends

      if (schema_map[base_type]) {
        const base_schema = schema_map[base_type]

        // Merge properties
        schema_map[base_type] = {
          ...base_schema,
          properties: {
            ...(base_schema.properties || {}),
            ...(extension.properties || {})
          },
          // Track extensions
          extensions: [
            ...(base_schema.extensions || []),
            {
              git_relative_path: extension.git_relative_path,
              name: extension.name
            }
          ]
        }
      } else {
        log(
          `Extension ${extension.name} references unknown base type ${base_type}`
        )
        console.warn(
          `Extension ${extension.name} references unknown base type ${base_type}`
        )
      }
    }

    log(`Loaded ${Object.keys(schema_map).length} schema definitions`)
    return schema_map
  } catch (error) {
    log('Error loading schema definitions:', error)
    return {}
  }
}

/**
 * Load schema definitions from markdown files using filesystem
 * @param {Object} params Configuration options
 * @param {Object} params.system_repository System repository config
 * @param {Object} params.user_repository User repository config
 * @returns {Promise<Object>} Map of schema definitions by type
 */
export async function load_schema_definitions_from_filesystem({
  system_repository,
  user_repository
} = {}) {
  // Validate input
  if (!system_repository) {
    throw new Error('system_repository is required')
  }

  if (!user_repository) {
    throw new Error('user_repository is required')
  }

  try {
    // Collect all schema files from filesystem
    log('Scanning filesystem for schema files')
    const all_files = await list_markdown_files_from_filesystem([
      system_repository,
      user_repository
    ])

    const schema_files = all_files.filter((file) => {
      return (
        (file.file_path.startsWith(SYSTEM_SCHEMA_GIT_RELATIVE_DIR) ||
          file.file_path.startsWith(USER_SCHEMA_GIT_RELATIVE_DIR)) &&
        file.file_path.endsWith('.md')
      )
    })

    log(`Found ${schema_files.length} schema files in filesystem`)

    // Process schema files
    const schema_map = {}
    const type_extensions = []

    for (const file of schema_files) {
      try {
        // Parse schema file from filesystem
        const formatted_markdown_entity =
          await process_markdown_schema_from_file({
            absolute_path: file.absolute_path
          })

        if (formatted_markdown_entity.frontmatter.type === 'type_definition') {
          schema_map[formatted_markdown_entity.frontmatter.name] = {
            ...formatted_markdown_entity.frontmatter,
            file_path: file.file_path,
            absolute_path: file.absolute_path
          }
        } else if (
          formatted_markdown_entity.frontmatter.type === 'type_extension'
        ) {
          // Store extensions for later processing
          type_extensions.push({
            ...formatted_markdown_entity.frontmatter,
            file_path: file.file_path,
            absolute_path: file.absolute_path
          })
        }
      } catch (error) {
        log(`Error parsing schema file ${file.absolute_path}:`, error)
      }
    }

    // Apply type extensions
    log(`Applying ${type_extensions.length} type extensions`)
    for (const extension of type_extensions) {
      const base_type = extension.extends

      if (schema_map[base_type]) {
        const base_schema = schema_map[base_type]

        // Merge properties
        schema_map[base_type] = {
          ...base_schema,
          properties: {
            ...(base_schema.properties || {}),
            ...(extension.properties || {})
          },
          // Track extensions
          extensions: [
            ...(base_schema.extensions || []),
            {
              file_path: extension.file_path,
              name: extension.name
            }
          ]
        }
      } else {
        log(
          `Extension ${extension.name} references unknown base type ${base_type}`
        )
        console.warn(
          `Extension ${extension.name} references unknown base type ${base_type}`
        )
      }
    }

    log(
      `Loaded ${Object.keys(schema_map).length} schema definitions from filesystem`
    )
    return schema_map
  } catch (error) {
    log('Error loading schema definitions from filesystem:', error)
    return {}
  }
}

/**
 * Build validation schema for a specific entity type
 * @param {String} entity_type Entity type to build schema for
 * @param {Object} schemas Loaded schema definitions
 * @returns {Object} Validation schema
 */
export function build_validation_schema(entity_type, schemas) {
  // Validate inputs
  if (!entity_type || typeof entity_type !== 'string') {
    throw new Error('entity_type must be a string')
  }

  if (!schemas || typeof schemas !== 'object') {
    throw new Error('schemas must be an object')
  }

  const schema = schemas[entity_type]

  if (!schema) {
    return null
  }

  // Handle properties that are in array format
  let properties = {}

  if (schema.properties) {
    if (Array.isArray(schema.properties)) {
      // Transform array of properties to object with property names as keys
      schema.properties.forEach((prop) => {
        if (prop && prop.name) {
          const property_schema = {
            type: prop.type
          }

          // Add additional constraints only if they exist
          if (prop.required !== undefined)
            property_schema.required = prop.required
          if (prop.optional !== undefined)
            property_schema.optional = prop.optional
          if (prop.items) property_schema.items = prop.items
          if (prop.enum) property_schema.enum = prop.enum
          if (prop.min !== undefined) property_schema.min = prop.min
          if (prop.max !== undefined) property_schema.max = prop.max
          if (prop.properties) property_schema.properties = prop.properties
          if (prop.description) property_schema.description = prop.description

          properties[prop.name] = property_schema
        }
      })
    } else {
      // Properties are already in object format
      properties = schema.properties
    }
  }

  // Special handling for the meta-schema (the type_definition that defines itself)
  const is_meta_schema_definition =
    entity_type === 'type_definition' && schema.type_name === 'type_definition'

  if (
    is_meta_schema_definition &&
    properties.properties &&
    properties.properties.items &&
    properties.properties.items.properties
  ) {
    // Make the nested property fields optional for the meta-schema
    const property_fields = properties.properties.items.properties

    // Remove required constraint from all fields in property items schema
    for (const field in property_fields) {
      if (property_fields[field]) {
        // Make the field optional by setting required to false explicitly
        property_fields[field].required = false
      }
    }
  }

  // Build validation schema according to fastest-validator spec
  const validation_schema = {
    $$strict: false, // Don't fail on unknown properties
    title: { type: 'string', min: 1 },
    type: { type: 'string', enum: [entity_type] },
    ...properties
  }

  return validation_schema
}
