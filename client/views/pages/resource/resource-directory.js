import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

import PageLayout from '@components/page-layout'
import BackButton from '@components/back-button'

import './resource-directory.styl'

const ResourceDirectory = ({ base_uri, scheme, path, username, content }) => {
  const breadcrumbs = path ? path.split('/').filter(Boolean) : []

  const get_parent_path = () => {
    if (!path) return `/${username}`
    const parent_parts = breadcrumbs.slice(0, -1)
    return parent_parts.length
      ? `/${username}/${scheme}/${parent_parts.join('/')}`
      : `/${username}/${scheme}`
  }

  const render_breadcrumbs = () => {
    if (!breadcrumbs.length) {
      return (
        <div className='breadcrumbs'>
          <span className='scheme'>{scheme}:</span>
        </div>
      )
    }

    const links = breadcrumbs.map((part, index) => {
      const path_to_here = breadcrumbs.slice(0, index + 1).join('/')
      const href = `/${username}/${scheme}/${path_to_here}`
      const is_last = index === breadcrumbs.length - 1

      return (
        <React.Fragment key={index}>
          {index > 0 && <span className='separator'>/</span>}
          {is_last ? (
            <span className='current'>{part}</span>
          ) : (
            <Link to={href} className='breadcrumb-link'>
              {part}
            </Link>
          )}
        </React.Fragment>
      )
    })

    return (
      <div className='breadcrumbs'>
        <span className='scheme'>{scheme}:</span>
        {links}
      </div>
    )
  }

  const render_items = () => {
    if (!content?.items) {
      return <div className='no-items'>No items found</div>
    }

    return (
      <div className='resource-grid'>
        {content.items.map((item) => {
          const item_path = path ? `${path}/${item.name}` : item.name
          const href = `/${username}/${scheme}/${item_path}`
          const is_directory = item.type === 'directory'

          return (
            <Link
              key={item.name}
              to={href}
              className={`resource-item ${is_directory ? 'directory' : 'file'}`}>
              <div className='item-header'>
                <div className='item-type'>{is_directory ? 'DIR' : 'FILE'}</div>
                <div className='item-meta'>
                  {item.size && <span className='item-size'>{item.size}</span>}
                  {item.modified && (
                    <span className='item-modified'>{item.modified}</span>
                  )}
                </div>
              </div>
              <div className='item-name'>{item.name}</div>
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <PageLayout>
      <div className='resource-directory'>
        <div className='directory-header'>
          <BackButton to={get_parent_path()} />
          {render_breadcrumbs()}
        </div>
        <div className='directory-content'>{render_items()}</div>
      </div>
    </PageLayout>
  )
}

ResourceDirectory.propTypes = {
  base_uri: PropTypes.string.isRequired,
  scheme: PropTypes.string.isRequired,
  path: PropTypes.string,
  username: PropTypes.string.isRequired,
  content: PropTypes.shape({
    items: PropTypes.arrayOf(
      PropTypes.shape({
        name: PropTypes.string.isRequired,
        type: PropTypes.string.isRequired,
        size: PropTypes.string,
        modified: PropTypes.string
      })
    )
  })
}

export default ResourceDirectory
