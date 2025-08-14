import React from 'react'
import { Routes as RouterRoutes, Route } from 'react-router-dom'

import Homepage from '@pages/Homepage/index.js'
import DirectoryPage from '@pages/DirectoryPage/index.js'
import ThreadsPage from '@pages/ThreadsPage.js'
import ThreadPage from '@pages/ThreadPage/index.js'

const Routes = () => {
  return (
    <RouterRoutes>
      {/* Homepage route */}
      <Route path='/' element={<Homepage />} />

      {/* Threads routes */}
      <Route path='/thread' element={<ThreadsPage />} />
      <Route path='/thread/:id' element={<ThreadPage />} />

      {/* Fallback to directory page for unmatched paths */}
      <Route path='/*' element={<DirectoryPage />} />
    </RouterRoutes>
  )
}

export default Routes
