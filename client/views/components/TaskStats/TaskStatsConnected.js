import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import {
  get_task_stats_summary,
  get_task_completion_series,
  get_task_stats_is_loading
} from '@core/task-stats/selectors'
import { task_stats_actions } from '@core/task-stats/actions'
import { get_app } from '@core/app/selectors'

import TaskStats from './TaskStats.js'

const map_state_to_props = createSelector(
  [
    get_task_stats_summary,
    get_task_completion_series,
    get_task_stats_is_loading,
    get_app
  ],
  (summary, completion_series, is_loading, app) => ({
    summary,
    completion_series,
    is_loading,
    is_public: !app.get('user_token')
  })
)

const map_dispatch_to_props = {
  load_task_stats: task_stats_actions.load_task_stats
}

export default connect(map_state_to_props, map_dispatch_to_props)(TaskStats)
