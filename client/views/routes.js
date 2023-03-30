import React from 'react'
import { connect } from 'react-redux'
import { createSelector } from 'reselect'
import PropTypes from 'prop-types'
import { Routes as RouterRoutes, Route, Navigate } from 'react-router-dom'

import { get_app } from '@core/app'
import HomePage from '@pages/home'
import AuthPage from '@pages/auth'

const map_state_to_props = createSelector(get_app, (app) => ({
  public_key: app.public_key
}))

const Routes = ({ public_key }) => {
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
      <Route path='/home' element={<HomePage />} />
      <Route path='*' element={<Navigate to='/home' replace={true} />} />
    </RouterRoutes>
  )
}

Routes.propTypes = {
  is_loaded: PropTypes.bool,
  public_key: PropTypes.string
}

export default connect(map_state_to_props)(Routes)
