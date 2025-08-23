import express from 'express'

import {
  list_tasks_from_filesystem,
  read_task_from_filesystem
} from '#libs-server/task/index.mjs'
import get_tasks_table_view_results from '#libs-server/tasks/get-tasks-table-view-results.mjs'

const router = express.Router({ mergeParams: true })

// POST /api/tasks/table - Server-side table processing
router.post('/table', async (req, res) => {
  const { log } = req.app.locals

  try {
    // Extract table_state from request body
    const { table_state } = req.body

    // Validate table_state structure
    if (table_state && typeof table_state !== 'object') {
      return res.status(400).json({
        error: 'Invalid table_state',
        message: 'table_state must be an object matching react-table schema'
      })
    }

    // Use requesting user's permissions for filtering
    const user_public_key =
      req.user?.user_public_key ||
      req.permission_context?.user_public_key ||
      null

    if (!user_public_key) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Valid JWT token required to access tasks'
      })
    }

    // Get table results
    const results = await get_tasks_table_view_results({
      user_public_key,
      table_state: table_state || {}
    })

    log(
      `Tasks table request processed: ${results.rows.length}/${results.total_row_count} tasks`
    )

    res.status(200).json(results)
  } catch (error) {
    log('Error processing tasks table request:', error)
    res.status(500).json({
      error: 'Failed to process tasks table request',
      message: error.message
    })
  }
})

// GET /api/tasks - Get all tasks with optional filtering OR get a specific task by base_uri
router.get('/', async (req, res) => {
  const { log } = req.app.locals

  try {
    // Use requesting user's permissions for filtering
    const user_public_key =
      req.user?.user_public_key ||
      req.permission_context?.user_public_key ||
      null

    if (!user_public_key) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Valid JWT token required to access tasks'
      })
    }

    const {
      base_uri,
      status,
      tag_entity_ids,
      organization_ids,
      person_ids,
      min_finish_by,
      max_finish_by,
      min_estimated_total_duration,
      max_estimated_total_duration,
      min_planned_start,
      max_planned_start,
      min_planned_finish,
      max_planned_finish,
      archived
    } = req.query

    // If base_uri is provided, get a specific task
    if (base_uri) {
      try {
        // Read task from filesystem using registry-based resolution
        const task = await read_task_from_filesystem({
          base_uri
        })

        if (!task.success) {
          return res.status(404).send({ error: task.error || 'Task not found' })
        }

        res.status(200).send({
          base_uri,
          ...task.entity_properties,
          content: task.entity_content
        })
      } catch (error) {
        return res.status(404).send({
          error: `Task ${base_uri} not found: ${error.message}`
        })
      }
    } else {
      // If no base_uri, list all tasks with optional filtering
      // Convert array parameters from query strings
      const parsed_tag_entity_ids = tag_entity_ids
        ? Array.isArray(tag_entity_ids)
          ? tag_entity_ids
          : [tag_entity_ids]
        : []
      const parsed_organization_ids = organization_ids
        ? Array.isArray(organization_ids)
          ? organization_ids
          : [organization_ids]
        : []
      const parsed_person_ids = person_ids
        ? Array.isArray(person_ids)
          ? person_ids
          : [person_ids]
        : []

      const tasks = await list_tasks_from_filesystem({
        user_public_key,
        status,
        tag_entity_ids: parsed_tag_entity_ids,
        organization_ids: parsed_organization_ids,
        person_ids: parsed_person_ids,
        min_finish_by,
        max_finish_by,
        min_estimated_total_duration,
        max_estimated_total_duration,
        min_planned_start,
        max_planned_start,
        min_planned_finish,
        max_planned_finish,
        archived: archived === 'true'
      })

      res.status(200).send(tasks)
    }
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
