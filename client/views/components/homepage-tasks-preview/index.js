import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_tasks, task_actions } from '@core/tasks'
import {
  filter_displayable_tasks,
  sort_tasks_by_importance
} from '#libs-shared/task-filters.mjs'

import HomePageTasksPreview from './homepage-tasks-preview'

const mapStateToProps = createSelector(get_tasks, (tasks) => {
  const tasks_list = tasks.toList().toJS()
  const filtered_tasks = filter_displayable_tasks(tasks_list)
  const sorted_tasks = sort_tasks_by_importance(filtered_tasks)
  return { tasks: sorted_tasks }
})

const mapDispatchToProps = {
  load_tasks: task_actions.load_user_tasks
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(HomePageTasksPreview)
