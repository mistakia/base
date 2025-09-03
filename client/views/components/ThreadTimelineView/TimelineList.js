import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import TimelineEvent from './TimelineEvent'
import CollapsibleEventGroup from './CollapsibleEventGroup'
import { group_tool_entries } from './utils/group-tool-entries'

const TimelineList = ({
  timeline,
  working_directory = null,
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

  // Find last consecutive user message and last assistant message in grouped entries
  const find_collapsible_boundaries = () => {
    let last_consecutive_user_message_group_index = null
    let last_assistant_message_group_index = null
    let consecutive_user_messages_ended = false

    grouped_entries.forEach((entry, group_index) => {
      if (entry.type === 'tool_pair') {
        // Tool pairs indicate the end of consecutive user messages
        consecutive_user_messages_ended = true
        return
      }

      // Regular event - check if it's a message
      const timeline_event = entry.timeline_event
      if (timeline_event?.type === 'message') {
        if (timeline_event.role === 'user') {
          if (!consecutive_user_messages_ended) {
            // Still in consecutive user messages at the start
            last_consecutive_user_message_group_index = group_index
          }
        } else if (timeline_event.role === 'assistant') {
          // Any assistant message ends consecutive user messages
          consecutive_user_messages_ended = true

          if (entry.index === last_assistant_entry_index) {
            last_assistant_message_group_index = group_index
          }
        }
      } else {
        // Any non-message event ends consecutive user messages
        consecutive_user_messages_ended = true
      }
    })

    return {
      last_consecutive_user_message_group_index,
      last_assistant_message_group_index
    }
  }

  const {
    last_consecutive_user_message_group_index,
    last_assistant_message_group_index
  } = find_collapsible_boundaries()

  // Split entries into three sections: before, collapsible, after
  const entries_before_collapsible =
    last_consecutive_user_message_group_index !== null
      ? grouped_entries.slice(0, last_consecutive_user_message_group_index + 1)
      : []

  const collapsible_entries =
    last_consecutive_user_message_group_index !== null &&
    last_assistant_message_group_index !== null
      ? grouped_entries.slice(
          last_consecutive_user_message_group_index + 1,
          last_assistant_message_group_index
        )
      : []

  const entries_after_collapsible =
    last_assistant_message_group_index !== null
      ? grouped_entries.slice(last_assistant_message_group_index)
      : grouped_entries

  const should_use_collapsible = collapsible_entries.length > 0

  // Helper function to render a single timeline event
  const render_timeline_event = React.useCallback(
    (entry, index) => {
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
            working_directory={working_directory}
            hide_timeline_dot={hide_dot_for_main_subthread}
            render_nested_timeline={(nested) => (
              <TimelineList
                timeline={nested}
                working_directory={working_directory}
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
          working_directory={working_directory}
          hide_timeline_dot={hide_timeline_dot}
          render_nested_timeline={(nested) => (
            <TimelineList
              timeline={nested}
              working_directory={working_directory}
              include_sidechain={true}
              hide_timeline_dot={false}
              hide_timeline_line={false}
            />
          )}
        />
      )
    },
    [timeline, last_assistant_entry_index, hide_timeline_dot, working_directory]
  )

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

      {/* Render timeline events */}
      {should_use_collapsible ? (
        <>
          {/* Render entries before collapsible section */}
          {entries_before_collapsible.map((entry, index) =>
            render_timeline_event(entry, index)
          )}

          {/* Render collapsible section */}
          <CollapsibleEventGroup
            events={collapsible_entries}
            renderEvent={render_timeline_event}
            hideTimelineDot={hide_timeline_dot}
            hideTimelineLine={hide_timeline_line}
          />

          {/* Render entries after collapsible section */}
          {entries_after_collapsible.map((entry, index) =>
            render_timeline_event(
              entry,
              index +
                entries_before_collapsible.length +
                collapsible_entries.length
            )
          )}
        </>
      ) : (
        grouped_entries.map((entry, index) =>
          render_timeline_event(entry, index)
        )
      )}
    </Box>
  )
}

TimelineList.propTypes = {
  timeline: PropTypes.array.isRequired,
  working_directory: PropTypes.string,
  include_sidechain: PropTypes.bool,
  hide_timeline_dot: PropTypes.bool,
  hide_timeline_line: PropTypes.bool
}

export default TimelineList
