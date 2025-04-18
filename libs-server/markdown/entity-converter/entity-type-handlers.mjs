import debug from 'debug'
import { entity_registry } from './index.mjs'

const log = debug('markdown:entity_converter:type_handlers')

/**
 * Generic handler for entity type-specific data
 *
 * @param {Object} params Handler parameters
 * @param {Object} params.trx Database transaction
 * @param {String} params.entity_id Entity ID
 * @param {Object} params.frontmatter Entity frontmatter
 * @param {String} params.entity_type Entity type for registry lookup
 * @param {String} [params.table_name] Optional override for table name
 * @param {Function} [params.data_extractor] Optional function to extract data from frontmatter
 */
export async function handle_generic_entity_type({
  trx,
  entity_id,
  frontmatter,
  entity_type,
  table_name = null,
  data_extractor = null
}) {
  // Get table name from registry if not provided explicitly
  const actual_table =
    table_name ||
    (entity_registry[entity_type] ? entity_registry[entity_type].table : null)

  if (!actual_table) {
    log(`No table name found for entity type: ${entity_type}`)
    return
  }

  // Prepare entity data
  const entity_data = {
    entity_id,
    ...(typeof data_extractor === 'function' ? data_extractor(frontmatter) : {})
  }

  // Check if entity record already exists
  const existing_entity = await trx(actual_table).where({ entity_id }).first()

  if (existing_entity) {
    await trx(actual_table).where({ entity_id }).update(entity_data)
  } else {
    await trx(actual_table).insert(entity_data)
  }
}

/**
 * Handle task-specific data
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Entity frontmatter
 */
export async function handle_task_type(trx, entity_id, frontmatter) {
  await handle_generic_entity_type({
    trx,
    entity_id,
    frontmatter,
    entity_type: 'task',
    data_extractor: (fm) => ({
      status: fm.status || 'No status',
      priority: fm.priority || null,
      assigned_to: fm.assigned_to || null,
      start_by: fm.start_by || null,
      finish_by: fm.finish_by || null,
      estimated_total_duration: fm.estimated_total_duration || null,
      estimated_preparation_duration: fm.estimated_preparation_duration || null,
      estimated_execution_duration: fm.estimated_execution_duration || null,
      estimated_cleanup_duration: fm.estimated_cleanup_duration || null,
      actual_duration: fm.actual_duration || null,
      planned_start: fm.planned_start || null,
      planned_finish: fm.planned_finish || null,
      started_at: fm.started_at || null,
      finished_at: fm.finished_at || null,
      snooze_until: fm.snooze_until || null
    })
  })
}

/**
 * Handle person-specific data
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Entity frontmatter
 */
export async function handle_person_type(trx, entity_id, frontmatter) {
  await handle_generic_entity_type({
    trx,
    entity_id,
    frontmatter,
    entity_type: 'person',
    data_extractor: (fm) => ({
      first_name: fm.first_name || '',
      last_name: fm.last_name || '',
      email: fm.email || null,
      mobile_phone: fm.mobile_phone || null,
      website_url: fm.website_url || null
    })
  })
}

/**
 * Handle organization-specific data
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Entity frontmatter
 */
export async function handle_organization_type(trx, entity_id, frontmatter) {
  await handle_generic_entity_type({
    trx,
    entity_id,
    frontmatter,
    entity_type: 'organization',
    data_extractor: (fm) => ({
      website_url: fm.website_url || null
    })
  })
}

/**
 * Handle physical_item-specific data
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Entity frontmatter
 */
export async function handle_physical_item_type(trx, entity_id, frontmatter) {
  await handle_generic_entity_type({
    trx,
    entity_id,
    frontmatter,
    entity_type: 'physical_item',
    data_extractor: (fm) => ({
      serial_number: fm.serial_number || null,
      model_number: fm.model_number || null,
      manufacturer: fm.manufacturer || null,
      storage_location: fm.storage_location || null,
      acquisition_date: fm.acquisition_date || null,
      target_location: fm.target_location || null,
      current_location: fm.current_location || null,
      home_areas: Array.isArray(fm.home_areas) ? fm.home_areas : null,
      home_attribute: Array.isArray(fm.home_attribute)
        ? fm.home_attribute
        : null,
      activities: Array.isArray(fm.activities) ? fm.activities : null,
      importance: fm.importance || null,
      frequency_of_use: fm.frequency_of_use || null,
      height_inches: fm.height_inches || null,
      width_inches: fm.width_inches || null,
      depth_inches: fm.depth_inches || null,
      weight_ounces: fm.weight_ounces || null,
      volume_cubic_inches: fm.volume_cubic_inches || null,
      voltage: fm.voltage || null,
      wattage: fm.wattage || null,
      outlets_used: fm.outlets_used || null,
      water_connection: fm.water_connection || null,
      drain_connection: fm.drain_connection || null,
      ethernet_connected: fm.ethernet_connected || null,
      min_storage_temperature_celsius:
        fm.min_storage_temperature_celsius || null,
      max_storage_temperature_celsius:
        fm.max_storage_temperature_celsius || null,
      min_storage_humidity_percent: fm.min_storage_humidity_percent || null,
      max_storage_humidity_percent: fm.max_storage_humidity_percent || null,
      exist: fm.exist,
      current_quantity: fm.current_quantity || null,
      target_quantity: fm.target_quantity || null,
      consumable: fm.consumable,
      perishable: fm.perishable,
      kit_name: fm.kit_name || null,
      kit_items: Array.isArray(fm.kit_items) ? fm.kit_items : null,
      large_drawer_units: fm.large_drawer_units || null,
      standard_drawer_units: fm.standard_drawer_units || null,
      storage_notes: fm.storage_notes || null,
      misc_notes: fm.misc_notes || null
    })
  })
}

/**
 * Handle physical_location-specific data
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Entity frontmatter
 */
export async function handle_physical_location_type(
  trx,
  entity_id,
  frontmatter
) {
  await handle_generic_entity_type({
    trx,
    entity_id,
    frontmatter,
    entity_type: 'physical_location',
    data_extractor: (fm) => ({
      latitude: fm.latitude || null,
      longitude: fm.longitude || null,
      mail_address: fm.mail_address || null,
      mail_address2: fm.mail_address2 || null,
      mail_careof: fm.mail_careof || null,
      mail_street_number: fm.mail_street_number || null,
      mail_street_prefix: fm.mail_street_prefix || null,
      mail_street_name: fm.mail_street_name || null,
      mail_street_type: fm.mail_street_type || null,
      mail_street_suffix: fm.mail_street_suffix || null,
      mail_unit_number: fm.mail_unit_number || null,
      mail_city: fm.mail_city || null,
      mail_state: fm.mail_state || null,
      mail_zip: fm.mail_zip || null,
      mail_country: fm.mail_country || null,
      mail_urbanization: fm.mail_urbanization || null
    })
  })
}

/**
 * Handle digital_item-specific data
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Entity frontmatter
 */
export async function handle_digital_item_type(trx, entity_id, frontmatter) {
  await handle_generic_entity_type({
    trx,
    entity_id,
    frontmatter,
    entity_type: 'digital_item',
    data_extractor: (fm) => ({
      file_mime_type: fm.file_mime_type || null,
      file_uri: fm.file_uri || null,
      file_size: fm.file_size || null,
      file_cid: fm.file_cid || null,
      text: fm.text || null,
      html: fm.html || null
    })
  })
}

/**
 * Handle guideline-specific data
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Entity frontmatter
 */
export async function handle_guideline_type(trx, entity_id, frontmatter) {
  await handle_generic_entity_type({
    trx,
    entity_id,
    frontmatter,
    entity_type: 'guideline',
    data_extractor: (fm) => ({
      guideline_status: fm.guideline_status || null,
      effective_date: fm.effective_date || null
    })
  })
}

/**
 * Handle activity-specific data
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Entity frontmatter
 */
export async function handle_activity_type(trx, entity_id, frontmatter) {
  await handle_generic_entity_type({
    trx,
    entity_id,
    frontmatter,
    entity_type: 'activity',
    data_extractor: () => ({})
  })
}

/**
 * Handle tag-specific data
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Entity frontmatter
 */
export async function handle_tag_type(trx, entity_id, frontmatter) {
  await handle_generic_entity_type({
    trx,
    entity_id,
    frontmatter,
    entity_type: 'tag',
    data_extractor: (fm) => ({
      color: fm.color || null
    })
  })
}

/**
 * Helper for stringifying JSON fields
 * @param {Object} data Object with fields that may need stringification
 * @param {Array} json_fields Array of field names to stringify
 * @returns {Object} Object with stringified JSON fields
 */
function stringify_json_fields(data, json_fields) {
  const result = { ...data }

  json_fields.forEach((field) => {
    if (result[field] && typeof result[field] === 'object') {
      result[field] = JSON.stringify(result[field])
    }
  })

  return result
}

/**
 * Handle database-related entity types
 * @param {Object} trx Database transaction
 * @param {String} entity_id Entity ID
 * @param {Object} frontmatter Entity frontmatter
 * @param {String} type Specific database type (database, database_item, database_view)
 */
export async function handle_database_type(trx, entity_id, frontmatter, type) {
  if (type === 'database') {
    await handle_generic_entity_type({
      trx,
      entity_id,
      frontmatter,
      entity_type: 'database',
      data_extractor: (fm) =>
        stringify_json_fields(
          {
            table_name: fm.table_name || '',
            table_description: fm.table_description || null,
            fields: fm.fields || {}
          },
          ['fields']
        )
    })
  } else if (type === 'database_item') {
    await handle_generic_entity_type({
      trx,
      entity_id,
      frontmatter,
      entity_type: 'database_item',
      data_extractor: (fm) =>
        stringify_json_fields(
          {
            database_table_id: fm.database_table_id || null,
            field_values: fm.field_values || {}
          },
          ['field_values']
        )
    })
  } else if (type === 'database_view') {
    await handle_generic_entity_type({
      trx,
      entity_id,
      frontmatter,
      entity_type: 'database_view',
      data_extractor: (fm) =>
        stringify_json_fields(
          {
            view_name: fm.view_name || '',
            view_description: fm.view_description || null,
            database_table_name: fm.database_table_name || '',
            database_table_entity_id: fm.database_table_entity_id || null,
            table_state: fm.table_state || {}
          },
          ['table_state']
        )
    })
  }
}
