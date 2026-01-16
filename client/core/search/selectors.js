import { createSelector } from 'reselect'
import { List } from 'immutable'

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

// Get all results flattened into a single list for keyboard navigation
// Order: entities, threads, directories, files
export const get_all_results_flat = createSelector(
  [get_search_results],
  (results) => {
    if (!results) return new List()

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
