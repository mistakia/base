import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { FieldRow } from './field-row.js'

export const ListField = ({ key_name, value }) => {
  if (!Array.isArray(value)) return null
  const label = key_name.replace(/_/g, ' ')
  return (
    <FieldRow label={label}>
      <Box
        sx={{
          maxWidth: '100%',
          overflow: 'hidden',
          wordWrap: 'break-word',
          overflowWrap: 'break-word'
        }}>
        {value.join(', ')}
      </Box>
    </FieldRow>
  )
}

ListField.propTypes = {
  key_name: PropTypes.string.isRequired,
  value: PropTypes.array.isRequired
}
