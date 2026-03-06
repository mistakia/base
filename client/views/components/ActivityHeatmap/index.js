import React, { Suspense } from 'react'

const ActivityHeatmapConnected = React.lazy(
  () => import('./ActivityHeatmapConnected.js')
)

const ActivityHeatmap = (props) => (
  <Suspense fallback={null}>
    <ActivityHeatmapConnected {...props} />
  </Suspense>
)

export default ActivityHeatmap
