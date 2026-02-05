import React from 'react'
import { createRoot } from 'react-dom/client'

import Root from '@views/root.js'

document.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.getElementById('app')
  const root = createRoot(rootElement)
  root.render(<Root />)
})
