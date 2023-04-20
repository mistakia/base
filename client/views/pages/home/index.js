import { connect } from 'react-redux'
import { createSelector } from 'reselect'
import { List, Map } from 'immutable'

import { user_actions, get_users } from '@core/users'
import { app_actions } from '@core/app'
import {
  get_selected_path_view,
  get_selected_path_views,
  path_view_actions
} from '@core/path-views'
import { folder_path_actions } from '@core/folder-paths'
import {
  database_table_actions,
  get_selected_path_database_table_items
} from '@core/database-tables'

import HomePage from './home'

const mapStateToProps = createSelector(
  get_users,
  get_selected_path_view,
  get_selected_path_views,
  get_selected_path_database_table_items,
  (users, selected_path_view, selected_path_views, database_table_items) => ({
    users,
    selected_path_view: selected_path_view.toJS(),
    selected_path_views: selected_path_views.toList().toJS(),
    table_state: selected_path_view.get('table_state', new Map()).toJS(),
    database_table_items: database_table_items.toJS(),
    all_columns: selected_path_view.get('all_columns', new List()).toJS()
  })
)

const mapDispatchToProps = {
  load_user: user_actions.load,
  load_database: database_table_actions.load_database,
  load_folder_path: folder_path_actions.load_folder_path,
  set_database_view_table_state:
    path_view_actions.set_database_view_table_state,
  set_selected_path: app_actions.set_selected_path
}

export default connect(mapStateToProps, mapDispatchToProps)(HomePage)
