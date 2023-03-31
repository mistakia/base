import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { user_actions, get_users } from '@core/users'
import { task_actions } from '@core/tasks'

import HomePage from './home'

const mapStateToProps = createSelector(get_users, (users) => ({
  users
}))

const mapDispatchToProps = {
  load_user: user_actions.load,
  load_user_tasks: task_actions.load_user_tasks
}

export default connect(mapStateToProps, mapDispatchToProps)(HomePage)
