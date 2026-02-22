import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'
import { format_shorthand_time } from '@views/utils/date-formatting.js'
import {
  get_entity_type_color,
  get_entity_type_display_label
} from '#libs-shared/entity-constants.mjs'

/**
 * TagEntitiesPanel Component
 *
 * Displays non-task entities tagged with the current tag, grouped by type.
 * Each item shows a colored type badge, title link, and relative timestamp.
 *
 * @param {Object} entities_by_type - Map of entity type to array of entities
 * @param {Array} entity_types - Sorted array of entity type strings
 * @param {string} base_uri - Tag base_uri
 * @param {function} on_expand - Handler for expanding to full view
 */
const TagEntitiesPanel = ({
  entities_by_type,
  entity_types,
  base_uri,
  on_expand
}) => {
  const total_count = entity_types.reduce(
    (sum, type) => sum + entities_by_type[type].length,
    0
  )

  const max_preview = 15
  let shown = 0
  const visible_items = []

  for (const type of entity_types) {
    for (const entity of entities_by_type[type]) {
      if (shown >= max_preview) break
      visible_items.push({ ...entity, _display_type: type })
      shown++
    }
    if (shown >= max_preview) break
  }

  const has_more = total_count > max_preview

  return (
    <div className='tag-entities-panel'>
      <div className='tag-entities-panel__header'>
        <h3 className='tag-entities-panel__title'>Entities</h3>
        <span className='tag-entities-panel__count'>{total_count}</span>
      </div>

      {visible_items.length === 0 ? (
        <div className='tag-entities-panel__empty'>
          No other entities with this tag
        </div>
      ) : (
        <ul className='tag-entities-panel__list'>
          {visible_items.map((entity) => {
            const entity_path = convert_base_uri_to_path(entity.base_uri)
            const type_color = get_entity_type_color(entity._display_type)
            const type_label = get_entity_type_display_label(
              entity._display_type
            )

            return (
              <li key={entity.entity_id} className='tag-entities-panel__item'>
                <Link to={entity_path} className='tag-entities-panel__link'>
                  <span
                    className='tag-entities-panel__type-badge'
                    style={{
                      color: type_color,
                      background: `${type_color}26`
                    }}>
                    {type_label}
                  </span>
                  <span className='tag-entities-panel__entity-title'>
                    {entity.title || 'Untitled'}
                  </span>
                  {entity.updated_at && (
                    <span className='tag-entities-panel__time'>
                      {format_shorthand_time(entity.updated_at)}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {has_more && (
        <div className='tag-entities-panel__footer'>
          <button
            type='button'
            className='tag-entities-panel__view-all'
            onClick={on_expand}>
            View all {total_count} entities
          </button>
        </div>
      )}
    </div>
  )
}

TagEntitiesPanel.propTypes = {
  entities_by_type: PropTypes.object.isRequired,
  entity_types: PropTypes.arrayOf(PropTypes.string).isRequired,
  base_uri: PropTypes.string.isRequired,
  on_expand: PropTypes.func
}

export default TagEntitiesPanel
