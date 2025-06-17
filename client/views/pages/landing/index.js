import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { user_actions, get_users_list, get_users_loading } from '@core/users'

import LandingPage from './landing'

const map_state_to_props = createSelector(
  get_users_list,
  get_users_loading,
  (users_list, is_loading) => ({
    users_list,
    is_loading
  })
)

const map_dispatch_to_props = {
  load_users: user_actions.load_users
}

export default connect(map_state_to_props, map_dispatch_to_props)(LandingPage)
