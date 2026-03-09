import React, { Suspense } from 'react'

const TaskStatsConnected = React.lazy(
  () => import('./TaskStatsConnected.js')
)

const TaskStats = (props) => (
  <Suspense fallback={null}>
    <TaskStatsConnected {...props} />
  </Suspense>
)

export default TaskStats
