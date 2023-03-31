import React from 'react'
import { Map } from 'immutable'
import ImmutablePropTypes from 'react-immutable-proptypes'
import PropTypes from 'prop-types'
import { useParams } from 'react-router-dom'
// import Grid from '@mui/material/Grid'
import Container from '@mui/material/Container'

import './home.styl'

export default function HomePage({ is_loaded, load_user, users }) {
  const { username } = useParams()

  React.useEffect(() => {
    load_user({ username })
  }, [])

  const user = users.get(username, new Map())
  const not_found = user.get('is_loaded') && !user.get('user_id')

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
    </Container>
  )
}

HomePage.propTypes = {
  is_loaded: PropTypes.bool,
  load_user: PropTypes.func,
  users: ImmutablePropTypes.map
}
