import express from 'express'
import ed25519 from '@trashman/ed25519-blake2b'
import { toBinaryUUID } from 'binary-uuid'

import db from '#db'

const router = express.Router()

router.post('/?', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { data, signature } = req.body

    if (!data) {
      return res.status(400).send({ error: 'missing data' })
    }

    if (!signature) {
      return res.status(400).send({ error: 'missing signature' })
    }

    const data_hash = ed25519.hash(JSON.stringify(data))
    const is_valid = ed25519.verify(signature, data_hash, data.public_key)
    if (!is_valid) {
      return res.status(400).send({ error: 'invalid signature' })
    }

    const [user_id] = await db('users').insert(data)
    res.status(200).send({ user_id })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/:user_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const user_id = toBinaryUUID(req.params.user_id)
    const user = await db('users')
      .select('*', db.raw('BIN_TO_UUID(user_id, true) as user_id'))
      .where({ user_id })
      .first()
    res.status(200).send(user)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/public_keys/:public_key', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { public_key } = req.params
    const user = await db('users')
      .select('*', db.raw('BIN_TO_UUID(user_id, true) as user_id'))
      .where({ public_key })
      .first()
    res.status(200).send(user)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
