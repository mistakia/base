import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_app } from '@core/app'
import { user_actions, get_users } from '@core/users'

import HomePage from './home'

const mapStateToProps = createSelector(get_app, get_users, (app, users) => ({
  is_loaded: app.is_loaded,
  users
}))

const mapDispatchToProps = {
  load_user: user_actions.load
}

export default connect(mapStateToProps, mapDispatchToProps)(HomePage)
