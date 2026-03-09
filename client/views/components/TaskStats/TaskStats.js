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

const MOMENTUM_WINDOW = 4

function rolling_average(values, window) {
  const result = []
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1)
    const slice = values.slice(start, i + 1)
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length)
  }
  return result
}

const CHART_HEIGHT = 64

const TaskFlowChart = ({ data }) => {
  const container_ref = useRef(null)
  const [width, set_width] = useState(0)
  const [hover_idx, set_hover_idx] = useState(null)

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

  const chart = useMemo(() => {
    if (!data || data.length === 0 || width === 0) return null

    const completed = data.map((d) => d.completed || 0)
    const created = data.map((d) => d.created || 0)
    const net = data.map((d) => (d.completed || 0) - (d.created || 0))
    const momentum = rolling_average(net, MOMENTUM_WINDOW)

    const bar_width = width / data.length
    const max_net = Math.max(...momentum.map(Math.abs), 1)

    // Completions line (smoothed)
    const smoothed_completed = rolling_average(completed, MOMENTUM_WINDOW)
    const max_completed = Math.max(...smoothed_completed, 1)
    const padding = 4
    const usable = CHART_HEIGHT - padding * 2
    const completion_xs = data.map((_, i) => i * bar_width + bar_width / 2)
    const completion_ys = smoothed_completed.map(
      (v) => CHART_HEIGHT - padding - (v / max_completed) * usable
    )

    return {
      bar_width,
      completed,
      created,
      momentum,
      max_net,
      net,
      completion_xs,
      completion_ys
    }
  }, [data, width])

  const handle_mouse_move = (e) => {
    if (!chart || !container_ref.current) return
    const rect = container_ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const idx = Math.floor(x / chart.bar_width)
    set_hover_idx(Math.max(0, Math.min(idx, data.length - 1)))
  }

  if (!data || data.length === 0) return null

  return (
    <div
      ref={container_ref}
      className='task-flow-chart'
      onMouseMove={handle_mouse_move}
      onMouseLeave={() => set_hover_idx(null)}
    >
      {width > 0 && chart && (
        <>
          <svg
            width={width}
            height={CHART_HEIGHT}
            viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          >
            {/* Background bars: color intensity = smoothed net direction */}
            {data.map((_, i) => {
              const m = chart.momentum[i]
              const intensity = Math.min(Math.abs(m) / chart.max_net, 1)
              const color = m >= 0 ? '#22c55e' : '#f97316'
              const opacity = 0.08 + intensity * 0.35
              return (
                <rect
                  key={i}
                  x={i * chart.bar_width}
                  y={0}
                  width={chart.bar_width}
                  height={CHART_HEIGHT}
                  fill={color}
                  opacity={opacity}
                />
              )
            })}

            {/* Completions trend line */}
            <polyline
              points={chart.completion_xs
                .map((x, i) => `${x},${chart.completion_ys[i]}`)
                .join(' ')}
              fill='none'
              stroke='#22c55e'
              strokeWidth='1.5'
              strokeLinecap='round'
              strokeLinejoin='round'
              opacity='0.6'
            />

            {/* Hover highlight */}
            {hover_idx !== null && (
              <rect
                x={hover_idx * chart.bar_width}
                y={0}
                width={chart.bar_width}
                height={CHART_HEIGHT}
                fill='#ffffff'
                opacity='0.08'
              />
            )}
          </svg>

          {hover_idx !== null && (
            <div
              className='task-flow-tooltip'
              style={{
                left: Math.min(
                  hover_idx * chart.bar_width,
                  width - 120
                )
              }}
            >
              <div className='task-flow-tooltip-week'>
                {data[hover_idx].week}
              </div>
              <div>
                <span style={{ color: '#22c55e' }}>
                  {chart.completed[hover_idx]} done
                </span>
                {' / '}
                <span style={{ color: '#f97316' }}>
                  {chart.created[hover_idx]} new
                </span>
              </div>
              <div style={{ color: chart.net[hover_idx] >= 0 ? '#22c55e' : '#f97316' }}>
                net: {chart.net[hover_idx] > 0 ? '+' : ''}
                {chart.net[hover_idx]}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

TaskFlowChart.propTypes = {
  data: PropTypes.array
}

const TaskStats = ({
  completion_series,
  is_loading,
  load_task_stats
}) => {
  useEffect(() => {
    load_task_stats()
  }, [load_task_stats])

  const series_js = useMemo(
    () => (completion_series ? completion_series.toJS() : []),
    [completion_series]
  )

  if (is_loading && series_js.length === 0) return null
  if (series_js.length === 0) return null

  return (
    <div className='task-stats'>
      <TaskFlowChart data={series_js} />
    </div>
  )
}

TaskStats.propTypes = {
  completion_series: ImmutablePropTypes.list,
  is_loading: PropTypes.bool,
  load_task_stats: PropTypes.func.isRequired
}

export default TaskStats
