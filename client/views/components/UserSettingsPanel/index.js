import { connect } from 'react-redux'

import { app_actions } from '@core/app/actions'
import {
  get_app,
  get_user_settings_open,
  get_notification_sound_enabled
} from '@core/app/selectors'

import UserSettingsPanel from './UserSettingsPanel'

const mapStateToProps = (state) => {
  const app = get_app(state)
  return {
    is_open: get_user_settings_open(state),
    notification_sound_enabled: get_notification_sound_enabled(state),
    current_user: app.get('current_user'),
    user_public_key: app.get('user_public_key')
  }
}

const mapDispatchToProps = {
  close_user_settings: app_actions.close_user_settings,
  set_user_preference: app_actions.set_user_preference,
  clear_auth: app_actions.clear_auth
}

export default connect(mapStateToProps, mapDispatchToProps)(UserSettingsPanel)
