/**
 * Server-side table request processing for physical items
 */

import debug from 'debug'
import { list_physical_items_from_filesystem } from './list-physical-items-from-filesystem.mjs'
import { process_generic_table_request } from '#libs-server/table-processing/process-table-request.mjs'
import { TABLE_DATA_TYPES } from 'react-table/src/constants.mjs'
import { check_permissions_batch } from '#server/middleware/permission/index.mjs'
import { redact_entity_object } from '#server/middleware/content-redactor.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  query_physical_items_from_entities,
  count_physical_items_from_entities
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'

const log = debug('physical-items:table')

// Custom sort order maps for SELECT fields
const IMPORTANCE_ORDER = {
  Core: 3,
  Standard: 2,
  Premium: 1,
  Potential: 0
}

const FREQUENCY_ORDER = {
  Daily: 2,
  Weekly: 1,
  Infrequent: 0
}

const CONFIG = {
  column_types: {
    created_at: TABLE_DATA_TYPES.DATE,
    updated_at: TABLE_DATA_TYPES.DATE,
    weight_ounces: TABLE_DATA_TYPES.NUMBER,
    wattage: TABLE_DATA_TYPES.NUMBER,
    voltage: TABLE_DATA_TYPES.NUMBER,
    outlets_used: TABLE_DATA_TYPES.NUMBER,
    current_quantity: TABLE_DATA_TYPES.NUMBER,
    target_quantity: TABLE_DATA_TYPES.NUMBER
  },

  redaction: {
    preserved_keys: ['type', 'entity_type', 'category'],
    redacted_keys: ['title', 'description', 'user_public_key']
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
    misc_notes: item.misc_notes || null,

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
 * Extract display labels from relation strings for physical item table columns.
 */
function extract_relation_display_fields(relations) {
  const fields = {
    home_area: null,
    current_location: null,
    home_activity: null
  }

  if (!Array.isArray(relations)) return fields

  for (const rel of relations) {
    if (typeof rel !== 'string') continue

    if (!fields.home_area && rel.startsWith('target_area ')) {
      fields.home_area = extract_label_from_relation(rel)
    } else if (
      !fields.current_location &&
      rel.startsWith('current_location ')
    ) {
      fields.current_location = extract_label_from_relation(rel)
    } else if (!fields.home_activity && rel.startsWith('used_in ')) {
      fields.home_activity = extract_label_from_relation(rel)
    }
  }

  return fields
}

function extract_label_from_relation(rel_string) {
  const match = rel_string.match(/\[\[([^\]]+)\]\]/)
  if (!match) return null

  const uri = match[1]
  const filename = uri.split('/').pop()?.replace(/\.md$/, '') || ''
  return filename
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Process physical item entity for table display
 */
function process_physical_item_for_table(entity_file) {
  const { entity_properties, is_redacted, can_write } = entity_file
  const absolute_path =
    entity_file.absolute_path || entity_file.file_info?.absolute_path

  const relation_fields = extract_relation_display_fields(
    entity_properties.relations
  )

  return {
    ...entity_properties,
    ...relation_fields,
    absolute_path,
    is_redacted: is_redacted || false,
    can_write: can_write !== false
  }
}

/**
 * Custom get_value function for physical item table that handles
 * importance and frequency_of_use sorting
 */
function get_physical_item_value_for_sorting(item, column_id) {
  const value = item[column_id]

  if (column_id === 'importance') {
    return IMPORTANCE_ORDER[value] ?? 99
  }

  if (column_id === 'frequency_of_use') {
    return FREQUENCY_ORDER[value] ?? 99
  }

  return value
}

/**
 * Process physical item table request using DuckDB index
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

  const items = await query_physical_items_from_entities({
    filters,
    sort,
    limit,
    offset
  })

  const total_count = await count_physical_items_from_entities({
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
      source: 'duckdb_index'
    }
  }
}

/**
 * Process physical item table request using filesystem (fallback)
 */
async function process_physical_item_table_request_filesystem({
  table_state,
  requesting_user_public_key
}) {
  const all_items = await list_physical_items_from_filesystem()

  // Batch permission check
  const resource_paths = all_items
    .map((item) => item.entity_properties?.base_uri)
    .filter(Boolean)

  const permissions_by_path = await check_permissions_batch({
    user_public_key: requesting_user_public_key,
    resource_paths
  })

  const items_with_permissions = all_items.map((item) => {
    const base_uri = item.entity_properties?.base_uri
    const permission = base_uri ? permissions_by_path[base_uri] : null

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

  const result = await process_generic_table_request({
    data: items_with_permissions,
    table_state,
    extract_metadata: process_physical_item_for_table,
    get_value: get_physical_item_value_for_sorting,
    default_sort: CONFIG.table.default_sort,
    column_types: CONFIG.column_types
  })

  return {
    rows: result.data,
    total_row_count: result.total_count,
    metadata: {
      fetched: result.data.length,
      has_more: result.has_more,
      limit: result.limit,
      offset: result.offset,
      processing_time_ms: result.processing_time_ms,
      table_state: table_state || {},
      source: 'filesystem'
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

  try {
    if (embedded_index_manager.is_duckdb_ready()) {
      log('Using DuckDB index for physical item query')
      try {
        return await process_physical_item_table_request_indexed({
          table_state,
          requesting_user_public_key
        })
      } catch (index_error) {
        log(
          'DuckDB index query failed, falling back to filesystem: %s',
          index_error.message
        )
      }
    }

    log('Using filesystem for physical item query')
    return await process_physical_item_table_request_filesystem({
      table_state,
      requesting_user_public_key
    })
  } catch (error) {
    log(`Error processing physical item table request: ${error.message}`)
    throw error
  }
}

export default process_physical_item_table_request
