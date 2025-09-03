import React from 'react'
import { Box } from '@mui/material'

export const render_models_value = ({ models }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      fontSize: '12px'
    }}>
    {models.map((model) => (
      <Box key={model} sx={{ fontFamily: 'monospace' }}>
        {model}
      </Box>
    ))}
  </Box>
)
