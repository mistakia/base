import React, { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import Button from '@components/primitives/Button'
import { MonospaceText } from '@views/components/primitives/styled/index.js'

const DefaultToolHeader = ({
  tool_name,
  tool_params,
  action_button,
  title_override
}) => {
  const [show_all_params, set_show_all_params] = useState(false)
  const max_chars = 100

  const formatted_title = useMemo(() => {
    if (title_override && typeof title_override === 'string') {
      const full = title_override
      if (show_all_params) return full
      if (full.length <= max_chars) return full
      return `${full.slice(0, max_chars - 4)} ...`
    }

    if (!tool_params || Object.keys(tool_params).length === 0) {
      return `${tool_name}()`
    }

    const entries = Object.entries(tool_params)
    const parts = []

    for (const [key, value] of entries) {
      let value_repr
      if (typeof value === 'string') {
        value_repr = `"${value}"`
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        value_repr = `"${value}"`
      } else if (value === null || value === undefined) {
        value_repr = 'null'
      } else {
        value_repr = '{...}'
      }

      const segment = `${key}=${value_repr}`
      parts.push(segment)
    }

    const full = `${tool_name}(${parts.join(', ')})`
    if (show_all_params) return full
    if (full.length <= max_chars) return full

    const truncated_parts = []
    let running = `${tool_name}(`
    for (let i = 0; i < parts.length; i++) {
      const next = truncated_parts.length === 0 ? parts[i] : `, ${parts[i]}`
      const candidate = `${running}${next})`
      if (candidate.length + 4 <= max_chars) {
        truncated_parts.push(parts[i])
        running = `${tool_name}(${truncated_parts.join(', ')}`
      } else {
        break
      }
    }
    return `${tool_name}(${truncated_parts.join(', ')}${truncated_parts.length < parts.length ? ', ...' : ''})`
  }, [tool_name, tool_params, show_all_params, title_override])

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 'var(--space-xs)',
        mb: 'var(--space-sm)'
      }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          flex: 1,
          minWidth: 0
        }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              flexWrap: 'wrap'
            }}>
            <MonospaceText
              variant='sm'
              sx={{
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                wordBreak: 'break-all'
              }}
              onClick={() => set_show_all_params(!show_all_params)}
              title={
                show_all_params
                  ? 'Hide full parameters'
                  : 'Show full parameters'
              }>
              {formatted_title}
            </MonospaceText>
            {action_button && (
              <Button
                variant='ghost'
                size='small'
                onClick={action_button.onClick}>
                {action_button.label}
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

DefaultToolHeader.propTypes = {
  tool_name: PropTypes.string.isRequired,
  tool_params: PropTypes.object,
  action_button: PropTypes.object,
  title_override: PropTypes.string
}

export default DefaultToolHeader
