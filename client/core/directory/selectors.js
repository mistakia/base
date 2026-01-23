import { createSelector } from 'reselect'

export function get_directory_state(state) {
  return state.get('directory')
}

export const get_directory_items = createSelector(
  [get_directory_state],
  (directory_state) => directory_state.get('directory_items')?.toJS() || []
)

export const get_current_file_path = createSelector(
  [get_directory_state],
  (directory_state) => directory_state.get('current_path') || ''
)
