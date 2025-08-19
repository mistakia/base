import React from 'react'
import PropTypes from 'prop-types'
import { Box, Chip } from '@mui/material'
import { FieldRow } from './field-row.js'

export const TagsField = ({ key_name, value }) => {
  if (!Array.isArray(value)) return null
  return (
    <FieldRow label={key_name}>
      <Box
        sx={{
          display: 'flex',
          gap: 0.5,
          flexWrap: 'wrap',
          maxWidth: '100%',
          overflow: 'hidden'
        }}>
        {value.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            size='small'
            sx={{
              fontSize: '10px',
              height: '18px',
              maxWidth: '100%',
              '& .MuiChip-label': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }
            }}
          />
        ))}
      </Box>
    </FieldRow>
  )
}

TagsField.propTypes = {
  key_name: PropTypes.string.isRequired,
  value: PropTypes.array.isRequired
}
