import { List, Map } from 'immutable'

export const update_view_on_config_change = ({
  view,
  entity_prefix,
  view_id,
  view_name,
  table_state
}) => {
  const updates = {
    [`${entity_prefix}_view_id`]: view_id,
    [`${entity_prefix}_view_name`]:
      view_name || view.get(`${entity_prefix}_view_name`),
    [`${entity_prefix}_table_state`]: new Map(table_state || {}),
    [`${entity_prefix}_table_results`]: new List()
  }

  if (!view.has('saved_table_state') && table_state) {
    updates.saved_table_state = new Map(table_state)
  }

  return view.merge(updates)
}

export const on_table_pending = ({ view, entity_prefix, is_append }) => {
  return view.merge({
    [`${entity_prefix}_is_fetching`]: !is_append,
    [`${entity_prefix}_is_fetching_more`]: !!is_append,
    [`${entity_prefix}_table_error`]: null
  })
}

export const on_table_fulfilled = ({
  view,
  entity_prefix,
  rows,
  is_append,
  total_row_count
}) => {
  const current_results = view.get(`${entity_prefix}_table_results`)
  const next_results = is_append
    ? current_results.concat(List(rows))
    : List(rows)

  return view.merge({
    [`${entity_prefix}_table_results`]: next_results,
    [`${entity_prefix}_total_row_count`]:
      typeof total_row_count === 'number' ? total_row_count : 0,
    [`${entity_prefix}_total_rows_fetched`]: is_append
      ? view.get(`${entity_prefix}_total_rows_fetched`) + rows.length
      : rows.length,
    [`${entity_prefix}_is_fetching`]: false,
    [`${entity_prefix}_is_fetching_more`]: false,
    [`${entity_prefix}_table_error`]: null
  })
}

export const on_table_failed = ({ view, entity_prefix, error }) => {
  return view.merge({
    [`${entity_prefix}_is_fetching`]: false,
    [`${entity_prefix}_is_fetching_more`]: false,
    [`${entity_prefix}_table_error`]: error
  })
}
