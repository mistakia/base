import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import {
  get_task_stats_summary,
  get_task_completion_series,
  get_task_stats_is_loading
} from '@core/task-stats/selectors'
import { task_stats_actions } from '@core/task-stats/actions'

import TaskStats, { TaskStatusBar } from './TaskStats.js'

const map_state_to_props = createSelector(
  [get_task_completion_series, get_task_stats_is_loading],
  (completion_series, is_loading) => ({
    completion_series,
    is_loading
  })
)

const map_dispatch_to_props = {
  load_task_stats: task_stats_actions.load_task_stats
}

export default connect(map_state_to_props, map_dispatch_to_props)(TaskStats)

// Connected TaskStatusBar -- extracts open_by_status from summary
const status_bar_map_state = createSelector(
  [get_task_stats_summary],
  (summary) => ({
    by_status: summary ? summary.get('open_by_status')?.toJS() : null
  })
)

export const ConnectedTaskStatusBar = connect(status_bar_map_state)(
  TaskStatusBar
)
