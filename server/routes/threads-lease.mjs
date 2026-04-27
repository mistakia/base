import express from 'express'
import debug from 'debug'

import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import config from '#config'
import require_service_auth from '#server/middleware/require-service-auth.mjs'
import {
  acquire_lease,
  renew_lease,
  release_lease,
  inspect_lease,
  list_active_leases
} from '#libs-server/threads/lease-store.mjs'

const log = debug('api:threads-lease')

const router = express.Router()

const _resolve_storage_machine_id = () => {
  const registry = config.machine_registry
  if (!registry || typeof registry !== 'object') return null
  for (const [id, entry] of Object.entries(registry)) {
    if (entry?.storage?.enabled) return id
  }
  return null
}

const non_storage_guard = (req, res, next) => {
  const current = get_current_machine_id()
  const storage_id = _resolve_storage_machine_id()
  if (!storage_id || current !== storage_id) {
    return res.status(410).json({
      error: 'lease store is only available on the storage machine'
    })
  }
  next()
}

const lease_auth = [require_service_auth, non_storage_guard]

router.get('/lease', ...lease_auth, async (req, res) => {
  const filter = req.query.filter || 'all'
  if (!['owned-by-me', 'owned-by-remote', 'all'].includes(filter)) {
    return res.status(400).json({ error: 'invalid filter' })
  }
  try {
    const all = await list_active_leases()
    if (filter === 'all') return res.json({ leases: all })
    const requester = req.service.machine_id
    const leases =
      filter === 'owned-by-me'
        ? all.filter((lease) => lease.machine_id === requester)
        : all.filter((lease) => lease.machine_id !== requester)
    return res.json({ leases })
  } catch (error) {
    log('list lease error: %s', error.message)
    return res.status(500).json({ error: 'lease list failed' })
  }
})

router.get('/:thread_id/lease', ...lease_auth, async (req, res) => {
  try {
    const lease = await inspect_lease({ thread_id: req.params.thread_id })
    return res.json(lease)
  } catch (error) {
    log('inspect lease error: %s', error.message)
    return res.status(500).json({ error: 'lease inspect failed' })
  }
})

router.post('/:thread_id/lease/acquire', ...lease_auth, async (req, res) => {
  const { machine_id, session_id, ttl_ms, mode } = req.body || {}
  if (!machine_id || !ttl_ms) {
    return res.status(400).json({ error: 'machine_id and ttl_ms required' })
  }
  if (machine_id !== req.service.machine_id) {
    return res
      .status(403)
      .json({ error: 'machine_id must match service token issuer' })
  }
  try {
    const result = await acquire_lease({
      thread_id: req.params.thread_id,
      machine_id,
      session_id,
      ttl_ms,
      mode
    })
    return res.json(result)
  } catch (error) {
    log('acquire lease error: %s', error.message)
    return res.status(500).json({ error: 'lease acquire failed' })
  }
})

router.post('/:thread_id/lease/renew', ...lease_auth, async (req, res) => {
  const { lease_token, ttl_ms } = req.body || {}
  if (lease_token == null || !ttl_ms) {
    return res.status(400).json({ error: 'lease_token and ttl_ms required' })
  }
  try {
    const result = await renew_lease({
      thread_id: req.params.thread_id,
      lease_token,
      ttl_ms
    })
    return res.json(result)
  } catch (error) {
    log('renew lease error: %s', error.message)
    return res.status(500).json({ error: 'lease renew failed' })
  }
})

router.post('/:thread_id/lease/release', ...lease_auth, async (req, res) => {
  const { lease_token } = req.body || {}
  if (lease_token == null) {
    return res.status(400).json({ error: 'lease_token required' })
  }
  try {
    const result = await release_lease({
      thread_id: req.params.thread_id,
      lease_token
    })
    return res.json(result)
  } catch (error) {
    log('release lease error: %s', error.message)
    return res.status(500).json({ error: 'lease release failed' })
  }
})

export default router
