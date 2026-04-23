import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import debug from 'debug'

import config from '#config'
import { check_permission_for_uri } from '#server/middleware/permission/index.mjs'
import {
  resolve_base_uri,
  verify_storage_realpath
} from '#libs-server/base-uri/base-uri-utilities.mjs'

const router = express.Router()
const log = debug('api:storage')

const MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

const INLINE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'mp4', 'webm', 'mov', 'mp3'
])

router.get('/file/raw', async (req, res, next) => {
  const timestamp = new Date().toISOString()
  const request_path = req.query.path || ''
  const normalized = String(request_path).replace(/^\/+/, '')
  const resource_uri = `storage:${normalized}`

  const emit = (entry) => log(JSON.stringify({ timestamp, path: normalized, ...entry }))

  let access
  try {
    access = await check_permission_for_uri(req, resource_uri)
  } catch (error) {
    emit({
      identity: req.user?.user_public_key || null,
      allowed: false,
      reason: `permission_check_error: ${error.message}`,
      status: 500,
      bytes: 0
    })
    return res.status(500).json({ error: 'Permission check failed' })
  }

  if (!access.read_allowed) {
    emit({
      identity: access.user_public_key,
      allowed: false,
      reason: access.reason,
      status: 403,
      bytes: 0
    })
    return res.status(403).json({ error: 'Access denied' })
  }

  const ext = path.extname(normalized).toLowerCase().slice(1)
  const allowlist = (config.storage && config.storage.extension_whitelist) || []
  if (!allowlist.includes(ext)) {
    emit({
      identity: access.user_public_key,
      allowed: false,
      reason: `extension_not_whitelisted: ${ext || '(none)'}`,
      status: 415,
      bytes: 0
    })
    return res.status(415).json({ error: 'Unsupported file extension' })
  }

  let resolved_path
  try {
    const candidate = resolve_base_uri(resource_uri)
    resolved_path = await verify_storage_realpath(candidate)
  } catch (error) {
    const is_missing = error.code === 'ENOENT'
    const is_traversal = /traversal|escape/i.test(error.message)
    const status = is_missing ? 404 : is_traversal ? 403 : 500
    emit({
      identity: access.user_public_key,
      allowed: false,
      reason: `resolve_failed: ${error.message}`,
      status,
      bytes: 0
    })
    return res.status(status).json({
      error: is_missing
        ? 'File not found'
        : is_traversal
          ? 'Access denied'
          : 'Resolution failed'
    })
  }

  let stats
  try {
    stats = await fs.stat(resolved_path)
  } catch (error) {
    if (error.code === 'ENOENT') {
      emit({
        identity: access.user_public_key,
        allowed: false,
        reason: 'file_not_found',
        status: 404,
        bytes: 0
      })
      return res.status(404).json({ error: 'File not found' })
    }
    throw error
  }

  if (!stats.isFile()) {
    emit({
      identity: access.user_public_key,
      allowed: false,
      reason: 'not_a_file',
      status: 400,
      bytes: 0
    })
    return res.status(400).json({ error: 'Path is not a file' })
  }

  const content_type = MIME_TYPES[ext] || 'application/octet-stream'
  const disposition = INLINE_EXTENSIONS.has(ext) ? 'inline' : 'attachment'
  const filename = path.basename(normalized)

  res.setHeader('Content-Type', content_type)
  res.setHeader('Content-Length', stats.size)
  // `private` so shared caches (CDN, reverse proxy) do not serve this
  // access-controlled response to other requestors.
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${filename.replace(/"/g, '\\"')}"`
  )

  emit({
    identity: access.user_public_key,
    allowed: true,
    reason: 'ok',
    status: 200,
    bytes: stats.size
  })

  try {
    await pipeline(createReadStream(resolved_path), res)
  } catch (error) {
    next(error)
  }
})

export default router
