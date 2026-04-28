/**
 * Server-side table request processing for physical items
 */

import debug from 'debug'
import { check_permissions_batch } from '#server/middleware/permission/index.mjs'
import { redact_entity_object } from '#server/middleware/content-redactor.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

const log = debug('physical-items:table')

const CONFIG = {
  redaction: {
    preserved_keys: ['type', 'entity_type', 'category'],
    redacted_keys: [
      'title',
      'description',
      'user_public_key',
      'amazon_order_id',
      'amazon_asin',
      'home_area',
      'current_location',
      'home_activity'
    ]
  },

  defaults: {
    title: 'Untitled',
    description: '',
    category: ''
  },

  table: {
    default_sort: { column_id: 'updated_at', desc: true }
  }
}

/**
 * Normalize physical item for table API response
 */
function normalize_physical_item_for_table_response(item, defaults) {
  return {
    entity_id: item.entity_id,
    base_uri: item.base_uri,
    title: item.title || defaults.title,
    description: item.description || defaults.description,
    category: item.category || defaults.category,
    created_at: item.created_at,
    updated_at: item.updated_at,
    user_public_key: item.user_public_key,

    // Physical item properties
    importance: item.importance,
    frequency_of_use: item.frequency_of_use,
    exist: item.exist,
    consumable: item.consumable,
    perishable: item.perishable,
    weight_ounces: item.weight_ounces,
    wattage: item.wattage,
    voltage: item.voltage,
    outlets_used: item.outlets_used,
    current_quantity: item.current_quantity,
    target_quantity: item.target_quantity,
    ethernet_connected: item.ethernet_connected,
    water_connection: item.water_connection,
    amazon_order_id: item.amazon_order_id || null,
    amazon_asin: item.amazon_asin || null,

    // Relation-derived display fields
    home_area: item.home_area || null,
    current_location: item.current_location || null,
    home_activity: item.home_activity || null,

    // Metadata
    tags: item.tags || [],
    relations: item.relations || [],

    absolute_path: null,
    content_preview: ''
  }
}

/**
 * Process physical item table request using SQLite index
 */
async function process_physical_item_table_request_indexed({
  table_state,
  requesting_user_public_key
}) {
  const start_time = Date.now()

  const filters = table_state?.where || []
  const sort =
    table_state?.sort?.length > 0
      ? table_state.sort
      : [CONFIG.table.default_sort]
  const limit = table_state?.limit || 1000
  const offset = table_state?.offset || 0

  const items = await embedded_index_manager.query_physical_items({
    filters,
    sort,
    limit,
    offset
  })

  const total_count = await embedded_index_manager.count_physical_items({
    filters
  })

  const normalized_items = items.map((item) =>
    normalize_physical_item_for_table_response(item, CONFIG.defaults)
  )

  const resource_paths = normalized_items
    .map((item) => item.base_uri)
    .filter(Boolean)

  const permissions_by_path = await check_permissions_batch({
    user_public_key: requesting_user_public_key,
    resource_paths
  })

  const redacted_items = normalized_items.map((item) => {
    const permission = permissions_by_path[item.base_uri]

    if (permission?.read?.allowed) {
      return {
        ...item,
        is_redacted: false,
        can_write: permission?.write?.allowed || false
      }
    }

    const redacted = redact_entity_object(item, {
      preserve_keys: CONFIG.redaction.preserved_keys,
      redact_keys: CONFIG.redaction.redacted_keys
    })
    return { ...redacted, can_write: false }
  })

  const processing_time_ms = Date.now() - start_time

  return {
    rows: redacted_items,
    total_row_count: total_count,
    metadata: {
      fetched: redacted_items.length,
      has_more: offset + redacted_items.length < total_count,
      limit,
      offset,
      processing_time_ms,
      table_state: table_state || {},
      source: 'sqlite_index'
    }
  }
}

/**
 * Process table request with server-side filtering, sorting, and pagination
 */
export async function process_physical_item_table_request({
  table_state,
  requesting_user_public_key
}) {
  log('Processing physical item table request', {
    table_state,
    requesting_user_public_key
  })

  return process_physical_item_table_request_indexed({
    table_state,
    requesting_user_public_key
  })
}

export default process_physical_item_table_request
