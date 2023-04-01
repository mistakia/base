import React from 'react'
import { Map } from 'immutable'
import ImmutablePropTypes from 'react-immutable-proptypes'
import PropTypes from 'prop-types'
import { useParams } from 'react-router-dom'
// import Grid from '@mui/material/Grid'
import Container from '@mui/material/Container'

import CreateTask from '@components/create-task'

import './home.styl'

export default function HomePage({ load_user, users, load_user_tasks }) {
  const { username } = useParams()

  React.useEffect(() => {
    load_user({ username })
  }, [])

  const user = users.get(username, new Map())
  const not_found = user.get('is_loaded') && !user.get('user_id')

  const user_id = user.get('user_id')
  React.useEffect(() => {
    if (user_id) {
      load_user_tasks({ user_id })
    }
  }, [user_id])

  if (not_found) {
    return (
      <Container maxWidth='md' className='home__container'>
        <div>User [{username}] not found</div>
      </Container>
    )
  }

  return (
    <Container maxWidth='md' className='home__container'>
      <div>Username: {username}</div>
      <CreateTask />
    </Container>
  )
}

HomePage.propTypes = {
  load_user: PropTypes.func,
  users: ImmutablePropTypes.map,
  load_user_tasks: PropTypes.func
}
