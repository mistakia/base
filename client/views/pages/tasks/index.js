import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_tasks, task_actions } from '@core/tasks'

import TasksPage from './tasks'

const mapStateToProps = createSelector(get_tasks, (tasks) => ({
  tasks: tasks.toList().toJS()
}))

const mapDispatchToProps = {
  load_tasks: task_actions.load_user_tasks
}

export default connect(mapStateToProps, mapDispatchToProps)(TasksPage)
