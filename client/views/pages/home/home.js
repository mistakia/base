import React from 'react'
import { Map } from 'immutable'
import ImmutablePropTypes from 'react-immutable-proptypes'
import PropTypes from 'prop-types'
import { useParams } from 'react-router-dom'

import CreateTask from '@components/create-task'

import './home.styl'

export default function HomePage({ load_user, users, set_selected_path }) {
  const { username } = useParams()

  React.useEffect(() => {
    load_user({ username })
  }, [])

  React.useEffect(() => {
    set_selected_path({ username })
  }, [username])

  const user = users.get(username, new Map())
  const user_id = user.get('user_id')
  React.useEffect(() => {
    if (user_id) {
      set_selected_path({
        user_id,
        username
      })
    }
  }, [user_id])

  const not_found = user.get('is_loaded') && !user.get('user_id')
  if (not_found) {
    return (
      <div className='home-container'>
        <div>User [{username}] not found</div>
      </div>
    )
  }

  return (
    <div className='home-container'>
      <CreateTask />
    </div>
  )
}

HomePage.propTypes = {
  load_user: PropTypes.func,
  users: ImmutablePropTypes.map,
  set_selected_path: PropTypes.func
}
