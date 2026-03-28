/**
 * View URL Utilities
 *
 * Functions for converting between internal view IDs (snake_case) and URL slugs (kebab-case),
 * known view ID validation, and URL table state parsing/building.
 */

// Default view IDs for each entity type
export const DEFAULT_TASK_VIEW_ID = 'open'
export const DEFAULT_THREAD_VIEW_ID = 'active'
export const DEFAULT_PHYSICAL_ITEM_VIEW_ID = 'default'

// Known view IDs for disambiguation (splat route parsing).
// These must stay in sync with the view definitions in:
//   - client/core/tasks/reducers.js (task_table_views)
//   - client/core/threads/reducers.js (thread_table_views)
export const KNOWN_TASK_VIEW_IDS = new Set([
  'default',
  'open',
  'active',
  'finished',
  'upcoming'
])
export const KNOWN_THREAD_VIEW_IDS = new Set([
  'default',
  'active',
  'last_48_hours',
  'last_7_days'
])
export const KNOWN_PHYSICAL_ITEM_VIEW_IDS = new Set([
  'default',
  'inventory',
  'purchase',
  'home',
  'overlander',
  'vehicle',
  'investment_property'
])

/**
 * Convert internal view_id (snake_case) to URL slug (kebab-case)
 * @param {string} view_id - Internal view ID
 * @returns {string} URL slug
 */
export function view_id_to_slug(view_id) {
  if (!view_id) return ''
  return view_id.replace(/_/g, '-')
}

/**
 * Convert URL slug (kebab-case) to internal view_id (snake_case)
 * @param {string} slug - URL slug
 * @returns {string} Internal view ID
 */
export function slug_to_view_id(slug) {
  if (!slug) return ''
  return slug.replace(/-/g, '_')
}

const ALLOWED_FILTER_OPERATORS = new Set([
  'IN',
  'NOT IN',
  'EQ',
  'NEQ',
  'LT',
  'GT',
  'LTE',
  'GTE',
  'CONTAINS'
])

function is_valid_filter(f) {
  return (
    f !== null &&
    typeof f === 'object' &&
    typeof f.column_id === 'string' &&
    f.column_id.length > 0 &&
    ALLOWED_FILTER_OPERATORS.has(f.operator) &&
    Array.isArray(f.value)
  )
}

function is_valid_sort_entry(s) {
  return (
    s !== null &&
    typeof s === 'object' &&
    typeof s.column_id === 'string' &&
    s.column_id.length > 0
  )
}

/**
 * Parse URL table state from search params.
 * Extracts `where`, `sort`, and `tag` params and returns unified filters and sort.
 *
 * @param {URLSearchParams} search_params
 * @returns {{ url_filters: Array, url_sort: Array|null }}
 */
export function parse_url_table_state(search_params) {
  const url_filters = []
  let url_sort = null

  // Parse tag shorthand (converted to a where filter)
  const tag = search_params.get('tag')
  if (tag) {
    url_filters.push({
      column_id: 'tags',
      operator: 'IN',
      value: [tag]
    })
  }

  // Parse where filters (JSON-encoded array)
  const where_param = search_params.get('where')
  if (where_param) {
    try {
      const where_filters = JSON.parse(where_param)
      if (Array.isArray(where_filters)) {
        url_filters.push(...where_filters.filter(is_valid_filter))
      }
    } catch {
      // ignore malformed where param
    }
  }

  // Parse sort (JSON-encoded array)
  const sort_param = search_params.get('sort')
  if (sort_param) {
    try {
      const sort_value = JSON.parse(sort_param)
      if (Array.isArray(sort_value)) {
        const valid_sort = sort_value.filter(is_valid_sort_entry)
        if (valid_sort.length > 0) {
          url_sort = valid_sort
        }
      }
    } catch {
      // ignore malformed sort param
    }
  }

  return { url_filters, url_sort }
}

/**
 * Build a data view URL with optional table state params.
 *
 * @param {object} params
 * @param {string} params.base_path - e.g. '/task' or '/thread'
 * @param {string} [params.view_id] - view ID (will be converted to slug)
 * @param {Array} [params.where] - filter objects
 * @param {Array} [params.sort] - sort objects
 * @param {string} [params.tag] - tag shorthand
 * @returns {string} URL path with query params
 */
export function build_data_view_url({ base_path, view_id, where, sort, tag }) {
  const slug = view_id ? view_id_to_slug(view_id) : ''
  const path = slug ? `${base_path}/${slug}` : base_path

  const params = new URLSearchParams()
  if (tag) {
    params.set('tag', tag)
  }
  if (where && where.length > 0) {
    params.set('where', JSON.stringify(where))
  }
  if (sort && sort.length > 0) {
    params.set('sort', JSON.stringify(sort))
  }

  const query = params.toString()
  return query ? `${path}?${query}` : path
}
