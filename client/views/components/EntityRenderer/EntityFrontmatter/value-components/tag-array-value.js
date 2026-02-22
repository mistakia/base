import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'
import TagChip from '@views/components/primitives/styled/tag-chip.js'

const container_sx = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  alignItems: 'center'
}

/**
 * TagArrayValue Component
 *
 * Renders an array of tag base_uris as clickable colored chips that link to the tag page.
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
        const tag_path = convert_base_uri_to_path(tag_base_uri)

        return (
          <TagChip key={index} tag={tag_base_uri} to={tag_path} size='small' />
        )
      })}
    </Box>
  )
}

TagArrayValue.propTypes = {
  value: PropTypes.array.isRequired
}

export default TagArrayValue
