import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import Table from 'react-table/index.js'

import {
  thread_columns,
  default_visible_columns
} from './column-definitions.js'
import {
  format_shorthand_time,
  format_duration,
  format_shorthand_number
} from '@views/utils/date-formatting.js'
import {
  extract_message_counts,
  extract_tool_call_count,
  extract_total_tokens,
  extract_duration,
  extract_working_directory,
  extract_session_provider,
  extract_thread_state
} from '@views/utils/thread-metadata-extractor.js'
import './ThreadsTable.styl'

const ThreadsTable = ({ threads, is_loading = false }) => {
  const data = useMemo(() => {
    if (!threads || !threads.toJS) {
      return []
    }
    return threads.toJS().map((thread) => {
      // Extract metadata using shared utilities
      const message_counts = extract_message_counts(thread)
      const tool_call_count = extract_tool_call_count(thread)
      const total_tokens = extract_total_tokens(thread)
      const duration = extract_duration(thread)
      const working_directory = extract_working_directory(thread)
      const session_provider = extract_session_provider(thread)
      const thread_state = extract_thread_state(thread)

      // Format duration - use extracted duration if available, otherwise fallback to date-based calculation
      const formatted_duration =
        duration || format_duration(thread.created_at, thread.updated_at)

      return {
        ...thread,
        className: '', // Add empty className to prevent "undefined" in row class
        // Pre-formatted values for simple display
        formatted_updated_at: format_shorthand_time(thread.updated_at),
        formatted_duration: formatted_duration || '—',
        formatted_directory: working_directory.formatted,
        formatted_directory_full_path: working_directory.path, // For title attribute
        formatted_message_count:
          message_counts.message_count > 0
            ? format_shorthand_number(message_counts.message_count)
            : '—',
        formatted_user_message_count:
          message_counts.user_message_count > 0
            ? format_shorthand_number(message_counts.user_message_count)
            : '—',
        formatted_assistant_message_count:
          message_counts.assistant_message_count > 0
            ? format_shorthand_number(message_counts.assistant_message_count)
            : '—',
        formatted_token_count:
          total_tokens > 0 ? format_shorthand_number(total_tokens) : '—',
        formatted_tool_call_count:
          tool_call_count > 0 ? format_shorthand_number(tool_call_count) : '—',
        // Raw values for column accessors
        message_count: message_counts.message_count,
        user_message_count: message_counts.user_message_count,
        assistant_message_count: message_counts.assistant_message_count,
        tool_call_count,
        total_tokens,
        session_provider,
        thread_state
      }
    })
  }, [threads])

  const table_state = useMemo(
    () => ({
      columns: default_visible_columns,
      sort: [{ column_id: 'updated_at', desc: true }]
    }),
    []
  )

  const selected_view = useMemo(() => ({}), [])
  const views = useMemo(() => [], [])

  if (is_loading) {
    return (
      <div className='threads-table-loading'>
        <div className='loading-spinner'></div>
        <span>Loading threads...</span>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className='threads-table-empty'>
        <span>No threads found</span>
      </div>
    )
  }

  return (
    <div className='threads-table-container'>
      <Table
        data={data}
        all_columns={thread_columns}
        table_state={table_state}
        selected_view={selected_view}
        views={views}
        on_view_change={() => {}}
        is_loading={is_loading}
        disable_rank_aggregation={true}
        disable_splits={true}
      />
    </div>
  )
}

ThreadsTable.propTypes = {
  threads: ImmutablePropTypes.list,
  is_loading: PropTypes.bool
}

export default ThreadsTable
