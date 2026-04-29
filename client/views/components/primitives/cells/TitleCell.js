import React from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'
import HighlightedText from 'react-table/src/search/highlighted-text.js'
import { TITLE_FIELDS } from 'react-table/src/search/title-fields.js'

const TitleCell = ({ row, table }) => {
  const navigate = useNavigate()
  const item = row.original

  const highlights = item.base_uri
    ? table?.options?.meta?.row_highlights?.[item.base_uri] || null
    : null
  const title_ranges = highlights?.cell_ranges?.title || []
  const snippet =
    highlights && !TITLE_FIELDS.has(highlights.matched_field)
      ? highlights.snippet
      : null

  const handle_click = (event) => {
    if (item.is_redacted) return

    if (item.base_uri) {
      const navigation_path = convert_base_uri_to_path(item.base_uri)
      const is_modifier_pressed = event.metaKey || event.ctrlKey

      if (is_modifier_pressed) {
        window.open(navigation_path, '_blank')
      } else {
        navigate(navigation_path)
      }
    }
  }

  return (
    <div
      className='cell-content'
      onClick={handle_click}
      style={{
        height: 'fit-content',
        justifyContent: 'flex-start',
        width: '100%',
        cursor: 'pointer'
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ fontWeight: '500', lineHeight: '1.2' }}>
          <HighlightedText
            text={item.title || 'Untitled'}
            ranges={title_ranges}
          />
        </div>
        {snippet && snippet.text && (
          <div
            style={{
              fontSize: '12px',
              color: 'rgba(0,0,0,0.6)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: '1.2'
            }}>
            <HighlightedText text={snippet.text} ranges={snippet.ranges} />
          </div>
        )}
      </div>
    </div>
  )
}

TitleCell.propTypes = {
  row: PropTypes.object.isRequired,
  table: PropTypes.object
}

export default React.memo(TitleCell)
