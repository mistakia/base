import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_app } from '@core/app'

import Menu from './menu'

const map_state_to_props = createSelector(get_app, (app) => ({
  username: app.username
}))

export default connect(map_state_to_props)(Menu)
