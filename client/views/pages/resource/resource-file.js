import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

import PageLayout from '@components/page-layout'
import BackButton from '@components/back-button'
import MarkdownContent from '@components/markdown-content'
import JSONViewer from '@components/json-viewer'
import CodeViewer from '@components/code-viewer'

import './resource-file.styl'

const ResourceFile = ({ base_uri, scheme, path, username, content }) => {
  const get_parent_path = () => {
    if (!path) return `/${username}`
    const path_parts = path.split('/').filter(Boolean)
    const parent_parts = path_parts.slice(0, -1)
    return parent_parts.length
      ? `/${username}/${scheme}/${parent_parts.join('/')}`
      : `/${username}/${scheme}`
  }

  const get_filename = () => {
    if (!path) return ''
    return path.split('/').pop()
  }

  const render_breadcrumbs = () => {
    if (!path) return null

    const path_parts = path.split('/').filter(Boolean)
    const breadcrumbs = path_parts.slice(0, -1) // Exclude filename
    const filename = path_parts[path_parts.length - 1]

    const links = breadcrumbs.map((part, index) => {
      const path_to_here = breadcrumbs.slice(0, index + 1).join('/')
      const href = `/${username}/${scheme}/${path_to_here}`

      return (
        <React.Fragment key={index}>
          {index > 0 && <span className='separator'>/</span>}
          <Link to={href} className='breadcrumb-link'>
            {part}
          </Link>
        </React.Fragment>
      )
    })

    return (
      <div className='breadcrumbs'>
        <span className='scheme'>{scheme}:</span>
        {links}
        {breadcrumbs.length > 0 && <span className='separator'>/</span>}
        <span className='filename'>{filename}</span>
      </div>
    )
  }

  const render_entity_metadata = () => {
    if (!content?.is_entity || !content?.metadata) return null

    const { metadata } = content
    return (
      <div className='entity-metadata'>
        <div className='metadata-grid'>
          {metadata.title && (
            <div className='metadata-item'>
              <span className='label'>Title:</span>
              <span className='value'>{metadata.title}</span>
            </div>
          )}
          {metadata.type && (
            <div className='metadata-item'>
              <span className='label'>Type:</span>
              <span className='value'>{metadata.type}</span>
            </div>
          )}
          {metadata.entity_id && (
            <div className='metadata-item'>
              <span className='label'>ID:</span>
              <span className='value'>{metadata.entity_id}</span>
            </div>
          )}
          {metadata.created_at && (
            <div className='metadata-item'>
              <span className='label'>Created:</span>
              <span className='value'>
                {new Date(metadata.created_at).toLocaleDateString()}
              </span>
            </div>
          )}
          {metadata.updated_at && (
            <div className='metadata-item'>
              <span className='label'>Updated:</span>
              <span className='value'>
                {new Date(metadata.updated_at).toLocaleDateString()}
              </span>
            </div>
          )}
          {metadata.tags && metadata.tags.length > 0 && (
            <div className='metadata-item'>
              <span className='label'>Tags:</span>
              <span className='value'>{metadata.tags.join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const render_content = () => {
    if (!content?.raw_content) {
      return <div className='no-content'>No content available</div>
    }

    const file_extension = get_filename().split('.').pop()?.toLowerCase()

    // Render based on file type or content type
    if (content.is_entity && content.parsed_content) {
      return <MarkdownContent content={content.parsed_content} />
    }

    switch (file_extension) {
      case 'md':
      case 'markdown':
        return <MarkdownContent content={content.raw_content} />

      case 'json':
        try {
          const parsed_json = JSON.parse(content.raw_content)
          return <JSONViewer data={parsed_json} />
        } catch {
          return <CodeViewer code={content.raw_content} language='json' />
        }

      case 'js':
      case 'mjs':
        return <CodeViewer code={content.raw_content} language='javascript' />

      case 'yaml':
      case 'yml':
        return <CodeViewer code={content.raw_content} language='yaml' />

      case 'txt':
        return <pre className='text-content'>{content.raw_content}</pre>

      default:
        return <CodeViewer code={content.raw_content} language='text' />
    }
  }

  return (
    <PageLayout>
      <div className='resource-file'>
        <div className='file-header'>
          <BackButton to={get_parent_path()} />
          {render_breadcrumbs()}
        </div>

        {render_entity_metadata()}

        <div className='file-content'>{render_content()}</div>
      </div>
    </PageLayout>
  )
}

ResourceFile.propTypes = {
  base_uri: PropTypes.string.isRequired,
  scheme: PropTypes.string.isRequired,
  path: PropTypes.string,
  username: PropTypes.string.isRequired,
  content: PropTypes.shape({
    raw_content: PropTypes.string,
    parsed_content: PropTypes.string,
    is_entity: PropTypes.bool,
    metadata: PropTypes.object
  })
}

export default ResourceFile
