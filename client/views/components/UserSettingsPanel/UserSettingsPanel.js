import React from 'react'
import PropTypes from 'prop-types'

import Toggle from '@components/primitives/Toggle/Toggle'
import { format_public_key } from '@views/utils/format-public-key'

import './UserSettingsPanel.styl'

const UserSettingsPanel = ({
  is_open,
  notification_sound_enabled,
  set_user_preference,
  close_user_settings,
  clear_auth,
  current_user,
  user_public_key
}) => {
  const handle_set_notification_sound = (next_value) => {
    set_user_preference({
      key: 'notification_sound_enabled',
      value: next_value
    })
  }

  const handle_sign_out = () => {
    close_user_settings()
    clear_auth()
  }

  const container_class = `user-settings-panel__container${is_open ? ' user-settings-panel__container--open' : ''}`

  return (
    <>
      {is_open && (
        <div
          className='user-settings-panel__backdrop'
          onClick={close_user_settings}
        />
      )}
      <div className={container_class}>
        <div className='user-settings-panel__panel'>
          <div className='user-settings-panel__header'>
            <span className='user-settings-panel__title'>SETTINGS</span>
            <button
              className='user-settings-panel__close'
              onClick={close_user_settings}>
              [x]
            </button>
          </div>

          <div className='user-settings-panel__content'>
            <div className='user-settings-panel__section'>
              <div className='user-settings-panel__section-title'>
                Notifications
              </div>
              <div className='user-settings-panel__row'>
                <Toggle
                  checked={notification_sound_enabled}
                  on_change={handle_set_notification_sound}
                  label='Play sound when a session finishes working'
                  id='notification-sound-toggle'
                />
              </div>
            </div>

            <div className='user-settings-panel__section'>
              <div className='user-settings-panel__section-title'>Account</div>
              {current_user && (
                <div className='user-settings-panel__row'>
                  <span className='user-settings-panel__label'>Username</span>
                  <span className='user-settings-panel__value'>
                    {current_user.username}
                  </span>
                </div>
              )}
              {user_public_key && (
                <div className='user-settings-panel__row'>
                  <span className='user-settings-panel__label'>Public Key</span>
                  <span className='user-settings-panel__value'>
                    {format_public_key(user_public_key)}
                  </span>
                </div>
              )}
            </div>

            <div className='user-settings-panel__section'>
              <button
                className='user-settings-panel__sign-out'
                onClick={handle_sign_out}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

UserSettingsPanel.propTypes = {
  is_open: PropTypes.bool.isRequired,
  notification_sound_enabled: PropTypes.bool.isRequired,
  set_user_preference: PropTypes.func.isRequired,
  close_user_settings: PropTypes.func.isRequired,
  clear_auth: PropTypes.func.isRequired,
  current_user: PropTypes.object,
  user_public_key: PropTypes.string
}

export default UserSettingsPanel
