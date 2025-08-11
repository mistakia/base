import React from 'react'
import PropTypes from 'prop-types'
import { useLocation, useNavigate } from 'react-router-dom'
import PathBreadcrumb from '@components/PathBreadcrumb/index.js'

const PageLayout = ({ children }) => {
  const location = useLocation()
  const navigate = useNavigate()

  const current_path = location.pathname

  const handle_navigate = (path) => {
    navigate(path || '/')
  }

  return (
    <div className='page-layout'>
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
