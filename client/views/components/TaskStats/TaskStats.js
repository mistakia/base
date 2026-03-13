import React, { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'

import './TaskStats.styl'

export const STATUS_COLORS = {
  // Backlog: light desaturated tints (cool, inert)
  'No status': '#d5dae0',
  Draft: '#b0b8c1',
  Planned: '#8e97a3',
  // Active: blue family (energy being spent)
  Started: '#60a5fa',
  'In Progress': '#3b82f6',
  // Stalled: warm tones (needs attention, escalating urgency)
  Paused: '#78716c',
  Waiting: '#d97706',
  Blocked: '#ef4444',
  // Terminal (shouldn't appear often in open tasks)
  Done: '#6b7280'
}

// Lifecycle pipeline: unstarted -> active -> stalled
const STATUS_ORDER = [
  'No status',
  'Draft',
  'Planned',
  'Started',
  'In Progress',
  'Paused',
  'Waiting',
  'Blocked'
]

export const TaskStatusBar = ({ by_status }) => {
  const [show_labels, set_show_labels] = useState(false)
  const [hovered, set_hovered] = useState(null)

  if (!by_status) return null
  const raw_entries = Object.entries(by_status)
  const total = raw_entries.reduce((sum, [, count]) => sum + count, 0)
  if (total === 0) return null

  // Sort by defined order; unknown statuses go to the end
  const entries = raw_entries.sort(([a], [b]) => {
    const ai = STATUS_ORDER.indexOf(a)
    const bi = STATUS_ORDER.indexOf(b)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  return (
    <div className='task-status-bar-wrapper'>
      <div
        className='task-stats-status-bar'
        onClick={() => set_show_labels((s) => !s)}>
        {entries.map(([status, count]) => (
          <div
            key={status}
            className='task-stats-status-segment'
            style={{
              width: `${(count / total) * 100}%`,
              backgroundColor: STATUS_COLORS[status] || '#6b7280'
            }}
            onMouseEnter={() => set_hovered(status)}
            onMouseLeave={() => set_hovered(null)}>
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
                  backgroundColor: STATUS_COLORS[status] || '#6b7280'
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

const SMOOTH_WINDOW = 4
const INTERP = 4
const HORIZON_BANDS = 2
const CHART_HEIGHT = 40
const MID = CHART_HEIGHT / 2
const HALF = MID - 1

function rolling_average(values, window) {
  const result = []
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1)
    const slice = values.slice(start, i + 1)
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length)
  }
  return result
}

// Interpolate a series to INTERP * (n-1) + 1 points
function interpolate(values) {
  const result = []
  for (let i = 0; i < values.length - 1; i++) {
    for (let j = 0; j < INTERP; j++) {
      const t = j / INTERP
      result.push(values[i] * (1 - t) + values[i + 1] * t)
    }
  }
  result.push(values[values.length - 1])
  return result
}

// Build horizon band path for one band of a series
// direction: -1 for upward (completed), +1 for downward (created)
function horizon_band_path(xs, values, band_idx, band_size, direction) {
  const band_min = band_idx * band_size
  const points = xs.map((x, i) => {
    const v = Math.max(0, Math.min(values[i] - band_min, band_size))
    const y = MID + direction * (v / band_size) * HALF
    return `${x},${y}`
  })
  return `M${xs[0]},${MID} L${points.join(' L')} L${xs[xs.length - 1]},${MID}Z`
}

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

    const smoothed_completed = rolling_average(completed, SMOOTH_WINDOW)
    const smoothed_created = rolling_average(created, SMOOTH_WINDOW)
    const smoothed_net = rolling_average(net, SMOOTH_WINDOW)

    // Interpolate for smoother curves
    const interp_completed = interpolate(smoothed_completed)
    const interp_created = interpolate(smoothed_created)
    const interp_net = interpolate(smoothed_net)

    const interp_count = interp_completed.length
    const interp_width = width / interp_count
    const interp_xs = Array.from(
      { length: interp_count },
      (_, i) => i * interp_width + interp_width / 2
    )

    const data_width = width / data.length

    // Scale both to same max so areas are comparable
    const max_val = Math.max(...interp_completed, ...interp_created, 1)
    const band_size = max_val / HORIZON_BANDS

    // Completed horizon bands (green, upward from midline)
    const completed_bands = []
    for (let b = 0; b < HORIZON_BANDS; b++) {
      completed_bands.push(
        horizon_band_path(interp_xs, interp_completed, b, band_size, -1)
      )
    }

    // Created horizon bands (red, downward from midline)
    const created_bands = []
    for (let b = 0; b < HORIZON_BANDS; b++) {
      created_bands.push(
        horizon_band_path(interp_xs, interp_created, b, band_size, 1)
      )
    }

    // Diff line (cyan): net difference as a continuous line
    // Positive net extends upward from midline, negative extends downward
    const max_abs_net = Math.max(...interp_net.map(Math.abs), 1)
    const diff_line = interp_xs
      .map((x, i) => {
        const y = MID - (interp_net[i] / max_abs_net) * HALF
        return `${x},${y}`
      })
      .join(' ')

    // Backlog: use server-provided open count, or fall back to relative delta
    const has_open = data.some((d) => d.open != null && d.open > 0)
    const open = has_open
      ? data.map((d) => d.open || 0)
      : (() => {
          const result = []
          let cum = 0
          for (let i = 0; i < data.length; i++) {
            cum += created[i] - completed[i]
            result.push(cum)
          }
          const min_val = Math.min(...result)
          return result.map((v) => v - min_val)
        })()

    // Backlog line: first value anchored at midline, changes shown relative
    // Above midline = backlog grew vs start, below = backlog shrank
    const smoothed_open = rolling_average(open, SMOOTH_WINDOW)
    const interp_open = interpolate(smoothed_open)
    const start_val = interp_open[0]
    const max_abs_delta = Math.max(
      ...interp_open.map((v) => Math.abs(v - start_val)),
      0.1
    )
    const backlog_line = interp_xs
      .map((x, i) => {
        const delta = interp_open[i] - start_val
        // Positive delta (backlog grew) goes up, negative goes down
        const y = MID - (delta / max_abs_delta) * HALF
        return `${x},${y}`
      })
      .join(' ')

    return {
      completed,
      created,
      open,
      net,
      data_width,
      completed_bands,
      created_bands,
      diff_line,
      backlog_line,
      has_open
    }
  }, [data, width])

  const handle_mouse_move = (e) => {
    if (!chart || !container_ref.current) return
    const rect = container_ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const idx = Math.floor(x / chart.data_width)
    set_hover_idx(Math.max(0, Math.min(idx, data.length - 1)))
  }

  if (!data || data.length === 0) return null

  return (
    <div
      ref={container_ref}
      className='task-flow-chart'
      onMouseMove={handle_mouse_move}
      onMouseLeave={() => set_hover_idx(null)}>
      {width > 0 && chart && (
        <>
          <svg
            width={width}
            height={CHART_HEIGHT}
            viewBox={`0 0 ${width} ${CHART_HEIGHT}`}>
            {/* Completed horizon bands (purple, upward) */}
            {chart.completed_bands.map((path, b) => (
              <path
                key={`c${b}`}
                d={path}
                fill='#8b5cf6'
                opacity={0.08 + b * 0.1}
              />
            ))}

            {/* Created horizon bands (orange, downward) */}
            {chart.created_bands.map((path, b) => (
              <path
                key={`r${b}`}
                d={path}
                fill='#f97316'
                opacity={0.08 + b * 0.1}
              />
            ))}

            {/* Diff line (cyan) */}
            <polyline
              points={chart.diff_line}
              fill='none'
              stroke='#06b6d4'
              strokeWidth='1.5'
              strokeLinecap='round'
              strokeLinejoin='round'
              opacity='0.5'
            />

            {/* Midline */}
            <line
              x1={0}
              y1={MID}
              x2={width}
              y2={MID}
              stroke='#f0f6fc'
              strokeWidth='0.5'
              opacity='0.12'
            />

            {/* Backlog line (dashed) */}
            <polyline
              points={chart.backlog_line}
              fill='none'
              stroke='#c9d1d9'
              strokeWidth='1.5'
              strokeDasharray='4 3'
              strokeLinecap='round'
              strokeLinejoin='round'
              opacity='0.7'
            />

            {/* Hover highlight */}
            {hover_idx !== null && (
              <rect
                x={hover_idx * chart.data_width}
                y={0}
                width={chart.data_width}
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
                left: Math.min(hover_idx * chart.data_width, width - 120)
              }}>
              <div className='task-flow-tooltip-week'>
                {data[hover_idx].week}
              </div>
              <div>
                <span style={{ color: '#a78bfa' }}>
                  {chart.completed[hover_idx]} done
                </span>
                {' / '}
                <span style={{ color: '#fb923c' }}>
                  {chart.created[hover_idx]} new
                </span>
              </div>
              <div>
                <span
                  style={{
                    color: chart.net[hover_idx] >= 0 ? '#a78bfa' : '#fb923c'
                  }}>
                  net: {chart.net[hover_idx] > 0 ? '+' : ''}
                  {chart.net[hover_idx]}
                </span>{' '}
                <span style={{ color: '#9ca3af' }}>
                  {chart.has_open ? 'open' : 'backlog'}: {chart.open[hover_idx]}
                </span>
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

const TaskStats = ({ completion_series, is_loading, load_task_stats }) => {
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
