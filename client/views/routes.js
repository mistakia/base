import React from 'react'
import { connect } from 'react-redux'
import { createSelector } from 'reselect'
import PropTypes from 'prop-types'
import { Routes as RouterRoutes, Route, Navigate } from 'react-router-dom'

import { get_app } from '@core/app'
import HomePage from '@pages/home'
import AuthPage from '@pages/auth'

const map_state_to_props = createSelector(get_app, (app) => ({
  public_key: app.public_key,
  username: app.username
}))

const Routes = ({ public_key, username }) => {
  if (!public_key) {
    return (
      <RouterRoutes>
        <Route path='/auth' element={<AuthPage />} />
        <Route path='*' element={<Navigate to='/auth' replace={true} />} />
      </RouterRoutes>
    )
  }

  return (
    <RouterRoutes>
      <Route path='/auth' element={<AuthPage />} />
      <Route path='/:username' element={<HomePage />} />
      <Route
        path='*'
        element={<Navigate to={`/${username}`} replace={true} />}
      />
    </RouterRoutes>
  )
}

Routes.propTypes = {
  is_loaded: PropTypes.bool,
  public_key: PropTypes.string,
  username: PropTypes.string
}

export default connect(map_state_to_props)(Routes)
