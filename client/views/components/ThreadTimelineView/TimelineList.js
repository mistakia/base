import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import TimelineEvent from './TimelineEvent'
import CollapsibleEventGroup from './CollapsibleEventGroup'
import { group_tool_entries } from './utils/group-tool-entries'

// Length threshold for considering an assistant message as "notable"
const NOTABLE_ASSISTANT_MESSAGE_LENGTH = 500

/**
 * Calculate the content length of a timeline event message
 */
const get_message_content_length = (content) => {
  if (typeof content === 'string') {
    return content.length
  }
  return JSON.stringify(content).length
}

/**
 * Check if an entry is a "notable" event worthy of display in notable events view
 * - All user messages are notable
 * - Assistant messages are notable if they exceed the length threshold
 * - Tool pairs and other events are not notable
 */
const is_notable_event = (entry) => {
  if (entry.type === 'tool_pair') {
    return false
  }

  const timeline_event = entry.timeline_event
  if (timeline_event?.type !== 'message') {
    return false
  }

  if (timeline_event.role === 'user') {
    return true
  }

  if (timeline_event.role === 'assistant') {
    const content_length = get_message_content_length(timeline_event.content)
    return content_length >= NOTABLE_ASSISTANT_MESSAGE_LENGTH
  }

  return false
}

const TimelineList = ({
  timeline,
  working_directory = null,
  include_sidechain = false,
  hide_timeline_dot = false,
  hide_timeline_line = false
}) => {
  /**
   * View mode state:
   * - 'default': Shows first user messages, last assistant message, everything between collapsed
   * - 'notable_events': Shows all notable events (user messages + long assistant messages)
   *                     with smaller collapsible sections for non-notable events between them
   */
  const [view_mode, set_view_mode] = useState('default')

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

  /**
   * Group collapsible entries into sections for notable events view.
   * Creates alternating sections of notable events and collapsible groups.
   * Returns array of: { type: 'notable', event, original_index } | { type: 'collapsible', events }
   */
  const group_by_notable_events = (entries) => {
    const sections = []
    let hidden_events_buffer = []

    entries.forEach((entry, index) => {
      if (is_notable_event(entry)) {
        // Flush any hidden events as a collapsible section
        if (hidden_events_buffer.length > 0) {
          sections.push({ type: 'collapsible', events: hidden_events_buffer })
          hidden_events_buffer = []
        }
        sections.push({ type: 'notable', event: entry, original_index: index })
      } else {
        hidden_events_buffer.push(entry)
      }
    })

    // Flush remaining hidden events
    if (hidden_events_buffer.length > 0) {
      sections.push({ type: 'collapsible', events: hidden_events_buffer })
    }

    return sections
  }

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

  /**
   * Render a single section from the notable events view
   */
  const render_notable_section = (section, section_index) => {
    if (section.type === 'notable') {
      return render_timeline_event(
        section.event,
        entries_before_collapsible.length + section.original_index
      )
    }

    if (section.type === 'collapsible') {
      // If only one event, render it directly without collapsing
      if (section.events.length === 1) {
        return render_timeline_event(
          section.events[0],
          entries_before_collapsible.length + section_index
        )
      }

      // Multiple events: render as collapsible group
      return (
        <CollapsibleEventGroup
          key={`collapsible-${section_index}`}
          events={section.events}
          renderEvent={render_timeline_event}
          hideTimelineDot={hide_timeline_dot}
          hideTimelineLine={hide_timeline_line}
          mode='notable_events'
        />
      )
    }

    return null
  }

  // Render content based on view mode
  const render_content = () => {
    if (view_mode === 'default') {
      // Default view: first user messages, last assistant, everything between collapsed
      if (should_use_collapsible) {
        return (
          <>
            {/* Render entries before collapsible section */}
            {entries_before_collapsible.map((entry, index) =>
              render_timeline_event(entry, index)
            )}

            {/* Render collapsible section with mode="default" */}
            <CollapsibleEventGroup
              events={collapsible_entries}
              renderEvent={render_timeline_event}
              hideTimelineDot={hide_timeline_dot}
              hideTimelineLine={hide_timeline_line}
              mode='default'
              onExpand={() => set_view_mode('notable_events')}
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
        )
      } else {
        return grouped_entries.map((entry, index) =>
          render_timeline_event(entry, index)
        )
      }
    } else if (view_mode === 'notable_events') {
      // Notable events view: show all notable events with collapsible sections between them
      const notable_sections = group_by_notable_events(collapsible_entries)

      return (
        <>
          {/* Render entries before collapsible section */}
          {entries_before_collapsible.map((entry, index) =>
            render_timeline_event(entry, index)
          )}

          {/* Render notable sections (alternating notable events and collapsible groups) */}
          {notable_sections.map(render_notable_section)}

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
      )
    }
  }

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
      {render_content()}
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
