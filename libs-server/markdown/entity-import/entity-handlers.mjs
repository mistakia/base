import debug from 'debug'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'

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
    status: frontmatter.status || TASK_STATUS.NO_STATUS,
    priority: frontmatter.priority || TASK_PRIORITY.MEDIUM,
    assigned_to: frontmatter.assigned_to || null,
    start_by: frontmatter.start_by || null,
    finish_by: frontmatter.finish_by || null,
    estimated_total_duration: frontmatter.estimated_total_duration || null,
    estimated_preparation_duration:
      frontmatter.estimated_preparation_duration || null,
    estimated_execution_duration:
      frontmatter.estimated_execution_duration || null,
    estimated_cleanup_duration: frontmatter.estimated_cleanup_duration || null,
    actual_duration: frontmatter.actual_duration || null,
    planned_start: frontmatter.planned_start || null,
    planned_finish: frontmatter.planned_finish || null,
    started_at: frontmatter.started_at || null,
    finished_at: frontmatter.finished_at || null,
    snooze_until: frontmatter.snooze_until || null
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
    first_name: frontmatter.first_name || '',
    last_name: frontmatter.last_name || '',
    email: frontmatter.email || null,
    mobile_phone: frontmatter.mobile_phone || null,
    website_url: frontmatter.website_url || null
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
    website_url: frontmatter.website_url || null
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
    serial_number: frontmatter.serial_number || null,
    model_number: frontmatter.model_number || null,
    manufacturer: frontmatter.manufacturer || null,
    storage_location: frontmatter.storage_location || null,
    acquisition_date: frontmatter.acquisition_date || null,
    target_location: frontmatter.target_location || null,
    current_location: frontmatter.current_location || null,
    home_areas: Array.isArray(frontmatter.home_areas)
      ? frontmatter.home_areas
      : null,
    home_attribute: Array.isArray(frontmatter.home_attribute)
      ? frontmatter.home_attribute
      : null,
    activities: Array.isArray(frontmatter.activities)
      ? frontmatter.activities
      : null,
    importance: frontmatter.importance || null,
    frequency_of_use: frontmatter.frequency_of_use || null,
    height_inches: frontmatter.height_inches || null,
    width_inches: frontmatter.width_inches || null,
    depth_inches: frontmatter.depth_inches || null,
    weight_ounces: frontmatter.weight_ounces || null,
    volume_cubic_inches: frontmatter.volume_cubic_inches || null,
    voltage: frontmatter.voltage || null,
    wattage: frontmatter.wattage || null,
    outlets_used: frontmatter.outlets_used || null,
    water_connection: frontmatter.water_connection || null,
    drain_connection: frontmatter.drain_connection || null,
    ethernet_connected: frontmatter.ethernet_connected || null,
    min_storage_temperature_celsius:
      frontmatter.min_storage_temperature_celsius || null,
    max_storage_temperature_celsius:
      frontmatter.max_storage_temperature_celsius || null,
    min_storage_humidity_percent:
      frontmatter.min_storage_humidity_percent || null,
    max_storage_humidity_percent:
      frontmatter.max_storage_humidity_percent || null,
    exist: frontmatter.exist,
    current_quantity: frontmatter.current_quantity || null,
    target_quantity: frontmatter.target_quantity || null,
    consumable: frontmatter.consumable,
    perishable: frontmatter.perishable,
    kit_name: frontmatter.kit_name || null,
    kit_items: Array.isArray(frontmatter.kit_items)
      ? frontmatter.kit_items
      : null,
    large_drawer_units: frontmatter.large_drawer_units || null,
    standard_drawer_units: frontmatter.standard_drawer_units || null,
    storage_notes: frontmatter.storage_notes || null,
    misc_notes: frontmatter.misc_notes || null
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
    latitude: frontmatter.latitude || null,
    longitude: frontmatter.longitude || null,
    mail_address: frontmatter.mail_address || null,
    mail_address2: frontmatter.mail_address2 || null,
    mail_careof: frontmatter.mail_careof || null,
    mail_street_number: frontmatter.mail_street_number || null,
    mail_street_prefix: frontmatter.mail_street_prefix || null,
    mail_street_name: frontmatter.mail_street_name || null,
    mail_street_type: frontmatter.mail_street_type || null,
    mail_street_suffix: frontmatter.mail_street_suffix || null,
    mail_unit_number: frontmatter.mail_unit_number || null,
    mail_city: frontmatter.mail_city || null,
    mail_state: frontmatter.mail_state || null,
    mail_zip: frontmatter.mail_zip || null,
    mail_country: frontmatter.mail_country || null,
    mail_urbanization: frontmatter.mail_urbanization || null
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
    file_mime_type: frontmatter.file_mime_type || null,
    file_uri: frontmatter.file_uri || null,
    file_size: frontmatter.file_size || null,
    file_cid: frontmatter.file_cid || null,
    text: frontmatter.text || null,
    html: frontmatter.html || null
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
    guideline_status: frontmatter.guideline_status || null,
    effective_date: frontmatter.effective_date || null
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
    entity_id
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
