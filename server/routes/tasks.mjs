import express from 'express'
import { toBinaryUUID } from 'binary-uuid'
import ed25519 from '@trashman/ed25519-blake2b'

import db from '#db'

import { get_tasks, create_task } from '#utils'

const router = express.Router({ mergeParams: true })

router.get('/?', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { user_id } = req.params
    const tasks = await get_tasks({
      user_id: toBinaryUUID(user_id),
      ...req.query
    })
    res.status(200).send(tasks)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.post('/?', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { task, signature } = req.body
    if (!task) {
      return res.status(400).send({ error: 'missing task' })
    }

    if (!signature) {
      return res.status(400).send({ error: 'missing signature' })
    }

    const user_id = toBinaryUUID(req.params.user_id)
    const user = await db('users').where('user_id', user_id).first()
    if (!user) {
      return res.status(400).send({ error: 'invalid user_id' })
    }

    const task_hash = ed25519.hash(JSON.stringify(task))
    const is_valid = ed25519.verify(signature, task_hash, user.public_key)
    if (!is_valid) {
      return res.status(400).send({ error: 'invalid signature' })
    }

    const task_id = await create_task({ ...task, user_id })
    const task_result = await db('tasks').where('task_id', task_id).first()
    res.status(200).send(task_result)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/:task_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { task_id } = req.params
    const task = await db('tasks').where('task_id', task_id).first()
    res.status(200).send(task)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
