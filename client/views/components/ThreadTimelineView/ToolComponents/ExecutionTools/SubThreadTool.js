import React, { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import BaseToolComponent from '@views/components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import { UnifiedChip } from '@views/components/primitives/styled'

const SubThreadTool = ({
  tool_call_event,
  tool_result_event,
  timeline,
  render_nested_timeline
}) => {
  const [is_expanded, set_is_expanded] = useState(false)

  const get_task_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const description = params.description || 'Subthread'
    return { description }
  }

  const get_subthread_events = useMemo(() => {
    if (!Array.isArray(timeline)) return []

    // Get timestamp range from tool_call and tool_result
    const start_ts = tool_call_event?.timestamp
      ? new Date(tool_call_event.timestamp).getTime()
      : null
    const end_ts = tool_result_event?.timestamp
      ? new Date(tool_result_event.timestamp).getTime()
      : null

    // Use explicit null check to handle zero timestamps correctly
    if (start_ts === null) return []

    // Filter sidechain events by timestamp range (more reliable than sequence)
    return timeline.filter((evt) => {
      const is_sidechain = evt?.provider_data?.is_sidechain === true
      if (!is_sidechain) return false

      const evt_ts = evt?.timestamp ? new Date(evt.timestamp).getTime() : null
      // Use explicit null check to handle zero timestamps correctly
      if (evt_ts === null) return false

      // Event must be after tool_call timestamp
      if (evt_ts < start_ts) return false
      // If we have an end timestamp, event must be before or at tool_result
      if (end_ts !== null && evt_ts > end_ts) return false

      return true
    })
  }, [timeline, tool_call_event, tool_result_event])

  const subthread_message_count = useMemo(() => {
    return get_subthread_events.filter((e) => e.type === 'message').length
  }, [get_subthread_events])

  const { description } = get_task_info()

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
            : `${subthread_message_count} messages`}
        </Box>
        <UnifiedChip
          variant='mui'
          label={'SUB-THREAD'}
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
      {is_expanded && get_subthread_events.length > 0 && (
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
                ? render_nested_timeline(get_subthread_events)
                : null}
            </Box>
          </Box>
        </Box>
      )}
      {!is_expanded && <></>}
    </BaseToolComponent>
  )
}

SubThreadTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object,
  timeline: PropTypes.array,
  render_nested_timeline: PropTypes.func
}

export default SubThreadTool
