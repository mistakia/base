import React, { useEffect } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { connect } from 'react-redux'
import PropTypes from 'prop-types'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import CodeIcon from '@mui/icons-material/Code'
import DataObjectIcon from '@mui/icons-material/DataObject'

import { directories_actions, get_file_content_state } from '@core/directory'
import MarkdownContent from '@components/markdown-content'

import '@styles/layout.styl'
import '../entity/detail/entity-detail-page.styl'
import './file-display-page.styl'

const FileDisplayPage = ({
  file_content_state,
  load_file_content,
  clear_file_content
}) => {
  const { type } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Extract the file path after '/file/:type/'
  const file_path = location.pathname.replace(`/file/${type}/`, '') || ''

  useEffect(() => {
    if (type && file_path) {
      load_file_content({ type, path: file_path })
    }

    return () => {
      // Clear file content when component unmounts
      clear_file_content()
    }
  }, [type, file_path, load_file_content, clear_file_content])

  const file_data = file_content_state.file_data
  const loading = file_content_state.loading
  const error = file_content_state.error

  const get_file_icon = () => {
    if (!file_data) return <ArticleOutlinedIcon />

    switch (file_data.extension) {
      case '.json':
        return <DataObjectIcon />
      case '.js':
      case '.mjs':
        return <CodeIcon />
      case '.md':
        return <ArticleOutlinedIcon />
      default:
        return <ArticleOutlinedIcon />
    }
  }

  const render_code_content = (content, language) => {
    return (
      <pre className='file-display__code'>
        <code>{content}</code>
      </pre>
    )
  }

  const navigate_back = () => {
    navigate(-1)
  }

  if (loading) {
    return (
      <div className='page-container'>
        <div className='header'>
          <h1 className='title'>File</h1>
        </div>
        <div className='content-container'>
          <div className='loading-state'>Loading file...</div>
        </div>
      </div>
    )
  }

  if (error || !file_data) {
    return (
      <div className='page-container'>
        <div className='header'>
          <h1 className='title'>File</h1>
        </div>
        <div className='content-container'>
          <div className='error-state'>{error || 'File not found'}</div>
        </div>
      </div>
    )
  }

  // For entity files, render using entity-style layout
  if (file_data.is_entity && file_data.entity_properties) {
    const entity_data = file_data.entity_properties

    return (
      <div className='page-container'>
        <div className='header'>
          <button
            className='file-display__back-button'
            onClick={navigate_back}
            aria-label='Go back'>
            <ArrowBackIcon />
          </button>
          <h1 className='title'>
            {entity_data.title || entity_data.name || file_data.name}
          </h1>
          <div className='entity-path'>{file_path}</div>
        </div>
        <div className='content-container'>
          <div className='entity-detail-container'>
            <div className='entity-detail-header'>
              {entity_data.type && (
                <div className='entity-type'>{entity_data.type}</div>
              )}
              {entity_data.created_at && (
                <div className='entity-created'>
                  Created: {new Date(entity_data.created_at).toLocaleString()}
                </div>
              )}
            </div>

            {file_data.markdown_content && (
              <div className='entity-content'>
                <MarkdownContent content={file_data.markdown_content} />
              </div>
            )}

            <div className='entity-metadata'>
              {Object.entries(entity_data)
                .filter(
                  ([key]) =>
                    !['content', 'title', 'name', 'type', 'base_uri'].includes(
                      key
                    )
                )
                .map(([key, value]) => (
                  <div key={key} className='metadata-item'>
                    <div className='metadata-key'>{key}</div>
                    <div className='metadata-value'>
                      {typeof value === 'object'
                        ? JSON.stringify(value, null, 2)
                        : String(value)}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // For non-entity files, render with file-specific layout
  return (
    <div className='page-container'>
      <div className='header'>
        <button
          className='file-display__back-button'
          onClick={navigate_back}
          aria-label='Go back'>
          <ArrowBackIcon />
        </button>
        <div className='file-display__header-content'>
          <div className='file-display__icon'>{get_file_icon()}</div>
          <h1 className='title'>{file_data.name}</h1>
        </div>
        <div className='entity-path'>{file_path}</div>
      </div>
      <div className='content-container'>
        <div className='file-display__content-wrapper'>
          {/* Render markdown without entity structure */}
          {file_data.extension === '.md' && file_data.markdown_content && (
            <div className='entity-content'>
              <MarkdownContent content={file_data.markdown_content} />
            </div>
          )}

          {/* Render JSON */}
          {file_data.extension === '.json' && (
            <div className='file-display__code-container'>
              <h2 className='file-display__code-title'>JSON Content</h2>
              {render_code_content(
                JSON.stringify(
                  file_data.parsed_json || JSON.parse(file_data.content),
                  null,
                  2
                ),
                'json'
              )}
            </div>
          )}

          {/* Render JavaScript/MJS */}
          {(file_data.extension === '.js' ||
            file_data.extension === '.mjs') && (
            <div className='file-display__code-container'>
              <h2 className='file-display__code-title'>JavaScript Content</h2>
              {render_code_content(file_data.content, 'javascript')}
            </div>
          )}

          {/* Fallback for other file types */}
          {!['.md', '.json', '.js', '.mjs'].includes(file_data.extension) && (
            <div className='file-display__code-container'>
              <h2 className='file-display__code-title'>File Content</h2>
              {render_code_content(file_data.content, 'text')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

FileDisplayPage.propTypes = {
  file_content_state: PropTypes.object.isRequired,
  load_file_content: PropTypes.func.isRequired,
  clear_file_content: PropTypes.func.isRequired
}

const map_state_to_props = (state) => ({
  file_content_state: get_file_content_state(state)
})

const map_dispatch_to_props = {
  load_file_content: directories_actions.load_file_content,
  clear_file_content: directories_actions.clear_file_content
}

export default connect(
  map_state_to_props,
  map_dispatch_to_props
)(FileDisplayPage)
