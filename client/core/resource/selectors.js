import { createSelector } from 'reselect'

export const get_resource_state = (state) => state.get('resource')

export const get_resource_by_uri = createSelector(
  [get_resource_state, (_, base_uri) => base_uri],
  (resource_state, base_uri) => resource_state.getIn(['resources', base_uri])
)

export const get_resource_content = createSelector(
  [get_resource_state, (_, base_uri) => base_uri],
  (resource_state, base_uri) => {
    const resource = resource_state.getIn(['resources', base_uri])
    return resource ? resource.toJS() : null
  }
)

export const get_resources_by_type = createSelector(
  [get_resource_state, (_, type) => type],
  (resource_state, type) => {
    return resource_state
      .get('resources')
      .filter((resource) => resource.get('type') === type)
      .toList()
  }
)

export const get_expanded_directories = createSelector(
  get_resource_state,
  (resource_state) => resource_state.get('expanded_directories')
)

export const is_directory_expanded = createSelector(
  [get_expanded_directories, (_, base_uri) => base_uri],
  (expanded_directories, base_uri) => expanded_directories.has(base_uri)
)

export const get_resources_loading = createSelector(
  get_resource_state,
  (resource_state) => resource_state.get('loading')
)

export const get_resources_error = createSelector(
  get_resource_state,
  (resource_state) => resource_state.get('error')
)
