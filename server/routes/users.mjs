import express from 'express'
import ed25519 from '@trashman/ed25519-blake2b'
import jwt from 'jsonwebtoken'

import db from '#db'
import config from '#config'

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

    if (!data.username) {
      data.username = `user_${data.public_key.slice(0, 8)}`
    }

    const [user_id] = await db('users')
      .insert(data)
      .onConflict('public_key')
      .merge()
    const user = await db('users')
      .select('*', db.raw('BIN_TO_UUID(user_id, true) as user_id'))
      .where({ user_id })
      .first()

    const token = jwt.sign({ user_id: user.user_id }, config.jwt_secret)
    res.status(200).send({ token, ...(user || {}) })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.post('/session', async (req, res) => {
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

    // timestamp is required and must be within the last hour
    if (!data.timestamp || data.timestamp < Date.now() - 3600000) {
      return res.status(400).send({ error: 'invalid timestamp' })
    }

    const user = await db('users')
      .select('*', db.raw('BIN_TO_UUID(user_id, true) as user_id'))
      .where({ public_key: data.public_key })
      .first()

    if (!user) {
      return res.status(404).send({ error: 'user not found' })
    }

    const token = jwt.sign({ user_id: user.user_id }, config.jwt_secret)
    res.status(200).send({ token, ...user })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/:username', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { username } = req.params
    const user = await db('users')
      .select('*', db.raw('BIN_TO_UUID(user_id, true) as user_id'))
      .where({ username })
      .first()

    if (!user) {
      return res.status(404).send({ error: 'user not found' })
    }

    res.status(200).send(user)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
