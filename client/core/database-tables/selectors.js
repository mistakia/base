import { List } from 'immutable'
import { get_app } from '@core/app'

export function get_selected_path_database_table_items(state) {
  const { selected_path } = get_app(state)
  const { database_table_name } = selected_path
  return state.getIn(
    ['database_table_items', database_table_name, 'items'],
    new List()
  )
}

export function get_selected_path_database_table_columns(state) {
  const { selected_path } = get_app(state)
  const { database_table_name } = selected_path
  return state.getIn(
    ['database_table_items', database_table_name, 'columns'],
    new List()
  )
}
