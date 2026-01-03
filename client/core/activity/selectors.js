export function get_activity_state(state) {
  return state.get('activity')
}

export function get_activity_heatmap_data(state) {
  return get_activity_state(state).get('heatmap_data')
}

export function get_activity_max_score(state) {
  return get_activity_state(state).get('max_score')
}
