/**
 * Maps of base fields that are required according to the base schema
 */
const BASE_REQUIRED_FIELDS = ['title', 'type', 'user_public_key']

/**
 * Maps of base fields that are optional according to the base schema
 */
const BASE_OPTIONAL_FIELDS = [
  'permalink',
  'description',
  'tags',
  'relations',
  'observations',
  'archived_at'
]

/**
 * Maps of base fields that are auto-generated according to the base schema
 */
const BASE_AUTO_GENERATED_FIELDS = ['created_at', 'updated_at']

/**
 * Prepares base entity frontmatter fields based on the base schema
 *
 * @param {Object} options - Function options
 * @param {Object} options.entity_properties - The entity properties to prepare
 * @param {string} options.entity_type - The entity type
 * @returns {Object} - The prepared frontmatter object
 */
export function format_entity_properties_to_frontmatter({
  entity_properties,
  entity_type
}) {
  const now = new Date().toISOString()

  // Initialize frontmatter object
  const frontmatter = {}

  // Validate required base fields
  if (!entity_properties.title) {
    throw new Error('Entity title is required')
  }

  if (!entity_properties.entity_id) {
    throw new Error('Entity entity_id is required')
  }

  if (!entity_properties.user_public_key) {
    throw new Error('Entity user_public_key is required')
  }

  // Add required fields
  frontmatter.type = entity_type
  frontmatter.title = entity_properties.title
  frontmatter.user_public_key = entity_properties.user_public_key

  // Add auto-generated timestamp fields
  frontmatter.created_at = entity_properties.created_at || now
  // Preserve existing updated_at if provided (and not null), otherwise set to now
  // This allows callers to control when updated_at changes while ensuring schema compliance
  // Treat null the same as undefined since updated_at is required and auto-generated
  frontmatter.updated_at =
    entity_properties.updated_at != null ? entity_properties.updated_at : now

  // Add optional base fields if present
  if (entity_properties.permalink !== undefined) {
    frontmatter.permalink = entity_properties.permalink
  }

  if (entity_properties.description !== undefined) {
    frontmatter.description = entity_properties.description
  }

  if (entity_properties.tags && Array.isArray(entity_properties.tags)) {
    frontmatter.tags = entity_properties.tags
  }

  if (
    entity_properties.relations &&
    Array.isArray(entity_properties.relations)
  ) {
    // Strip leading "- " from relation strings to handle double-prefixed
    // YAML list markers (e.g. "- relates [[...]]" -> "relates [[...]]")
    frontmatter.relations = entity_properties.relations.map((rel) =>
      typeof rel === 'string' && rel.startsWith('- ')
        ? rel.slice(2)
        : rel
    )
  }

  if (
    entity_properties.observations &&
    Array.isArray(entity_properties.observations)
  ) {
    frontmatter.observations = entity_properties.observations
  }

  if (entity_properties.archived_at !== undefined) {
    frontmatter.archived_at = entity_properties.archived_at
  }

  // Add all other custom fields from the entity_properties
  // This allows the function to support extended types like task.md
  Object.entries(entity_properties).forEach(([key, value]) => {
    // Skip fields we've already processed
    const all_base_fields = [
      ...BASE_REQUIRED_FIELDS,
      ...BASE_OPTIONAL_FIELDS,
      ...BASE_AUTO_GENERATED_FIELDS
    ]

    if (
      !all_base_fields.includes(key) &&
      value !== undefined &&
      value !== null
    ) {
      frontmatter[key] = value
    }
  })

  return frontmatter
}
