import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { HeatmapChart } from 'echarts/charts'
import {
  TooltipComponent,
  CalendarComponent,
  VisualMapComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import { COLORS } from '@theme/colors.js'
import { ACTIVITY_SCORE_WEIGHTS } from '#libs-shared/activity-score-weights.mjs'
import './ActivityHeatmap.styl'

// Register ECharts components
echarts.use([
  HeatmapChart,
  CalendarComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer
])

// Orange color gradient (Tailwind orange palette)
const ORANGE_COLORS = [
  '#fff7ed', // orange-50
  '#fed7aa', // orange-200
  '#fdba74', // orange-300
  '#fb923c', // orange-400
  '#f97316', // orange-500
  '#ea580c', // orange-600
  '#c2410c', // orange-700
  '#9a3412' // orange-800
]

const FILTERS = ['all', 'git', 'tasks', 'threads']

const W = ACTIVITY_SCORE_WEIGHTS

function recalculate_filtered_score(entry, filter) {
  switch (filter) {
    case 'git':
      return (
        (entry.activity_git_commits || 0) * W.git_commits +
        (entry.activity_git_files_changed || 0) * W.git_files_changed +
        Math.floor(
          (entry.activity_git_lines_changed || 0) / W.git_lines_changed_divisor
        )
      )
    case 'tasks':
      return (
        (entry.tasks_completed || 0) * W.tasks_completed +
        (entry.tasks_created || 0) * W.tasks_created
      )
    case 'threads':
      return (
        Math.floor(
          Math.sqrt((entry.activity_token_usage || 0) / W.token_usage_divisor)
        ) +
        (entry.activity_thread_edits || 0) * W.thread_edits +
        Math.floor(
          (entry.activity_thread_lines_changed || 0) /
            W.thread_lines_changed_divisor
        )
      )
    default:
      return entry.score
  }
}

const ActivityHeatmap = ({
  heatmap_data,
  max_score,
  load_activity_heatmap
}) => {
  const [filter, set_filter] = useState('all')

  useEffect(() => {
    load_activity_heatmap({ days: 365 })
  }, [load_activity_heatmap])

  // Convert heatmap_data to JS once
  const heatmap_data_js = useMemo(() => {
    if (!heatmap_data || heatmap_data.size === 0) return []
    return heatmap_data.toJS()
  }, [heatmap_data])

  // Calculate chart data and max score based on filter.
  // visualMap max is capped at the 95th percentile of non-zero scores so that
  // a single outlier day (e.g. a multi-million-token agentic session) does not
  // compress every other day into the lightest shade. Outlier days still
  // render as the darkest color because ECharts clips above-max values.
  const { chart_data, filtered_max_score, range_start, range_end } =
    useMemo(() => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 364)

      if (heatmap_data_js.length === 0) {
        return {
          chart_data: [],
          filtered_max_score: 0,
          range_start: start.toISOString().split('T')[0],
          range_end: end.toISOString().split('T')[0]
        }
      }

      const data = heatmap_data_js.map((entry) => [
        entry.date,
        recalculate_filtered_score(entry, filter)
      ])

      const non_zero_scores = data
        .map(([, s]) => s)
        .filter((s) => s > 0)
        .sort((a, b) => a - b)

      let capped_max = 0
      if (non_zero_scores.length > 0) {
        const p95_index = Math.floor(non_zero_scores.length * 0.98)
        capped_max =
          non_zero_scores[Math.min(p95_index, non_zero_scores.length - 1)]
      }

      return {
        chart_data: data,
        filtered_max_score: capped_max,
        range_start: start.toISOString().split('T')[0],
        range_end: end.toISOString().split('T')[0]
      }
    }, [heatmap_data_js, filter])

  // Format number with k/m suffix
  const format_num = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}m`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return n.toString()
  }

  const option = useMemo(
    () => ({
      tooltip: {
        position: 'top',
        appendToBody: true,
        formatter: (params) => {
          if (!params.value) return ''
          const date_str = params.value[0]
          const entry = heatmap_data_js.find((item) => item.date === date_str)

          if (!entry) {
            return `<span class='activity-tooltip-date'>${date_str}</span>`
          }

          const lines = [`<div class='activity-tooltip-date'>${date_str}</div>`]

          if (entry.activity_token_usage > 0) {
            lines.push(
              `<div class='activity-tooltip-row'>${format_num(entry.activity_token_usage)} tokens</div>`
            )
          }

          const actions = []
          if (entry.activity_thread_edits > 0)
            actions.push(`${entry.activity_thread_edits} edits`)
          if (entry.activity_git_commits > 0)
            actions.push(`${entry.activity_git_commits} commits`)
          if (actions.length > 0) {
            lines.push(
              `<div class='activity-tooltip-row'>${actions.join(' · ')}</div>`
            )
          }

          const changes = []
          if (entry.activity_git_files_changed > 0)
            changes.push(`${entry.activity_git_files_changed} files`)
          if (entry.activity_git_lines_changed > 0)
            changes.push(
              `${format_num(entry.activity_git_lines_changed)} lines`
            )
          if (changes.length > 0) {
            lines.push(
              `<div class='activity-tooltip-row'>${changes.join(' · ')}</div>`
            )
          }

          const task_items = []
          if (entry.tasks_created > 0)
            task_items.push(`${entry.tasks_created} created`)
          if (entry.tasks_completed > 0)
            task_items.push(`${entry.tasks_completed} completed`)
          if (task_items.length > 0) {
            lines.push(
              `<div class='activity-tooltip-row'>tasks: ${task_items.join(' · ')}</div>`
            )
          }

          return lines.join('')
        },
        backgroundColor: '#0d1117',
        borderColor: '#30363d',
        borderWidth: 1,
        textStyle: {
          color: '#f0f6fc',
          fontSize: 11,
          fontFamily: "'IBM Plex Mono', Monaco, Menlo, monospace"
        },
        extraCssText: 'border-radius: 0;'
      },
      visualMap: {
        show: false,
        min: 0,
        max: filtered_max_score || max_score || 100,
        calculable: false,
        orient: 'horizontal',
        inRange: {
          color: ORANGE_COLORS
        }
      },
      calendar: {
        range: [range_start, range_end],
        cellSize: [4, 4],
        top: 20,
        left: 30,
        right: 10,
        bottom: 5,
        itemStyle: {
          borderWidth: 2,
          borderColor: '#F7F7F4'
        },
        yearLabel: { show: false },
        monthLabel: {
          show: true,
          fontSize: 10,
          color: COLORS.text_secondary
        },
        dayLabel: {
          show: true,
          firstDay: 0,
          fontSize: 10,
          color: COLORS.text_secondary,
          nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S']
        },
        splitLine: {
          show: false
        }
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: chart_data
        }
      ]
    }),
    [
      chart_data,
      heatmap_data_js,
      max_score,
      filtered_max_score,
      range_start,
      range_end
    ]
  )

  return (
    <div className='activity-heatmap'>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{
          height: '100px',
          minWidth: '340px',
          width: '100%'
        }}
        opts={{ renderer: 'canvas' }}
      />
      <div className='activity-heatmap-filters'>
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`activity-heatmap-filter${filter === f ? ' active' : ''}`}
            onClick={() => set_filter(f)}>
            {f}
          </button>
        ))}
      </div>
    </div>
  )
}

ActivityHeatmap.propTypes = {
  heatmap_data: ImmutablePropTypes.list,
  max_score: PropTypes.number,
  load_activity_heatmap: PropTypes.func.isRequired
}

export default ActivityHeatmap
