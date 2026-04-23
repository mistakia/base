import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import debug from 'debug'

import config from '#config'
import { check_permission_for_uri } from '#server/middleware/permission/index.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'

const router = express.Router()
const log = debug('api:storage')

// MIME types served inline. Anything else is sent as an attachment.
const INLINE_MIME_TYPES = {
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
  mp3: 'audio/mpeg'
}

const ATTACHMENT_MIME_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

const emit_log = (entry) => {
  // Single-line structured log per request -- keep field set stable for
  // downstream parsing.
  log(JSON.stringify(entry))
}

router.get('/file/raw', async (req, res) => {
  const timestamp = new Date().toISOString()
  const request_path = req.query.path || ''
  // Normalize for URI building: strip leading slashes so the URI is
  // `storage:foo/bar.png` not `storage://foo/bar.png`.
  const normalized = String(request_path).replace(/^\/+/, '')
  const resource_uri = `storage:${normalized}`

  let access
  try {
    access = await check_permission_for_uri(req, resource_uri)
  } catch (error) {
    emit_log({
      timestamp,
      identity: req.user?.user_public_key || null,
      path: normalized,
      allowed: false,
      reason: `permission_check_error: ${error.message}`,
      status: 500,
      bytes: 0
    })
    return res.status(500).json({ error: 'Permission check failed' })
  }

  if (!access.read_allowed) {
    emit_log({
      timestamp,
      identity: access.user_public_key,
      path: normalized,
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
    emit_log({
      timestamp,
      identity: access.user_public_key,
      path: normalized,
      allowed: false,
      reason: `extension_not_whitelisted: ${ext || '(none)'}`,
      status: 415,
      bytes: 0
    })
    return res.status(415).json({ error: 'Unsupported file extension' })
  }

  let resolved_path
  try {
    resolved_path = resolve_base_uri(resource_uri)
  } catch (error) {
    const is_missing = error.code === 'ENOENT'
    const is_traversal = /traversal|escape/i.test(error.message)
    const status = is_missing ? 404 : is_traversal ? 403 : 500
    emit_log({
      timestamp,
      identity: access.user_public_key,
      path: normalized,
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
      emit_log({
        timestamp,
        identity: access.user_public_key,
        path: normalized,
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
    emit_log({
      timestamp,
      identity: access.user_public_key,
      path: normalized,
      allowed: false,
      reason: 'not_a_file',
      status: 400,
      bytes: 0
    })
    return res.status(400).json({ error: 'Path is not a file' })
  }

  const inline_mime = INLINE_MIME_TYPES[ext]
  const attachment_mime = ATTACHMENT_MIME_TYPES[ext]
  const content_type =
    inline_mime || attachment_mime || 'application/octet-stream'
  const disposition = inline_mime ? 'inline' : 'attachment'
  const filename = path.basename(normalized)

  res.setHeader('Content-Type', content_type)
  res.setHeader('Content-Length', stats.size)
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${filename.replace(/"/g, '\\"')}"`
  )

  emit_log({
    timestamp,
    identity: access.user_public_key,
    path: normalized,
    allowed: true,
    reason: 'ok',
    status: 200,
    bytes: stats.size
  })

  createReadStream(resolved_path).pipe(res)
})

export default router
