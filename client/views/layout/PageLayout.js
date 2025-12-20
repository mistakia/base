import React from 'react'
import PropTypes from 'prop-types'
import { useLocation, useNavigate } from 'react-router-dom'
import PathBreadcrumb from '@components/PathBreadcrumb/index.js'
import AuthStatusBar from '@components/AuthStatusBar/index.js'
import SessionsPanelContainer from '@components/SessionsPanel/SessionsPanelContainer.js'

const PageLayout = ({ children }) => {
  const location = useLocation()
  const navigate = useNavigate()

  const current_path = location.pathname
  const is_homepage = current_path === '/'

  const handle_navigate = (path) => {
    navigate(path || '/')
  }

  return (
    <div className='page-layout'>
      <AuthStatusBar />
      {!is_homepage && (
        <div className='page-sessions-panel'>
          <SessionsPanelContainer max_threads={2} />
        </div>
      )}
      <div className='page-content-container'>{children}</div>
      <div className='bottom-bar'>
        <PathBreadcrumb path={current_path} on_navigate={handle_navigate} />
      </div>
    </div>
  )
}

PageLayout.propTypes = {
  children: PropTypes.node.isRequired
}

export default PageLayout
