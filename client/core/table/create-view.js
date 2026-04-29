import { List, Map } from 'immutable'

export const create_view = ({
  entity_prefix,
  view_id,
  view_name,
  table_state
}) => {
  return new Map({
    [`${entity_prefix}_view_id`]: view_id,
    [`${entity_prefix}_view_name`]: view_name,
    [`${entity_prefix}_table_state`]: table_state,
    saved_table_state: table_state,
    [`${entity_prefix}_table_results`]: new List(),
    [`${entity_prefix}_row_highlights`]: {},
    [`${entity_prefix}_total_row_count`]: 0,
    [`${entity_prefix}_total_rows_fetched`]: 0,
    [`${entity_prefix}_is_fetching`]: false,
    [`${entity_prefix}_is_fetching_more`]: false,
    [`${entity_prefix}_table_error`]: null
  })
}
