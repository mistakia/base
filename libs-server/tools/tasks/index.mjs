/**
 * Task tools for the centralized tool registry
 */

import debug from 'debug'

// Import all task tools
import './get-task.mjs'
import './get-filtered-tasks.mjs'
import './create-task.mjs'
import './update-task.mjs'
import './delete-task.mjs'

// Setup logger
const log = debug('tools:tasks')

log('Registering task tools')
