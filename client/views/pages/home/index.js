import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_app } from '@core/app'

import HomePage from './home'

const mapStateToProps = createSelector(get_app, (app) => ({
  is_loaded: app.is_loaded
}))

export default connect(mapStateToProps)(HomePage)
