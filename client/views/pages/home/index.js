import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { user_actions, get_users } from '@core/users'
import { get_app } from '@core/app'
import { task_actions } from '@core/tasks'
import { get_selected_path_view, path_view_actions } from '@core/path-views'
import { folder_path_actions } from '@core/folder-paths'

import HomePage from './home'

const mapStateToProps = createSelector(
  get_users,
  get_app,
  get_selected_path_view,
  (users, app, selected_path_view) => ({
    users,
    selected_path_view,
    selected_path: app.get('selected_path')
  })
)

const mapDispatchToProps = {
  load_user: user_actions.load,
  load_user_tasks: task_actions.load_user_tasks,
  load_folder_path: folder_path_actions.load_folder_path,
  set_database_view_table_state: path_view_actions.set_database_view_table_state
}

export default connect(mapStateToProps, mapDispatchToProps)(HomePage)
