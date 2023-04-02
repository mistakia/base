import { Map } from 'immutable'
import { get_app } from '@core/app'

export function get_selected_path_view(state) {
  const { selected_path_view_id } = get_app(state)
  return state.getIn(['path_views', selected_path_view_id], new Map())
}
