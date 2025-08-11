import React from 'react'
import PropTypes from 'prop-types'
import { Box, Typography } from '@mui/material'
import { FieldRow } from './field-row.js'

export const RelationsField = ({ key_name, value }) => {
  if (!Array.isArray(value)) return null
  return (
    <FieldRow label={key_name}>
      {value.map((relation, idx) => (
        <Box key={idx} sx={{ mb: 0.3 }}>
          <Typography
            variant='caption'
            sx={{
              display: 'block',
              fontSize: '10px',
              wordWrap: 'break-word',
              overflowWrap: 'break-word'
            }}>
            {relation}
          </Typography>
        </Box>
      ))}
    </FieldRow>
  )
}

RelationsField.propTypes = {
  key_name: PropTypes.string.isRequired,
  value: PropTypes.array.isRequired
}
