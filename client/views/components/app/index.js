import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_app, app_actions } from '@core/app'

import App from './app'

const mapStateToProps = createSelector(get_app, (app) => ({
  is_loaded: app.is_loaded
}))

const mapDispatchToProps = {
  load: app_actions.load
}

export default connect(mapStateToProps, mapDispatchToProps)(App)
