/**
 * View URL Utilities
 *
 * Functions for converting between internal view IDs (snake_case) and URL slugs (kebab-case)
 */

// Default view IDs for each entity type
export const DEFAULT_TASK_VIEW_ID = 'open'
export const DEFAULT_THREAD_VIEW_ID = 'active'

// Valid view IDs for each entity type
const VALID_TASK_VIEW_IDS = ['default', 'open', 'active', 'upcoming']
const VALID_THREAD_VIEW_IDS = [
  'default',
  'active',
  'last_48_hours',
  'last_7_days'
]

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

/**
 * Check if a view_id is a valid task view
 * @param {string} view_id - Internal view ID to validate
 * @returns {boolean} True if valid
 */
export function is_valid_task_view_id(view_id) {
  return VALID_TASK_VIEW_IDS.includes(view_id)
}

/**
 * Check if a view_id is a valid thread view
 * @param {string} view_id - Internal view ID to validate
 * @returns {boolean} True if valid
 */
export function is_valid_thread_view_id(view_id) {
  return VALID_THREAD_VIEW_IDS.includes(view_id)
}
