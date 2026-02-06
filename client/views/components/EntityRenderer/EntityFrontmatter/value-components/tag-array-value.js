import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { Link } from 'react-router-dom'

import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'

const container_sx = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  alignItems: 'center'
}

/**
 * TagArrayValue Component
 *
 * Renders an array of tag base_uris as clickable chips that link to the tag page.
 *
 * @param {Array} value - Array of tag base_uris (e.g., ["user:tag/base-project.md"])
 */
const TagArrayValue = ({ value }) => {
  if (!Array.isArray(value) || value.length === 0) {
    return <span style={{ fontSize: '12px' }}>None</span>
  }

  return (
    <Box sx={container_sx}>
      {value.map((tag_base_uri, index) => {
        // Convert tag base_uri to path (e.g., "user:tag/base-project.md" -> "/tag/base-project.md")
        const tag_path = convert_base_uri_to_path(tag_base_uri)

        // Extract tag name from base_uri for display
        // "user:tag/base-project.md" -> "base-project"
        // "user:tag/music/electronic.md" -> "music/electronic"
        const tag_display = tag_base_uri
          .replace(/^(user|sys):tag\//, '')
          .replace(/\.md$/, '')

        return (
          <Link
            key={index}
            to={tag_path}
            className='chip chip--link'
            style={{ textDecoration: 'none' }}
          >
            {tag_display}
          </Link>
        )
      })}
    </Box>
  )
}

TagArrayValue.propTypes = {
  value: PropTypes.array.isRequired
}

export default TagArrayValue
