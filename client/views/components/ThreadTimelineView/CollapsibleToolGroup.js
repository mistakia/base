import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography } from '@mui/material'

const get_tool_summary = (entries) => {
  const tool_names = new Set()
  let tool_count = 0

  for (const entry of entries) {
    if (entry.type === 'tool_pair') {
      tool_count++
      const name = entry.tool_call_event?.content?.tool_name
      if (name) tool_names.add(name)
    } else if (entry.type === 'task_group') {
      tool_count += entry.tool_pairs?.length || 0
      for (const pair of entry.tool_pairs || []) {
        const name = pair.tool_call_event?.content?.tool_name
        if (name) tool_names.add(name)
      }
    }
  }

  if (tool_count === 0) {
    return `${entries.length} hidden events`
  }

  const names_str = Array.from(tool_names).join(', ')
  return `${tool_count} tool ${tool_count === 1 ? 'call' : 'calls'}: ${names_str}`
}

const CollapsibleToolGroup = ({ entries, render_event, group_key }) => {
  const [is_expanded, set_is_expanded] = useState(false)

  if (is_expanded) {
    return (
      <Box className='collapsible-tool-group collapsible-tool-group--expanded'>
        <Typography
          className='collapsible-tool-group__toggle'
          component='div'
          onClick={() => set_is_expanded(false)}
          sx={{
            display: 'block',
            padding: '8px 0',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
            fontSize: '0.75rem',
            textAlign: 'left'
          }}>
          {'< hide tool calls'}
        </Typography>
        {entries.map((entry, index) =>
          render_event(entry, `${group_key}-${index}`)
        )}
      </Box>
    )
  }

  const summary = get_tool_summary(entries)

  return (
    <Box className='collapsible-tool-group'>
      <Typography
        className='collapsible-tool-group__toggle'
        component='div'
        onClick={() => set_is_expanded(true)}
        sx={{
          display: 'block',
          padding: '8px 0',
          margin: '8px 0',
          cursor: 'pointer',
          color: 'var(--color-text-tertiary)',
          fontSize: '0.75rem',
          textAlign: 'left'
        }}>
        {`${summary} >`}
      </Typography>
    </Box>
  )
}

CollapsibleToolGroup.propTypes = {
  entries: PropTypes.array.isRequired,
  render_event: PropTypes.func.isRequired,
  group_key: PropTypes.string.isRequired
}

export default CollapsibleToolGroup
