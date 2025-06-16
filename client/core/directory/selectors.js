import { createSelector } from 'reselect'

export const get_directories_state = (state) => state.get('directory')

export const get_directory_state = createSelector(
  [get_directories_state, (state, type, path) => ({ type, path })],
  (directories_state, { type, path }) => {
    const cache_key = `${type}:${path || ''}`
    return directories_state.getIn(['directories_state', cache_key])
  }
)

export const get_expanded_directories = createSelector(
  [get_directories_state],
  (directories_state) => directories_state.get('expanded_directories')
)

export const get_file_content_state = createSelector(
  [get_directories_state],
  (directories_state) => directories_state.get('file_content_state')
)

export const get_directories_for_type = createSelector(
  [get_directories_state, (state, type) => type],
  (directories_state, type) => {
    const cache_key = `${type}:`
    return directories_state.getIn(['directories_state', cache_key])
  }
)

export const is_directory_expanded = createSelector(
  [get_expanded_directories, (state, type, path) => ({ type, path })],
  (expanded_directories, { type, path }) => {
    const cache_key = `${type}:${path}`
    return expanded_directories.has(cache_key)
  }
)
