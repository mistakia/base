import { createSelector } from 'reselect'
import { build_table_props } from '@core/utils/table-view-helpers.js'

export const get_physical_items_state = (state) => state.get('physical_items')

export function get_selected_physical_item_table_view_id(state) {
  return (
    get_physical_items_state(state).get(
      'selected_physical_item_table_view_id'
    ) || 'default'
  )
}

export function get_selected_physical_item_table_view(state) {
  const physical_items_state = get_physical_items_state(state)
  const view_id = get_selected_physical_item_table_view_id(state)
  const view_data = physical_items_state.getIn([
    'physical_item_table_views',
    view_id
  ])

  if (!view_data) return {}
  return {
    view_id,
    view_name: view_data.get('physical_item_view_name'),
    view_description: view_data.get('physical_item_view_description'),
    search: view_data.get('search') || null,
    view_filters: view_data.get('view_filters')?.toJS() || [],
    table_state: view_data.get('physical_item_table_state')?.toJS() || {},
    saved_table_state: view_data.get('saved_table_state')?.toJS() || null
  }
}

export function get_physical_item_table_views(state) {
  const physical_items_state = get_physical_items_state(state)
  const views_map = physical_items_state.get('physical_item_table_views')

  if (!views_map) return []
  return views_map
    .entrySeq()
    .map(([view_id, view]) => ({
      view_id,
      view_name: view.get('physical_item_view_name'),
      table_state: view.get('physical_item_table_state')?.toJS() || {},
      saved_table_state: view.get('saved_table_state')?.toJS() || {}
    }))
    .toArray()
}

function get_physical_item_all_columns_immutable(state) {
  return get_physical_items_state(state).get('physical_item_all_columns')
}

export const get_physical_item_all_columns = createSelector(
  [get_physical_item_all_columns_immutable],
  (all_columns_immutable) => {
    return all_columns_immutable?.toJS
      ? all_columns_immutable.toJS()
      : all_columns_immutable || {}
  }
)

export const get_physical_items_table_props = createSelector(
  [
    get_physical_items_state,
    get_selected_physical_item_table_view_id,
    get_physical_item_all_columns
  ],
  (physical_items_state, view_id, all_columns_memoized) => {
    return build_table_props({
      slice_state: physical_items_state,
      view_id,
      prefix: 'physical_item',
      all_columns_key: 'physical_item_all_columns',
      all_columns_memoized,
      data_transform: (rows) =>
        rows.map((item) => ({ ...item, id: item.entity_id }))
    })
  }
)

export const get_available_tags_for_physical_item_filter = createSelector(
  [get_physical_items_state],
  (physical_items_state) => {
    const available_tags = physical_items_state.get('available_tags')
    if (!available_tags) return []

    return available_tags
      .map((tag) => ({
        label: tag.title || tag.base_uri,
        value: tag.base_uri,
        color: tag.color || null
      }))
      .toArray()
  }
)
