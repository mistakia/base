import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { user_actions, get_users } from '@core/users'
import { app_actions } from '@core/app'

import HomePage from './home'

const mapStateToProps = createSelector(get_users, (users) => ({
  users
}))

const mapDispatchToProps = {
  load_user: user_actions.load,
  set_selected_path: app_actions.set_selected_path
}

export default connect(mapStateToProps, mapDispatchToProps)(HomePage)
