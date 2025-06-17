import express from 'express'
import ed25519 from '@trashman/ed25519-blake2b'
import jwt from 'jsonwebtoken'

import db from '#db'
import config from '#config'
import tasks from './tasks.mjs'
import databases from './databases.mjs'

const router = express.Router()

// Get all users endpoint
router.get('/?', async (req, res) => {
  const { log } = req.app.locals
  try {
    // Return all users but filtered for public consumption
    const users = await db('users')
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(50) // Limit to prevent too much data

    const filtered_users = users.map(filter_public_user_data)
    res.status(200).send(filtered_users)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

// Filter private fields for public user data
const filter_public_user_data = (user) => {
  if (!user) return null

  const {
    user_id,
    username,
    public_key,
    created_at,
    updated_at
    // Remove private fields like email, etc.
  } = user

  return {
    user_id,
    username,
    public_key,
    created_at,
    updated_at
  }
}

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

    await db('users').insert(data).onConflict('public_key').merge()

    const user = await db('users')
      .select('*')
      .where({ public_key: data.public_key })
      .first()

    const token = jwt.sign({ user_id: user.user_id }, config.jwt.secret)
    res.status(200).send({ token, ...user })
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
      .select('*')
      .where({ public_key: data.public_key })
      .first()

    if (!user) {
      return res.status(404).send({ error: 'user not found' })
    }

    const token = jwt.sign({ user_id: user.user_id }, config.jwt.secret)
    res.status(200).send({ token, ...user })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/public_keys/:public_key', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { public_key } = req.params
    const user = await db('users').select('*').where({ public_key }).first()

    if (!user) {
      return res.status(404).send({ error: 'user not found' })
    }

    res.status(200).send(user)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/:username', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { username } = req.params
    const user = await db('users').select('*').where({ username }).first()

    if (!user) {
      return res.status(404).send({ error: 'user not found' })
    }

    // Check if request is authenticated via Authorization header
    const auth_header = req.headers.authorization
    let is_authenticated = false
    let requesting_user_id = null

    if (auth_header) {
      try {
        const token = auth_header.replace('Bearer ', '')
        const decoded = jwt.verify(token, config.jwt.secret)
        requesting_user_id = decoded.user_id
        is_authenticated = true
      } catch (err) {
        // Invalid token, treat as unauthenticated
        is_authenticated = false
      }
    }

    // If authenticated and requesting their own profile, return full data
    if (is_authenticated && requesting_user_id === user.user_id) {
      res.status(200).send(user)
    } else {
      // Return filtered public data
      res.status(200).send(filter_public_user_data(user))
    }
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.use('/:user_id/databases', databases)
router.use('/:user_id/tasks', tasks)

export default router
