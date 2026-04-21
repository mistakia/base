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
  (search_state) => search_state?.get('results') || EMPTY_LIST
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
  (search_state) => search_state?.get('recent_files') || EMPTY_LIST
)

export const get_recent_files_loading = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('recent_files_loading') || false
)

export const get_recent_files_loaded = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('recent_files_loaded') || false
)

export const get_chips = createSelector(
  [get_search_state],
  (search_state) => search_state?.get('chips') || new List()
)

function collect_chip_values(chips, key) {
  return chips
    .filter((c) => c.key === key)
    .map((c) => c.value)
    .toArray()
}

export const get_active_types = createSelector([get_chips], (chips) =>
  collect_chip_values(chips, 'type')
)

export const get_active_tags = createSelector([get_chips], (chips) =>
  collect_chip_values(chips, 'tag')
)

export const get_active_statuses = createSelector([get_chips], (chips) =>
  collect_chip_values(chips, 'status')
)

export const get_active_sources = createSelector([get_chips], (chips) =>
  collect_chip_values(chips, 'source')
)

export const get_active_path = createSelector([get_chips], (chips) => {
  const chip = chips.find((c) => c.key === 'path')
  return chip ? chip.value : null
})

// Flat results list — results already carry `type`, `title`, `matches`.
export const get_all_results_flat = get_search_results
