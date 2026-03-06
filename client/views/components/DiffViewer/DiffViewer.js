import React, { Suspense } from 'react'

const DiffViewerCore = React.lazy(() => import('./DiffViewerCore.js'))

const DiffViewer = (props) => (
  <Suspense fallback={null}>
    <DiffViewerCore {...props} />
  </Suspense>
)

export default DiffViewer
