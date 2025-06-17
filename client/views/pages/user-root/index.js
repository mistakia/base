import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { user_actions, get_users } from '@core/users'
import { get_app, app_actions } from '@core/app'

import UserRootPage from './user-root'

const map_state_to_props = createSelector(get_users, get_app, (users, app) => ({
  users,
  current_user_id: app.user_id,
  current_username: app.username,
  public_key: app.public_key
}))

const map_dispatch_to_props = {
  load_user: user_actions.load,
  set_selected_path: app_actions.set_selected_path
}

export default connect(map_state_to_props, map_dispatch_to_props)(UserRootPage)
