import { createSelector } from 'reselect'
import { List } from 'immutable'

const EMPTY_LIST = new List()

export const get_search_state = (state) => state.get('search')

export const get_is_command_palette_open = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('is_open') || false
)

export const get_search_query = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('query') || ''
)

export const get_search_results = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('results')
)

export const get_is_search_loading = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('is_loading') || false
)

export const get_search_error = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('error')
)

export const get_selected_index = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('selected_index') || 0
)

export const get_search_total = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('total') || 0
)

export const get_recent_files = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('recent_files') || new List()
)

export const get_recent_files_loading = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('recent_files_loading') || false
)

export const get_recent_files_loaded = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('recent_files_loaded') || false
)

export const get_search_mode = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('search_mode') || 'default'
)

export const get_stripped_query = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('stripped_query') || ''
)

export const get_content_results = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('content_results') || EMPTY_LIST
)

export const get_semantic_results = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('semantic_results') || EMPTY_LIST
)

export const get_semantic_available = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('semantic_available') !== false
)

// Get all results flattened into a single list for keyboard navigation
// Mode-aware: returns appropriate results based on active search mode
export const get_all_results_flat = createSelector(
  [get_search_results, get_search_mode, get_content_results, get_semantic_results],
  (results, search_mode, content_results, semantic_results) => {
    if (search_mode === 'content') {
      return content_results.map((item) => ({ ...item, category: 'content' }))
    }

    if (search_mode === 'semantic') {
      return semantic_results.map((item) => ({ ...item, category: 'semantic' }))
    }

    if (!results) return EMPTY_LIST

    // Helper to add category to items from a list
    const add_category = (list, category) =>
      list && list.size > 0
        ? list.toArray().map((item) => ({ ...item, category }))
        : []

    // Combine results in display order
    const categorized = [
      ...add_category(results.get('entities'), 'entity'),
      ...add_category(results.get('threads'), 'thread'),
      ...add_category(results.get('directories'), 'directory'),
      ...add_category(results.get('files'), 'file')
    ]

    return new List(categorized)
  }
)
