import React from 'react'
import { connect } from 'react-redux'
import { createSelector } from 'reselect'
import PropTypes from 'prop-types'
import { Routes as RouterRoutes, Route, Navigate } from 'react-router-dom'

import { get_app } from '@core/app'
import { RESERVED_ROOT_ROUTES } from '@core/constants'
import LandingPage from '@pages/landing'
import UserRootPage from '@pages/user-root'
import AuthPage from '@pages/auth'
import { TasksPage, TaskDetailPage } from '@pages/tasks'
import { ThreadsPage, ThreadDetailPage } from '@pages/thread'
import ResourcePage from '@pages/resource'

const map_state_to_props = createSelector(get_app, (app) => ({
  public_key: app.public_key,
  username: app.username
}))

// Component to handle authenticated user redirect from landing page
const AuthenticatedRedirect = ({ username }) => {
  return <Navigate to={`/${username}`} replace={true} />
}

AuthenticatedRedirect.propTypes = {
  username: PropTypes.string.isRequired
}

const Routes = ({ public_key, username }) => {
  return (
    <RouterRoutes>
      {/* Auth route - always accessible */}
      <Route path={`/${RESERVED_ROOT_ROUTES.AUTH}`} element={<AuthPage />} />

      {/* Landing page or authenticated redirect for root path */}
      <Route
        path='/'
        element={
          public_key && username ? (
            <AuthenticatedRedirect username={username} />
          ) : (
            <LandingPage />
          )
        }
      />

      {/* Authenticated-only routes */}
      {public_key && (
        <>
          {/* Tasks routes */}
          <Route
            path={`/${RESERVED_ROOT_ROUTES.TASKS}`}
            element={<TasksPage />}
          />
          <Route
            path={`/${RESERVED_ROOT_ROUTES.TASKS}/:task_id`}
            element={<TaskDetailPage />}
          />

          {/* Thread routes */}
          <Route
            path={`/${RESERVED_ROOT_ROUTES.THREADS}`}
            element={<ThreadsPage />}
          />
          <Route
            path={`/${RESERVED_ROOT_ROUTES.THREADS}/:thread_id`}
            element={<ThreadDetailPage />}
          />
        </>
      )}

      {/* User-scoped routes - accessible to both authenticated and public users */}
      <Route path='/:username'>
        <Route index element={<UserRootPage />} />

        {/* URI scheme-based resource routes */}
        <Route path='user/*' element={<ResourcePage />} />
        <Route path='sys/*' element={<ResourcePage />} />
      </Route>

      {/* Fallback for unmatched routes */}
      <Route path='*' element={<Navigate to='/' replace={true} />} />
    </RouterRoutes>
  )
}

Routes.propTypes = {
  is_loaded: PropTypes.bool,
  public_key: PropTypes.string,
  username: PropTypes.string
}

export default connect(map_state_to_props)(Routes)
