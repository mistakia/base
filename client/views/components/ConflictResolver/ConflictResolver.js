import React, { Suspense } from 'react'

const ConflictResolverCore = React.lazy(
  () => import('./ConflictResolverCore.js')
)

const ConflictResolver = (props) => (
  <Suspense fallback={null}>
    <ConflictResolverCore {...props} />
  </Suspense>
)

export default ConflictResolver
