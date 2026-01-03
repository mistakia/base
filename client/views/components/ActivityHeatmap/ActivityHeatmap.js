import React, { useEffect, useMemo } from 'react'
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

const ActivityHeatmap = ({
  heatmap_data,
  max_score,
  load_activity_heatmap
}) => {
  useEffect(() => {
    load_activity_heatmap({ days: 365 })
  }, [load_activity_heatmap])

  // Convert heatmap_data to JS once, calculate chart data and date range
  const { heatmap_data_js, chart_data, range_start, range_end } =
    useMemo(() => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 364) // 52 weeks

      if (!heatmap_data || heatmap_data.size === 0) {
        return {
          heatmap_data_js: [],
          chart_data: [],
          range_start: start.toISOString().split('T')[0],
          range_end: end.toISOString().split('T')[0]
        }
      }

      const data_js = heatmap_data.toJS()
      return {
        heatmap_data_js: data_js,
        chart_data: data_js.map((entry) => [entry.date, entry.score]),
        range_start: start.toISOString().split('T')[0],
        range_end: end.toISOString().split('T')[0]
      }
    }, [heatmap_data])

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
        max: max_score || 100,
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
          color: '#666'
        },
        dayLabel: {
          show: true,
          firstDay: 0,
          fontSize: 10,
          color: '#666',
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
    [chart_data, heatmap_data_js, max_score, range_start, range_end]
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
    </div>
  )
}

ActivityHeatmap.propTypes = {
  heatmap_data: ImmutablePropTypes.list,
  max_score: PropTypes.number,
  load_activity_heatmap: PropTypes.func.isRequired
}

export default ActivityHeatmap
