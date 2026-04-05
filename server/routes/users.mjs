import path from 'path'
import express from 'express'
import ed25519 from '#libs-server/crypto/ed25519-blake2b.mjs'
import jwt from 'jsonwebtoken'

import config from '#config'
import user_registry from '#libs-server/users/user-registry.mjs'
import {
  load_identity_by_public_key
} from '#libs-server/users/identity-loader.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { add_files, commit_changes } from '#libs-server/git/commit-operations.mjs'
import {
  is_nonce_used,
  mark_nonce_used
} from '#libs-server/auth/nonce-cache.mjs'

// Timestamp validation window: 5 minutes (in milliseconds)
const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000

// SameSite=Lax + signed POST payloads provide CSRF protection
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== 'development',
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
}

const router = express.Router()

// Get all users endpoint (requires authentication)
router.get('/', async (req, res) => {
  const { log } = req.app.locals
  try {
    if (!req.user) {
      return res.status(401).send({ error: 'authentication required' })
    }

    const users_array = await user_registry.list_users()

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

  const { username, user_public_key, created_at } = user

  return {
    username,
    user_public_key,
    created_at
  }
}

router.post('/', async (req, res) => {
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

    // Timestamp validation - must be within the last 5 minutes
    if (!data.timestamp || data.timestamp < Date.now() - TIMESTAMP_WINDOW_MS) {
      return res.status(400).send({ error: 'invalid or expired timestamp' })
    }

    // Nonce validation - prevent replay attacks
    // Mark nonce as used IMMEDIATELY after check to prevent TOCTOU race condition
    if (!data.nonce) {
      return res.status(400).send({ error: 'missing nonce' })
    }

    if (is_nonce_used({ nonce: data.nonce })) {
      return res.status(400).send({ error: 'nonce already used' })
    }

    // Mark nonce as used immediately to prevent concurrent replay attempts
    mark_nonce_used({ nonce: data.nonce })

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
    res.cookie('base_token', token, COOKIE_OPTIONS)
    res.status(200).send({
      token,
      user_public_key: data.user_public_key,
      ...user,
      config: {
        user_base_directory: config.user_base_directory
      }
    })
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

    // Timestamp validation - must be within the last 5 minutes (reduced from 1 hour)
    if (!data.timestamp || data.timestamp < Date.now() - TIMESTAMP_WINDOW_MS) {
      return res.status(400).send({ error: 'invalid or expired timestamp' })
    }

    // Nonce validation - prevent replay attacks
    // Mark nonce as used IMMEDIATELY after check to prevent TOCTOU race condition
    if (!data.nonce) {
      return res.status(400).send({ error: 'missing nonce' })
    }

    if (is_nonce_used({ nonce: data.nonce })) {
      return res.status(400).send({ error: 'nonce already used' })
    }

    // Mark nonce as used immediately to prevent concurrent replay attempts
    mark_nonce_used({ nonce: data.nonce })

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
    res.cookie('base_token', token, COOKIE_OPTIONS)
    res.status(200).send({
      token,
      user_public_key: data.user_public_key,
      ...user,
      config: {
        user_base_directory: config.user_base_directory
      }
    })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.delete('/session', (req, res) => {
  res.clearCookie('base_token', COOKIE_OPTIONS)
  res.status(200).send({ success: true })
})

router.get('/public_keys/:user_public_key', async (req, res) => {
  const { log } = req.app.locals
  try {
    if (!req.user) {
      return res.status(401).send({ error: 'authentication required' })
    }

    const { user_public_key } = req.params
    const user = await user_registry.find_by_public_key(user_public_key)

    if (!user) {
      return res.status(404).send({ error: 'user not found' })
    }

    res.status(200).send(filter_public_user_data(user))
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/:username', async (req, res) => {
  const { log } = req.app.locals
  try {
    if (!req.user) {
      return res.status(401).send({ error: 'authentication required' })
    }

    const { username } = req.params
    const user = await user_registry.find_by_username(username)

    if (!user) {
      return res.status(404).send({ error: 'user not found' })
    }

    // If requesting their own profile, return full data
    if (req.user.user_public_key === user.user_public_key) {
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

router.put('/preferences', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { preferences } = req.body
    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).send({ error: 'missing or invalid preferences' })
    }

    if (!req.user) {
      return res.status(401).send({ error: 'unauthorized' })
    }

    const { user_public_key } = req.user

    const identity = await load_identity_by_public_key({
      public_key: user_public_key
    })
    if (!identity) {
      return res.status(404).send({ error: 'identity not found' })
    }

    const absolute_path = identity.absolute_path
    const { entity_properties, entity_content } =
      await read_entity_from_filesystem({ absolute_path })

    const merged_preferences = {
      ...(entity_properties.preferences || {}),
      ...preferences
    }
    entity_properties.preferences = merged_preferences

    await write_entity_to_filesystem({
      absolute_path,
      entity_properties,
      entity_type: 'identity',
      entity_content: entity_content || ''
    })

    const user_base_directory = config.user_base_directory
    if (user_base_directory) {
      try {
        const relative_path = path.relative(user_base_directory, absolute_path)
        await add_files({
          worktree_path: user_base_directory,
          files_to_add: [relative_path]
        })
        await commit_changes({
          worktree_path: user_base_directory,
          commit_message: `chore: update user preferences for ${identity.username}`
        })
      } catch (error) {
        log(`Auto-commit preferences failed (non-fatal): ${error.message}`)
      }
    }

    res.status(200).send({ success: true, preferences: merged_preferences })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
