import React from 'react'
import { List } from 'immutable'
import ImmutablePropTypes from 'react-immutable-proptypes'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

import './landing.styl'

export default function LandingPage({ users_list, is_loading, load_users }) {
  React.useEffect(() => {
    load_users()
  }, [load_users])

  const users = users_list || new List()

  return (
    <div className='landing-container'>
      <div className='landing-header'>
        <h1>Welcome to Base</h1>
        <p className='landing-description'>
          A Human-in-the-Loop System for knowledge base management and
          collaboration. Browse public profiles or sign in to get started.
        </p>
      </div>

      <div className='landing-actions'>
        <Link to='/auth' className='landing-action-primary'>
          Sign In / Sign Up
        </Link>
      </div>

      <div className='landing-section'>
        <h2>Public Profiles</h2>
        {is_loading ? (
          <div className='landing-loading'>Loading profiles...</div>
        ) : users.size > 0 ? (
          <div className='landing-users-grid'>
            {users.map((user) => {
              const username = user.username
              const user_id = user.user_id
              return (
                <Link
                  key={user_id}
                  to={`/${username}`}
                  className='landing-user-card'>
                  <div className='landing-user-name'>{username}</div>
                  <div className='landing-user-info'>View public profile →</div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className='landing-empty'>No profiles available yet.</div>
        )}
      </div>

      <div className='landing-footer'>
        <p>
          <Link to='/auth'>Create an account</Link> to start managing your own
          knowledge base.
        </p>
      </div>
    </div>
  )
}

LandingPage.propTypes = {
  users_list: ImmutablePropTypes.list,
  is_loading: PropTypes.bool,
  load_users: PropTypes.func
}
