import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { app_actions, get_notification_sound_enabled } from '@core/app/index.js'

import SettingsPage from './SettingsPage.js'

const map_state_to_props = createSelector(
  [get_notification_sound_enabled],
  (notification_sound_enabled) => ({
    notification_sound_enabled
  })
)

const map_dispatch_to_props = {
  set_user_preference: app_actions.set_user_preference
}

export default connect(map_state_to_props, map_dispatch_to_props)(SettingsPage)
