export function get_task_stats_state(state) {
  return state.get('task_stats')
}

export function get_task_stats_summary(state) {
  return get_task_stats_state(state).get('summary')
}

export function get_task_stats_by_tag(state) {
  return get_task_stats_state(state).get('by_tag')
}

export function get_task_completion_series(state) {
  return get_task_stats_state(state).get('completion_series')
}

export function get_task_stats_is_loading(state) {
  return get_task_stats_state(state).get('is_loading')
}
