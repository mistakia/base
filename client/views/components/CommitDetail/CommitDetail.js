import React, { Suspense } from 'react'

const CommitDetailCore = React.lazy(() => import('./CommitDetailCore.js'))

const CommitDetail = (props) => (
  <Suspense fallback={null}>
    <CommitDetailCore {...props} />
  </Suspense>
)

export default CommitDetail
