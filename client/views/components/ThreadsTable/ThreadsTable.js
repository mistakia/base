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
import './ThreadsTable.styl'

const ThreadsTable = ({ threads, is_loading = false }) => {
  const data = useMemo(() => {
    if (!threads || !threads.toJS) {
      return []
    }
    return threads.toJS().map((thread) => {
      // Pre-format simple values to avoid unnecessary React components
      const duration_minutes =
        thread.external_session?.provider_metadata?.duration_minutes
      const formatted_duration = duration_minutes
        ? `${parseFloat(duration_minutes.toFixed(1))}m`
        : format_duration(thread.created_at, thread.updated_at)

      const working_directory_path =
        thread.external_session?.provider_metadata?.working_directory
      const formatted_directory = working_directory_path
        ? working_directory_path.split('/').pop() || 'root'
        : '—'

      const message_count = thread.external_session?.message_count || 0
      const token_count =
        thread.external_session?.provider_metadata?.total_tokens || 0

      return {
        ...thread,
        className: '', // Add empty className to prevent "undefined" in row class
        // Pre-formatted values for simple display
        formatted_updated_at: format_shorthand_time(thread.updated_at),
        formatted_duration: formatted_duration || '—',
        formatted_directory,
        formatted_directory_full_path: working_directory_path, // For title attribute
        formatted_message_count:
          message_count > 0 ? format_shorthand_number(message_count) : '—',
        formatted_token_count:
          token_count > 0 ? format_shorthand_number(token_count) : '—'
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
