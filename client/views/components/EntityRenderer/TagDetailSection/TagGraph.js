import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { PieChart, BarChart } from 'echarts/charts'
import {
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import { COLORS } from '@theme/colors.js'

// Register ECharts components
echarts.use([
  PieChart,
  BarChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer
])

// Status color mapping
const STATUS_COLORS = {
  'No status': COLORS.gray[400],
  Waiting: COLORS.gray[500],
  Paused: COLORS.amber[500],
  Planned: COLORS.blue[500],
  Started: COLORS.cyan[500],
  'In Progress': COLORS.indigo[500],
  Completed: COLORS.green[500],
  Abandoned: COLORS.red[400],
  Blocked: COLORS.red[600]
}

// Thread state color mapping
const THREAD_STATE_COLORS = {
  active: COLORS.green[500],
  archived: COLORS.gray[500],
  unknown: COLORS.gray[400]
}

/**
 * TagGraph Component
 *
 * Displays a visual summary of tasks and threads.
 * Shows status distribution as a pie chart.
 *
 * @param {Array} tasks - Array of task entities
 * @param {Array} threads - Array of thread objects
 */
const TagGraph = ({ tasks, threads }) => {
  // Calculate task status distribution
  const task_status_data = useMemo(() => {
    const counts = {}
    tasks.forEach((task) => {
      const status = task.status || 'No status'
      counts[status] = (counts[status] || 0) + 1
    })

    return Object.entries(counts)
      .map(([name, value]) => ({
        name,
        value,
        itemStyle: { color: STATUS_COLORS[name] || COLORS.gray[500] }
      }))
      .sort((a, b) => b.value - a.value)
  }, [tasks])

  // Calculate thread state distribution
  const thread_state_data = useMemo(() => {
    const counts = {}
    threads.forEach((thread) => {
      const state = thread.thread_state || 'unknown'
      counts[state] = (counts[state] || 0) + 1
    })

    return Object.entries(counts)
      .map(([name, value]) => ({
        name,
        value,
        itemStyle: { color: THREAD_STATE_COLORS[name] || COLORS.gray[500] }
      }))
      .sort((a, b) => b.value - a.value)
  }, [threads])

  const has_tasks = task_status_data.length > 0
  const has_threads = thread_state_data.length > 0

  if (!has_tasks && !has_threads) {
    return null
  }

  const chart_options = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: {
        color: COLORS.gray[600],
        fontSize: 12
      }
    },
    series: []
  }

  // Add task pie chart if there are tasks
  if (has_tasks) {
    chart_options.series.push({
      name: 'Tasks by Status',
      type: 'pie',
      radius: has_threads ? ['20%', '40%'] : ['30%', '60%'],
      center: has_threads ? ['30%', '50%'] : ['40%', '50%'],
      data: task_status_data,
      label: {
        show: false
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 12,
          fontWeight: 'bold'
        }
      }
    })
  }

  // Add thread pie chart if there are threads
  if (has_threads) {
    chart_options.series.push({
      name: 'Threads by State',
      type: 'pie',
      radius: ['20%', '40%'],
      center: ['70%', '50%'],
      data: thread_state_data,
      label: {
        show: false
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 12,
          fontWeight: 'bold'
        }
      }
    })
  }

  return (
    <div className='tag-graph'>
      <div className='tag-graph__header'>
        <h3 className='tag-graph__title'>Distribution</h3>
        <div className='tag-graph__labels'>
          {has_tasks && (
            <span className='tag-graph__label'>Tasks by Status</span>
          )}
          {has_threads && (
            <span className='tag-graph__label'>Threads by State</span>
          )}
        </div>
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={chart_options}
        style={{ height: '200px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
      />
    </div>
  )
}

TagGraph.propTypes = {
  tasks: PropTypes.array.isRequired,
  threads: PropTypes.array.isRequired
}

export default TagGraph
