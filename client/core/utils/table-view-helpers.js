// Shared helpers for building react-table props from slice state

export const build_table_props = ({
  slice_state,
  view_id,
  prefix,
  all_columns_key,
  data_transform,
  all_columns_memoized // Optional: pre-memoized all_columns to avoid reference instability
}) => {
  const views_key = `${prefix}_table_views`
  const table_state_key = `${prefix}_table_state`
  const saved_table_state_key = 'saved_table_state'
  const results_key = `${prefix}_table_results`
  const total_row_count_key = `${prefix}_total_row_count`
  const total_rows_fetched_key = `${prefix}_total_rows_fetched`
  const is_fetching_key = `${prefix}_is_fetching`
  const is_fetching_more_key = `${prefix}_is_fetching_more`
  const error_key = `${prefix}_table_error`

  const selected_view = slice_state.getIn([views_key, view_id])
  if (!selected_view) {
    return {
      data: [],
      table_state: {},
      saved_table_state: {},
      all_columns: {},
      total_row_count: 0,
      total_rows_fetched: 0,
      is_fetching: false,
      is_fetching_more: false,
      can_fetch_more: false,
      table_error: null,
      has_data: false,
      is_loading: false,
      view_id
    }
  }

  const table_results = selected_view.get(results_key)
  const table_state = selected_view.get(table_state_key)
  const saved_state = selected_view.get(saved_table_state_key)
  const total_row_count = selected_view.get(total_row_count_key) || 0
  const total_rows_fetched = selected_view.get(total_rows_fetched_key) || 0
  const is_fetching = selected_view.get(is_fetching_key) || false
  const is_fetching_more = selected_view.get(is_fetching_more_key) || false
  const table_error = selected_view.get(error_key) || null

  const table_state_js = table_state?.toJS
    ? table_state.toJS()
    : table_state || {}
  const saved_table_state_js = saved_state?.toJS
    ? saved_state.toJS()
    : saved_state || {}

  // Use pre-memoized all_columns if provided to avoid reference instability
  // Otherwise fall back to converting from Immutable (creates new reference each time)
  let all_columns_js
  if (all_columns_memoized !== undefined) {
    all_columns_js = all_columns_memoized
  } else {
    const all_columns = slice_state.get(all_columns_key)
    all_columns_js = all_columns?.toJS ? all_columns.toJS() : all_columns || {}
  }
  const rows_js = table_results?.toJS
    ? table_results.toJS()
    : table_results || []

  const transformed_rows =
    typeof data_transform === 'function' ? data_transform(rows_js) : rows_js

  return {
    data: transformed_rows,
    table_state: table_state_js,
    saved_table_state: saved_table_state_js,
    all_columns: all_columns_js,
    total_row_count,
    total_rows_fetched,
    is_fetching,
    is_fetching_more,
    can_fetch_more: total_rows_fetched < total_row_count,
    table_error,
    has_data: transformed_rows.length > 0,
    is_loading: is_fetching && transformed_rows.length === 0,
    view_id
  }
}
