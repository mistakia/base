import express from 'express'
import ed25519 from '@trashman/ed25519-blake2b'

import db from '#db'

import { create_task, get_task, get_tasks } from '#libs-server'

const router = express.Router({ mergeParams: true })

// Get all tasks with optional filtering
router.get('/', async (req, res) => {
  const { log } = req.app.locals
  const { user_id } = req.params
  try {
    const {
      status,
      tag_ids,
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

    // Convert array parameters from query strings
    const parsed_tag_ids = tag_ids
      ? Array.isArray(tag_ids)
        ? tag_ids
        : [tag_ids]
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

    const tasks = await get_tasks({
      user_id,
      status,
      tag_ids: parsed_tag_ids,
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

    res.status(200).send(await tasks)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

// Get a task by ID
router.get('/:task_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { task_id } = req.params

    if (!task_id) {
      return res.status(400).send({ error: 'missing task_id' })
    }

    const task = await get_task({ task_id })

    if (!task) {
      return res.status(404).send({ error: 'task not found' })
    }

    res.status(200).send(task)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.post('/?', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { user_id } = req.params
    const { task, signature } = req.body
    if (!task) {
      return res.status(400).send({ error: 'missing task' })
    }

    if (!signature) {
      return res.status(400).send({ error: 'missing signature' })
    }

    const user = await db('users').where('user_id', user_id).first()
    if (!user) {
      return res.status(400).send({ error: 'invalid user_id' })
    }

    const task_hash = ed25519.hash(JSON.stringify(task))
    const is_valid = ed25519.verify(signature, task_hash, user.public_key)
    if (!is_valid) {
      return res.status(400).send({ error: 'invalid signature' })
    }

    const entity_id = await create_task({
      user_id,
      title: task.title || task.text_input || 'Untitled Task',
      description: task.description || ''
    })

    // Use get_task function to retrieve the created task for consistency
    const task_result = await get_task({ task_id: entity_id })

    res.status(200).send(task_result)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
