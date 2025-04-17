import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_tasks, task_actions } from '@core/tasks'

import TasksListPage from './tasks-page'

const map_state_to_props = createSelector(get_tasks, (tasks) => ({
  tasks: tasks.toList().toJS()
}))

const map_dispatch_to_props = {
  load_tasks: task_actions.load_user_tasks
}

export default connect(map_state_to_props, map_dispatch_to_props)(TasksListPage)
