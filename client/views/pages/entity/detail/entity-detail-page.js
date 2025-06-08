import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import PropTypes from 'prop-types'
import MarkdownContent from '@components/markdown-content'

import '@styles/layout.styl'
import './entity-detail-page.styl'

const EntityDetailPage = ({ entities, load_entity }) => {
  const { '*': base_uri } = useParams()
  const decodedPath = decodeURIComponent(base_uri)
  const entity = decodedPath ? entities.get(decodedPath) : null

  useEffect(() => {
    if (decodedPath) {
      // You would need to provide the root_base_directory based on your application config
      load_entity({ base_uri: decodedPath })
    }
  }, [decodedPath, load_entity])

  if (!entity) {
    return (
      <div className='page-container'>
        <div className='header'>
          <h1 className='title'>Entity</h1>
        </div>
        <div className='content-container'>
          <div className='loading-state'>Loading entity...</div>
        </div>
      </div>
    )
  }

  const entity_data = entity.toJS()

  return (
    <div className='page-container'>
      <div className='header'>
        <h1 className='title'>{entity_data.title || 'Entity'}</h1>
        <div className='entity-path'>{decodedPath}</div>
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

          {entity_data.content && (
            <div className='entity-content'>
              <MarkdownContent content={entity_data.content} />
            </div>
          )}

          <div className='entity-metadata'>
            {Object.entries(entity_data)
              .filter(
                ([key]) =>
                  !['content', 'title', 'type', 'base_uri'].includes(key)
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

EntityDetailPage.propTypes = {
  entities: PropTypes.object.isRequired,
  load_entity: PropTypes.func.isRequired
}

export default EntityDetailPage
