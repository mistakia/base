import React from 'react'
import PropTypes from 'prop-types'

import PageLayout from '@views/layout/PageLayout.js'
import PageHead from '@views/components/PageHead/index.js'

import './SettingsPage.styl'

const SettingsPage = ({ notification_sound_enabled, set_user_preference }) => {
  const handle_toggle = () => {
    set_user_preference({
      key: 'notification_sound_enabled',
      value: !notification_sound_enabled
    })
  }

  return (
    <>
      <PageHead title='Settings - Base' description='User preferences' />
      <PageLayout>
        <div className='settings-page'>
          <h1>Settings</h1>
          <section className='settings-page__section'>
            <h2>Notifications</h2>
            <div className='settings-page__row'>
              <label className='settings-page__label'>
                <input
                  type='checkbox'
                  checked={notification_sound_enabled}
                  onChange={handle_toggle}
                />
                <span>
                  Play sound when a session finishes working
                </span>
              </label>
            </div>
          </section>
        </div>
      </PageLayout>
    </>
  )
}

SettingsPage.propTypes = {
  notification_sound_enabled: PropTypes.bool.isRequired,
  set_user_preference: PropTypes.func.isRequired
}

export default SettingsPage
