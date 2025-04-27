import debug from 'debug'

const log = debug('markdown:entity_import:type_handlers')

/**
 * Handle generic entity type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 */
export async function handle_generic_entity_type(trx, entity_id, frontmatter) {
  // Generic entity type has no specific handling
  log('Generic entity type, no specific handling')
}

/**
 * Handle task type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 */
export async function handle_task_type(trx, entity_id, frontmatter) {
  // Handle task-specific fields
  const task_data = {
    entity_id,
    status: frontmatter.status || 'not_started',
    priority: frontmatter.priority || 'medium',
    due_date: frontmatter.due_date || null,
    assigned_to: frontmatter.assigned_to || null,
    completion_date: frontmatter.completion_date || null
  }

  // Upsert task data
  await trx('tasks').insert(task_data).onConflict('entity_id').merge()
}

/**
 * Handle person type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 */
export async function handle_person_type(trx, entity_id, frontmatter) {
  // Handle person-specific fields
  const person_data = {
    entity_id,
    email: frontmatter.email || null,
    phone: frontmatter.phone || null,
    role: frontmatter.role || null,
    organization: frontmatter.organization || null
  }

  // Upsert person data
  await trx('persons').insert(person_data).onConflict('entity_id').merge()
}

/**
 * Handle organization type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 */
export async function handle_organization_type(trx, entity_id, frontmatter) {
  // Handle organization-specific fields
  const organization_data = {
    entity_id,
    website: frontmatter.website || null,
    contact_email: frontmatter.contact_email || null,
    contact_phone: frontmatter.contact_phone || null,
    address: frontmatter.address || null
  }

  // Upsert organization data
  await trx('organizations')
    .insert(organization_data)
    .onConflict('entity_id')
    .merge()
}

/**
 * Handle physical item type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 */
export async function handle_physical_item_type(trx, entity_id, frontmatter) {
  // Handle physical item-specific fields
  const physical_item_data = {
    entity_id,
    location: frontmatter.location || null,
    serial_number: frontmatter.serial_number || null,
    purchase_date: frontmatter.purchase_date || null,
    warranty_info: frontmatter.warranty_info || null
  }

  // Upsert physical item data
  await trx('physical_items')
    .insert(physical_item_data)
    .onConflict('entity_id')
    .merge()
}

/**
 * Handle physical location type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 */
export async function handle_physical_location_type(
  trx,
  entity_id,
  frontmatter
) {
  // Handle physical location-specific fields
  const physical_location_data = {
    entity_id,
    address: frontmatter.address || null,
    coordinates: frontmatter.coordinates || null,
    hours: frontmatter.hours || null,
    contact_info: frontmatter.contact_info || null
  }

  // Upsert physical location data
  await trx('physical_locations')
    .insert(physical_location_data)
    .onConflict('entity_id')
    .merge()
}

/**
 * Handle digital item type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 */
export async function handle_digital_item_type(trx, entity_id, frontmatter) {
  // Handle digital item-specific fields
  const digital_item_data = {
    entity_id,
    url: frontmatter.url || null,
    access_info: frontmatter.access_info || null,
    version: frontmatter.version || null,
    created_date: frontmatter.created_date || null
  }

  // Upsert digital item data
  await trx('digital_items')
    .insert(digital_item_data)
    .onConflict('entity_id')
    .merge()
}

/**
 * Handle guideline type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 */
export async function handle_guideline_type(trx, entity_id, frontmatter) {
  // Handle guideline-specific fields
  const guideline_data = {
    entity_id,
    domain: frontmatter.domain || null,
    category: frontmatter.category || null,
    status: frontmatter.status || 'draft',
    version: frontmatter.version || '1.0'
  }

  // Upsert guideline data
  await trx('guidelines').insert(guideline_data).onConflict('entity_id').merge()
}

/**
 * Handle activity type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 */
export async function handle_activity_type(trx, entity_id, frontmatter) {
  // Handle activity-specific fields
  const activity_data = {
    entity_id,
    start_date: frontmatter.start_date || null,
    end_date: frontmatter.end_date || null,
    location: frontmatter.location || null,
    status: frontmatter.status || 'planned'
  }

  // Upsert activity data
  await trx('activities').insert(activity_data).onConflict('entity_id').merge()
}

/**
 * Handle tag type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 */
export async function handle_tag_type(trx, entity_id, frontmatter) {
  // Handle tag-specific fields
  const tag_data = {
    entity_id,
    color: frontmatter.color || null
  }

  // Upsert tag data
  await trx('tags').insert(tag_data).onConflict('entity_id').merge()
}

/**
 * Handle database type
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Frontmatter data
 * @param {String} type Specific database type
 */
export async function handle_database_type(trx, entity_id, frontmatter, type) {
  // Get the appropriate table based on type
  let table_name
  let data = { entity_id }

  switch (type) {
    case 'database':
      table_name = 'database_tables'
      data = {
        ...data,
        schema: frontmatter.schema || null,
        fields: JSON.stringify(frontmatter.fields || [])
      }
      break

    case 'database_item':
      table_name = 'database_table_items'
      data = {
        ...data,
        parent_table_id: frontmatter.parent_table_id || null,
        field_values: JSON.stringify(frontmatter.field_values || {})
      }
      break

    case 'database_view':
      table_name = 'database_table_views'
      data = {
        ...data,
        parent_table_id: frontmatter.parent_table_id || null,
        view_type: frontmatter.view_type || 'table',
        table_state: JSON.stringify(frontmatter.table_state || {})
      }
      break

    default:
      throw new Error(`Unknown database type: ${type}`)
  }

  // Upsert database data
  await trx(table_name).insert(data).onConflict('entity_id').merge()
}

export default {
  handle_generic_entity_type,
  handle_task_type,
  handle_person_type,
  handle_organization_type,
  handle_physical_item_type,
  handle_physical_location_type,
  handle_digital_item_type,
  handle_guideline_type,
  handle_activity_type,
  handle_tag_type,
  handle_database_type
}
