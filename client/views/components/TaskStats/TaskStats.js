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

function area_path(xs, ys, baseline_y) {
  if (xs.length === 0) return ''
  const parts = [`M ${xs[0]},${baseline_y}`]
  for (let i = 0; i < xs.length; i++) {
    parts.push(`L ${xs[i]},${ys[i]}`)
  }
  parts.push(`L ${xs[xs.length - 1]},${baseline_y} Z`)
  return parts.join(' ')
}

function smooth_line_path(xs, ys) {
  if (xs.length < 2) return ''
  const parts = [`M ${xs[0]},${ys[0]}`]
  for (let i = 1; i < xs.length; i++) {
    const cx = (xs[i - 1] + xs[i]) / 2
    parts.push(`C ${cx},${ys[i - 1]} ${cx},${ys[i]} ${xs[i]},${ys[i]}`)
  }
  return parts.join(' ')
}

const CHART_HEIGHT = 64
const PADDING_Y = 4

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

    // Shared y-scale for areas (max of either series)
    const max_area = Math.max(...completed, ...created, 1)
    const usable = CHART_HEIGHT - PADDING_Y * 2
    const baseline_y = CHART_HEIGHT - PADDING_Y

    const x_step = width / Math.max(data.length - 1, 1)
    const xs = data.map((_, i) => i * x_step)

    const scale_area = (v) => baseline_y - (v / max_area) * usable

    const completed_ys = completed.map(scale_area)
    const created_ys = created.map(scale_area)

    // Momentum line: scale to its own range, centered vertically
    const mom_max = Math.max(...momentum.map(Math.abs), 0.5)
    const mid_y = CHART_HEIGHT / 2
    const mom_range = usable * 0.4
    const momentum_ys = momentum.map(
      (v) => mid_y - (v / mom_max) * mom_range
    )

    return {
      xs,
      completed_ys,
      created_ys,
      momentum_ys,
      mid_y,
      baseline_y,
      x_step,
      completed,
      created,
      momentum,
      net
    }
  }, [data, width])

  const handle_mouse_move = (e) => {
    if (!chart || !container_ref.current) return
    const rect = container_ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const idx = Math.round(x / chart.x_step)
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
            {/* Completed area (green) */}
            <path
              d={area_path(chart.xs, chart.completed_ys, chart.baseline_y)}
              fill='#22c55e'
              opacity='0.25'
            />
            {/* Created area (orange) */}
            <path
              d={area_path(chart.xs, chart.created_ys, chart.baseline_y)}
              fill='#f97316'
              opacity='0.2'
            />

            {/* Momentum zero line */}
            <line
              x1='0'
              y1={chart.mid_y}
              x2={width}
              y2={chart.mid_y}
              stroke='#6b7280'
              strokeWidth='0.5'
              strokeDasharray='3,3'
            />

            {/* Momentum line */}
            <path
              d={smooth_line_path(chart.xs, chart.momentum_ys)}
              fill='none'
              stroke='#e5e7eb'
              strokeWidth='1.5'
              strokeLinecap='round'
            />

            {/* Hover indicator */}
            {hover_idx !== null && (
              <line
                x1={chart.xs[hover_idx]}
                y1={0}
                x2={chart.xs[hover_idx]}
                y2={CHART_HEIGHT}
                stroke='#9ca3af'
                strokeWidth='0.5'
              />
            )}
          </svg>

          {hover_idx !== null && (
            <div
              className='task-flow-tooltip'
              style={{
                left: Math.min(
                  chart.xs[hover_idx],
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
              <div style={{ color: '#e5e7eb' }}>
                momentum: {chart.momentum[hover_idx] > 0 ? '+' : ''}
                {chart.momentum[hover_idx].toFixed(1)}
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
