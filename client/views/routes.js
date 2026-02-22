import React from 'react'
import { Routes as RouterRoutes, Route } from 'react-router-dom'

import Homepage from '@pages/Homepage/index.js'
import DirectoryPage from '@pages/DirectoryPage/index.js'
import ThreadsPage from '@pages/ThreadsPage.js'
import TasksPage from '@pages/TasksPage.js'

const Routes = () => {
  return (
    <RouterRoutes>
      {/* Homepage route */}
      <Route path='/' element={<Homepage />} />

      {/* Thread new route - entry point for voice/mobile thread creation */}
      <Route path='/thread/new' element={<Homepage />} />

      {/* Threads routes - splat captures full path for subdirectory support */}
      <Route path='/thread/*' element={<ThreadsPage />} />

      {/* Tasks routes - splat captures full path for subdirectory support */}
      <Route path='/task/*' element={<TasksPage />} />

      {/* Fallback to directory page for unmatched paths */}
      <Route path='/*' element={<DirectoryPage />} />
    </RouterRoutes>
  )
}

export default Routes
