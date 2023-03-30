import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_app, app_actions } from '@core/app'

import AuthPage from './auth'

const mapDispatchToProps = {
  load_from_new_keypair: app_actions.load_from_new_keypair,
  load_from_private_key: app_actions.load_from_private_key
}

const mapStateToProps = createSelector(get_app, (app) => ({
  private_key: app.private_key
}))

export default connect(mapStateToProps, mapDispatchToProps)(AuthPage)
