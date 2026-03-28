import React from 'react'
import PropTypes from 'prop-types'
import { Chip, Box, Tooltip } from '@mui/material'
import { TagChip, extract_tag_title } from '@views/components/primitives/styled'
import { COLORS } from '@theme/colors.js'

export const MAX_VISIBLE_TAGS = 3

const TagsCell = ({ row, column }) => {
  const item = row.original
  const tags = item.tags || []
  const available_tags = column?.columnDef?.column_values || []

  if (tags.length === 0) {
    return (
      <div
        className='cell-content'
        style={{
          height: 'fit-content',
          display: 'flex',
          justifyContent: 'flex-start'
        }}>
        <span style={{ color: COLORS.text_tertiary }}>—</span>
      </div>
    )
  }

  const tag_lookup = {}
  for (const tag of available_tags) {
    if (tag.value) {
      tag_lookup[tag.value] = tag
    }
  }

  const visible_tags = tags.slice(0, MAX_VISIBLE_TAGS)
  const remaining_count = tags.length - MAX_VISIBLE_TAGS
  const remaining_tags = tags.slice(MAX_VISIBLE_TAGS)

  return (
    <div
      className='cell-content'
      style={{
        height: 'fit-content',
        display: 'flex',
        justifyContent: 'flex-start',
        width: '100%'
      }}>
      <Box
        sx={{
          display: 'flex',
          gap: 0.5,
          flexWrap: 'nowrap',
          alignItems: 'center',
          overflow: 'hidden'
        }}>
        {visible_tags.map((tag_uri) => {
          const tag_data = tag_lookup[tag_uri]
          return (
            <TagChip
              key={tag_uri}
              tag={
                tag_data
                  ? {
                      base_uri: tag_uri,
                      title: tag_data.label,
                      color: tag_data.color
                    }
                  : tag_uri
              }
              max_width='none'
            />
          )
        })}
        {remaining_count > 0 && (
          <Tooltip
            title={remaining_tags.map(extract_tag_title).join(', ')}
            arrow
            placement='top'>
            <Chip
              label={`+${remaining_count}`}
              size='small'
              variant='outlined'
              sx={{
                fontSize: '10px',
                height: '20px',
                minWidth: '32px',
                '& .MuiChip-label': {
                  padding: '0 4px'
                }
              }}
            />
          </Tooltip>
        )}
      </Box>
    </div>
  )
}

TagsCell.propTypes = {
  row: PropTypes.object.isRequired,
  column: PropTypes.object
}

export default TagsCell
