import express from 'express'

import {
  list_tasks_from_filesystem,
  read_task_from_filesystem
} from '#libs-server/task/index.mjs'

const router = express.Router({ mergeParams: true })

// Get all tasks with optional filtering OR get a specific task by base_uri
router.get('/', async (req, res) => {
  const { log } = req.app.locals
  const { user_id } = req.params
  try {
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

    if (!user_id) {
      return res.status(400).send({ error: 'missing user_id' })
    }

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
        user_id,
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
