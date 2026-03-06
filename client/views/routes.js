import React, { Suspense } from 'react'
import { Routes as RouterRoutes, Route } from 'react-router-dom'

import Homepage from '@pages/Homepage/index.js'

const DirectoryPage = React.lazy(() => import('@pages/DirectoryPage/index.js'))
const ThreadsPage = React.lazy(() => import('@pages/ThreadsPage.js'))
const TasksPage = React.lazy(() => import('@pages/TasksPage.js'))

const Routes = () => {
  return (
    <RouterRoutes>
      {/* Homepage route */}
      <Route path='/' element={<Homepage />} />

      {/* Thread new route - entry point for voice/mobile thread creation */}
      <Route path='/thread/new' element={<Homepage />} />

      {/* Threads routes - splat captures full path for subdirectory support */}
      <Route
        path='/thread/*'
        element={
          <Suspense fallback={null}>
            <ThreadsPage />
          </Suspense>
        }
      />

      {/* Tasks routes - splat captures full path for subdirectory support */}
      <Route
        path='/task/*'
        element={
          <Suspense fallback={null}>
            <TasksPage />
          </Suspense>
        }
      />

      {/* Fallback to directory page for unmatched paths */}
      <Route
        path='/*'
        element={
          <Suspense fallback={null}>
            <DirectoryPage />
          </Suspense>
        }
      />
    </RouterRoutes>
  )
}

export default Routes
