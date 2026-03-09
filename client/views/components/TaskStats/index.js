import React, { Suspense } from 'react'

const TaskStatsConnected = React.lazy(
  () => import('./TaskStatsConnected.js')
)

const TaskStatusBarConnected = React.lazy(() =>
  import('./TaskStatsConnected.js').then((m) => ({
    default: m.ConnectedTaskStatusBar
  }))
)

const TaskStats = (props) => (
  <Suspense fallback={null}>
    <TaskStatsConnected {...props} />
  </Suspense>
)

export const TaskStatusBar = (props) => (
  <Suspense fallback={null}>
    <TaskStatusBarConnected {...props} />
  </Suspense>
)

export default TaskStats
