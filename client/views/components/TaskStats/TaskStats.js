import React, { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'

import './TaskStats.styl'

export const STATUS_COLORS = {
  Planned: '#3b82f6',
  'In Progress': '#f59e0b',
  Started: '#06b6d4',
  Draft: '#9ca3af',
  Blocked: '#dc2626',
  Waiting: '#6366f1',
  Paused: '#6b7280'
}

const Sparkline = ({ data, value_key, color = '#f97316', height = 32 }) => {
  const container_ref = useRef(null)
  const [width, set_width] = useState(0)

  useEffect(() => {
    if (!container_ref.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        set_width(entry.contentRect.width)
      }
    })
    observer.observe(container_ref.current)
    return () => observer.disconnect()
  }, [])

  const points = useMemo(() => {
    if (!data || data.length === 0 || width === 0) return ''
    const values = data.map((d) => d[value_key] || 0)
    const max_val = Math.max(...values, 1)
    const min_val = Math.min(...values, 0)
    const range = max_val - min_val || 1
    const x_step = width / Math.max(data.length - 1, 1)
    return values
      .map((v, i) => {
        const x = i * x_step
        const y = height - ((v - min_val) / range) * (height - 4) - 2
        return `${x},${y}`
      })
      .join(' ')
  }, [data, value_key, width, height])

  // Zero line for charts that span negative/positive
  const zero_y = useMemo(() => {
    if (!data || data.length === 0 || width === 0) return null
    const values = data.map((d) => d[value_key] || 0)
    const max_val = Math.max(...values, 1)
    const min_val = Math.min(...values, 0)
    if (min_val >= 0) return null
    const range = max_val - min_val || 1
    return height - ((0 - min_val) / range) * (height - 4) - 2
  }, [data, value_key, width, height])

  return (
    <div ref={container_ref} className='task-stats-sparkline-container'>
      {width > 0 && data && data.length > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {zero_y !== null && (
            <line
              x1='0'
              y1={zero_y}
              x2={width}
              y2={zero_y}
              stroke='#9ca3af'
              strokeWidth='0.5'
              strokeDasharray='3,3'
            />
          )}
          <polyline
            points={points}
            fill='none'
            stroke={color}
            strokeWidth='1.5'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      )}
    </div>
  )
}

Sparkline.propTypes = {
  data: PropTypes.array,
  value_key: PropTypes.string.isRequired,
  color: PropTypes.string,
  height: PropTypes.number
}

export const TaskStatusBar = ({ by_status }) => {
  const [show_labels, set_show_labels] = useState(false)
  const [hovered, set_hovered] = useState(null)

  if (!by_status) return null
  const entries = Object.entries(by_status)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  if (total === 0) return null

  return (
    <div className='task-status-bar-wrapper'>
      <div
        className='task-stats-status-bar'
        onClick={() => set_show_labels((s) => !s)}
      >
        {entries.map(([status, count]) => (
          <div
            key={status}
            className='task-stats-status-segment'
            style={{
              width: `${(count / total) * 100}%`,
              backgroundColor: STATUS_COLORS[status] || '#9ca3af'
            }}
            onMouseEnter={() => set_hovered(status)}
            onMouseLeave={() => set_hovered(null)}
          >
            {hovered === status && !show_labels && (
              <div className='task-stats-status-tooltip'>
                {status}: {count}
              </div>
            )}
          </div>
        ))}
      </div>
      {show_labels && (
        <div className='task-stats-status-legend'>
          {entries.map(([status, count]) => (
            <span key={status} className='task-stats-legend-item'>
              <span
                className='task-stats-legend-dot'
                style={{
                  backgroundColor: STATUS_COLORS[status] || '#9ca3af'
                }}
              />
              {status} ({count})
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

TaskStatusBar.propTypes = {
  by_status: PropTypes.object
}

const PERIODS = ['3d', '10d', '30d']

const TaskStats = ({
  summary,
  completion_series,
  is_loading,
  load_task_stats
}) => {
  useEffect(() => {
    load_task_stats()
  }, [load_task_stats])

  const summary_js = useMemo(
    () => (summary ? summary.toJS() : null),
    [summary]
  )
  const series_js = useMemo(
    () => (completion_series ? completion_series.toJS() : []),
    [completion_series]
  )

  // Compute backlog delta series (created - completed per week)
  const backlog_series = useMemo(() => {
    if (series_js.length === 0) return []
    return series_js.map((w) => ({
      ...w,
      delta: (w.created || 0) - (w.completed || 0)
    }))
  }, [series_js])

  if (is_loading && !summary_js) return null
  if (!summary_js) return null

  return (
    <div className='task-stats'>
      <div className='task-stats-periods'>
        <div className='task-stats-period-header'>
          <span className='task-stats-period-label' />
          <span className='task-stats-period-col'>done</span>
          <span className='task-stats-period-col'>new</span>
          <span className='task-stats-period-col'>net</span>
        </div>
        {PERIODS.map((key) => {
          const p = summary_js.periods?.[key]
          if (!p) return null
          const net = (p.created || 0) - (p.completed || 0)
          return (
            <div key={key} className='task-stats-period-row'>
              <span className='task-stats-period-label'>{key}</span>
              <span className='task-stats-period-col'>
                {p.completed || 0}
              </span>
              <span className='task-stats-period-col'>{p.created || 0}</span>
              <span
                className='task-stats-period-col'
                style={{ color: net <= 0 ? '#22c55e' : '#dc2626' }}
              >
                {net > 0 ? '+' : ''}
                {net}
              </span>
            </div>
          )
        })}
      </div>

      <div className='task-stats-sparklines'>
        <div className='task-stats-sparkline-row'>
          <span className='task-stats-sparkline-label'>completions</span>
          <Sparkline
            data={series_js}
            value_key='completed'
            color='#22c55e'
          />
        </div>
        <div className='task-stats-sparkline-row'>
          <span className='task-stats-sparkline-label'>backlog change</span>
          <Sparkline
            data={backlog_series}
            value_key='delta'
            color='#f97316'
          />
        </div>
      </div>
    </div>
  )
}

TaskStats.propTypes = {
  summary: ImmutablePropTypes.map,
  completion_series: ImmutablePropTypes.list,
  is_loading: PropTypes.bool,
  load_task_stats: PropTypes.func.isRequired
}

export default TaskStats
