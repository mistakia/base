import React from 'react'
import { Map } from 'immutable'
import ImmutablePropTypes from 'react-immutable-proptypes'
import PropTypes from 'prop-types'
import { useParams } from 'react-router-dom'

import HomePageTasksPreview from '@components/homepage-tasks-preview'

import './user-root.styl'

export default function UserRootPage({
  load_user,
  users,
  set_selected_path,
  current_user_id,
  current_username,
  public_key
}) {
  const { username } = useParams()

  React.useEffect(() => {
    load_user({ username })
  }, [username, load_user])

  React.useEffect(() => {
    set_selected_path({ username })
  }, [username, set_selected_path])

  const user = users.get(username, new Map())
  const user_id = user.get('user_id')

  React.useEffect(() => {
    if (user_id) {
      set_selected_path({
        user_id,
        username
      })
    }
  }, [user_id, username, set_selected_path])

  // Check if this is the authenticated user viewing their own profile
  const is_own_profile = public_key && current_username === username

  // Check if user exists
  const not_found = user.get('is_loaded') && !user.get('user_id')
  if (not_found) {
    return (
      <div className='user-root-container'>
        <div className='user-root-not-found'>
          <h2>User not found</h2>
          <p>
            The user [{username}] does not exist or their profile is not public.
          </p>
        </div>
      </div>
    )
  }

  // If authenticated user is viewing their own profile, show full dashboard
  if (is_own_profile) {
    return (
      <div className='user-root-container user-root-authenticated'>
        <div className='user-root-header'>
          <h1>Welcome back, {username}</h1>
        </div>
        <HomePageTasksPreview />
      </div>
    )
  }

  // Public profile view
  const is_loading = !user.get('is_loaded')
  if (is_loading) {
    return (
      <div className='user-root-container'>
        <div className='user-root-loading'>Loading profile...</div>
      </div>
    )
  }

  return (
    <div className='user-root-container user-root-public'>
      <div className='user-root-header'>
        <h1>{username}&rsquo;s Profile</h1>
        <div className='user-root-public-notice'>
          This is a public profile view.
          {!public_key && (
            <span>
              {' '}
              <a href='/auth'>Sign in</a> to access more features.
            </span>
          )}
        </div>
      </div>

      <div className='user-root-public-content'>
        <div className='user-root-section'>
          <h2>Public Information</h2>
          <p>This user has chosen to make their profile publicly accessible.</p>
        </div>

        <div className='user-root-section'>
          <p>
            Public task and content views would be displayed here in a future
            update.
          </p>
        </div>
      </div>
    </div>
  )
}

UserRootPage.propTypes = {
  load_user: PropTypes.func,
  users: ImmutablePropTypes.map,
  set_selected_path: PropTypes.func,
  current_user_id: PropTypes.string,
  current_username: PropTypes.string,
  public_key: PropTypes.string
}
