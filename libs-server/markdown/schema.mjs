import scanner from './scanner.mjs'
import parser from './parser.mjs'
import debug from 'debug'

const log = debug('markdown:schema')

/**
 * Load schema definitions from markdown files
 * @param {Object} options Configuration options
 * @returns {Object} Map of schema definitions by type
 */
export async function load_schema_definitions({
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

  const schema_path = 'schema'

  try {
    // Collect all schema files from repositories
    log(`Scanning repositories for schema files in '${schema_path}' directory`)
    const all_files = await scanner.scan_repositories([
      system_repository,
      user_repository
    ])
    const schema_files = all_files.filter((file) => {
      return (
        file.file_path.startsWith(schema_path) && file.file_path.endsWith('.md')
      )
    })

    log(`Found ${schema_files.length} schema files`)

    // Process schema files
    const schema_map = {}
    const type_extensions = []

    for (const file of schema_files) {
      try {
        // Parse schema file
        const parsed = await parser.parse_schema_file(file)

        if (parsed.frontmatter.type === 'type_definition') {
          schema_map[parsed.frontmatter.name] = {
            ...parsed.frontmatter,
            source_file: file.file_path
          }
        } else if (parsed.frontmatter.type === 'type_extension') {
          // Store extensions for later processing
          type_extensions.push({
            ...parsed.frontmatter,
            source_file: file.file_path
          })
        }
      } catch (error) {
        log(`Error parsing schema file ${file.file_path}:`, error)
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
              source_file: extension.source_file,
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

export default {
  load_schema_definitions,
  build_validation_schema
}
