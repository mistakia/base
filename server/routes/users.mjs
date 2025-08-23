import express from 'express'
import ed25519 from '@trashman/ed25519-blake2b'
import jwt from 'jsonwebtoken'

import config from '#config'
import user_registry from '#libs-server/users/user-registry.mjs'
import databases from './databases.mjs'

const router = express.Router()

// Get all users endpoint
router.get('/?', async (req, res) => {
  const { log } = req.app.locals
  try {
    // Return all users but filtered for public consumption
    const users_object = await user_registry.load_users()

    // Convert to array and sort by created_at desc and limit to 50
    const users_array = Object.entries(users_object).map(
      ([user_public_key, user]) => ({
        user_public_key,
        ...user
      })
    )

    const sorted_users = users_array
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 50)

    const filtered_users = sorted_users.map(filter_public_user_data)
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
    username,
    user_public_key,
    created_at,
    permissions = {}
    // Remove any other private fields
  } = user

  return {
    username,
    user_public_key,
    created_at,
    permissions
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
    const is_valid = ed25519.verify(signature, data_hash, data.user_public_key)
    if (!is_valid) {
      return res.status(400).send({ error: 'invalid signature' })
    }

    // Check if user has access
    const has_access = await user_registry.user_has_access(data.user_public_key)
    if (!has_access) {
      return res.status(403).send({
        error: 'Access denied - contact administrator to add your public key'
      })
    }

    // Get user data
    const user = await user_registry.find_by_public_key(data.user_public_key)
    if (!user) {
      return res.status(403).send({ error: 'Access denied - user not found' })
    }

    const token = jwt.sign(
      { user_public_key: data.user_public_key },
      config.jwt.secret
    )
    res
      .status(200)
      .send({ token, user_public_key: data.user_public_key, ...user })
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
    const is_valid = ed25519.verify(signature, data_hash, data.user_public_key)
    if (!is_valid) {
      return res.status(400).send({ error: 'invalid signature' })
    }

    // timestamp is required and must be within the last hour
    if (!data.timestamp || data.timestamp < Date.now() - 3600000) {
      return res.status(400).send({ error: 'invalid timestamp' })
    }

    // Check if user has access
    const has_access = await user_registry.user_has_access(data.user_public_key)
    if (!has_access) {
      return res.status(403).send({
        error: 'Access denied - contact administrator to add your public key'
      })
    }

    const user = await user_registry.find_by_public_key(data.user_public_key)
    if (!user) {
      return res.status(403).send({ error: 'Access denied - user not found' })
    }

    const token = jwt.sign(
      { user_public_key: data.user_public_key },
      config.jwt.secret
    )
    res
      .status(200)
      .send({ token, user_public_key: data.user_public_key, ...user })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/public_keys/:user_public_key', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { user_public_key } = req.params
    const user = await user_registry.find_by_public_key(user_public_key)

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
    const user = await user_registry.find_by_username(username)

    if (!user) {
      return res.status(404).send({ error: 'user not found' })
    }

    // Check if request is authenticated via Authorization header
    const auth_header = req.headers.authorization
    let is_authenticated = false
    let requesting_public_key = null

    if (auth_header) {
      try {
        const token = auth_header.replace('Bearer ', '')
        const decoded = jwt.verify(token, config.jwt.secret)
        requesting_public_key = decoded.user_public_key
        is_authenticated = true
      } catch (err) {
        // Invalid token, treat as unauthenticated
        is_authenticated = false
      }
    }

    // If authenticated and requesting their own profile, return full data
    if (is_authenticated && requesting_public_key === user.user_public_key) {
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

router.use('/:user_public_key/databases', databases)

export default router
