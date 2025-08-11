import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import TimelineEvent from './TimelineEvent'
import { group_tool_entries } from './utils/group-tool-entries'

const TimelineList = ({
  timeline,
  include_sidechain = false,
  hide_timeline_dot = false,
  hide_timeline_line = false
}) => {
  const timeline_main = React.useMemo(() => {
    if (!Array.isArray(timeline)) return []
    if (include_sidechain) return timeline
    return timeline.filter((evt) => !evt?.provider_data?.is_sidechain)
  }, [timeline, include_sidechain])

  const grouped_entries = group_tool_entries(timeline_main)

  // find the last assistant message entry index (by original timeline index)
  const last_assistant_entry_index = (() => {
    let last_index = null
    timeline_main.forEach((event, index) => {
      if (event && event.type === 'message' && event.role === 'assistant') {
        last_index = index
      }
    })
    return last_index
  })()

  return (
    <Box sx={{ py: 3, position: 'relative' }}>
      {/* Timeline line */}
      {!hide_timeline_line && (
        <Box
          sx={{
            position: 'absolute',
            left: '15px',
            top: '30px',
            bottom: '20px',
            width: '2px',
            backgroundColor: 'var(--timeline-accent)',
            zIndex: 0
          }}
        />
      )}

      {grouped_entries.map((entry, index) => {
        const entry_key = `${entry.type}-${entry.index || index}`

        if (entry.type === 'tool_pair') {
          // For tool pairs, use the tool call event as the main event
          const timeline_event = entry.tool_call_event
          const tool_name = timeline_event?.content?.tool_name
          const hide_dot_for_main_subthread = tool_name === 'Task'

          return (
            <TimelineEvent
              key={entry_key}
              timeline_event={timeline_event}
              tool_result_event={entry.tool_result_event}
              is_last_assistant_message={false}
              timeline={timeline}
              hide_timeline_dot={hide_dot_for_main_subthread}
              render_nested_timeline={(nested) => (
                <TimelineList
                  timeline={nested}
                  include_sidechain={true}
                  hide_timeline_dot={false}
                  hide_timeline_line={false}
                />
              )}
            />
          )
        }

        // Regular events
        const timeline_event = entry.timeline_event
        const is_last_assistant_message =
          timeline_event &&
          timeline_event.type === 'message' &&
          timeline_event.role === 'assistant' &&
          entry.index === last_assistant_entry_index

        return (
          <TimelineEvent
            key={entry_key}
            timeline_event={timeline_event}
            is_last_assistant_message={is_last_assistant_message}
            timeline={timeline}
            hide_timeline_dot={hide_timeline_dot}
            render_nested_timeline={(nested) => (
              <TimelineList
                timeline={nested}
                include_sidechain={true}
                hide_timeline_dot={false}
                hide_timeline_line={false}
              />
            )}
          />
        )
      })}
    </Box>
  )
}

TimelineList.propTypes = {
  timeline: PropTypes.array.isRequired,
  include_sidechain: PropTypes.bool,
  hide_timeline_dot: PropTypes.bool,
  hide_timeline_line: PropTypes.bool
}

export default TimelineList
