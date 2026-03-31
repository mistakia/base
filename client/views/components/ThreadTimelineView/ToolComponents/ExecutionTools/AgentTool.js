import React, { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import BaseToolComponent from '@views/components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import { UnifiedChip } from '@views/components/primitives/styled'

const AgentTool = ({
  tool_call_event,
  tool_result_event,
  timeline,
  render_nested_timeline
}) => {
  const [is_expanded, set_is_expanded] = useState(false)

  const params = tool_call_event?.content?.tool_parameters || {}
  const description = params.description || 'Agent'
  const subagent_type = params.subagent_type || 'general-purpose'

  const sidechain_events = useMemo(() => {
    if (!Array.isArray(timeline)) return []

    const start_ts = tool_call_event?.timestamp
      ? new Date(tool_call_event.timestamp).getTime()
      : null
    const end_ts = tool_result_event?.timestamp
      ? new Date(tool_result_event.timestamp).getTime()
      : null

    if (start_ts === null) return []

    return timeline.filter((evt) => {
      if (evt?.provider_data?.is_sidechain !== true) return false

      const evt_ts = evt?.timestamp ? new Date(evt.timestamp).getTime() : null
      if (evt_ts === null) return false
      if (evt_ts < start_ts) return false
      if (end_ts !== null && evt_ts >= end_ts) return false

      return true
    })
  }, [timeline, tool_call_event, tool_result_event])

  const message_count = sidechain_events.filter((e) => e.type === 'message').length

  const chip_label = `AGENT: ${subagent_type}`

  const header = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        border: '1px solid var(--timeline-accent)',
        borderRadius: 'var(--radius-base)',
        px: 1.5,
        py: 1
      }}>
      <Box sx={{ fontWeight: 600 }}>{description}</Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          onClick={() => set_is_expanded((v) => !v)}
          sx={{ cursor: 'pointer', color: 'text.secondary', fontSize: '12px' }}>
          {is_expanded
            ? 'hide messages'
            : `${message_count} messages`}
        </Box>
        <UnifiedChip
          variant='mui'
          label={chip_label}
          size='small'
          status={'default'}
          sx={{
            height: 20,
            fontSize: '10px',
            backgroundColor: 'var(--timeline-accent)',
            color: 'var(--color-text)'
          }}
        />
      </Box>
    </Box>
  )

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      header={header}
      action_button={null}>
      {is_expanded && sidechain_events.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              maxWidth: '100%'
            }}>
            <Box
              sx={{
                color: 'var(--timeline-accent)',
                pr: 1,
                pt: 0.5,
                fontSize: '30px',
                lineHeight: 1
              }}>
              ⎿
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {typeof render_nested_timeline === 'function'
                ? render_nested_timeline(sidechain_events)
                : null}
            </Box>
          </Box>
        </Box>
      )}
    </BaseToolComponent>
  )
}

AgentTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object,
  timeline: PropTypes.array,
  render_nested_timeline: PropTypes.func
}

export default AgentTool
