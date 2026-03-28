import React from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'

const TitleCell = ({ row }) => {
  const navigate = useNavigate()
  const item = row.original

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
          {item.title || 'Untitled'}
        </div>
      </div>
    </div>
  )
}

TitleCell.propTypes = {
  row: PropTypes.object.isRequired
}

export default TitleCell
