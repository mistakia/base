import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_tasks, task_actions } from '@core/tasks'

import TaskDetailPage from './task-detail-page'

const map_state_to_props = createSelector(get_tasks, (tasks) => ({
  tasks
}))

const map_dispatch_to_props = {
  load_task: task_actions.load_task
}

export default connect(
  map_state_to_props,
  map_dispatch_to_props
)(TaskDetailPage)
