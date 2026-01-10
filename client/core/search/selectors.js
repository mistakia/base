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
export const get_all_results_flat = createSelector(
  [get_search_results],
  (results) => {
    if (!results) return new List()

    const files = results.get('files') || new List()
    const threads = results.get('threads') || new List()
    const entities = results.get('entities') || new List()

    // Add category markers for display
    const categorized = []

    if (entities.size > 0) {
      categorized.push(
        ...entities.toArray().map((item) => ({ ...item, category: 'entity' }))
      )
    }

    if (threads.size > 0) {
      categorized.push(
        ...threads.toArray().map((item) => ({ ...item, category: 'thread' }))
      )
    }

    if (files.size > 0) {
      categorized.push(
        ...files.toArray().map((item) => ({ ...item, category: 'file' }))
      )
    }

    return new List(categorized)
  }
)
