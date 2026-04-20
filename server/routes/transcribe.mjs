import express from 'express'
import multer from 'multer'
import { safe_error_message } from '#server/utils/error-response.mjs'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import debug from 'debug'

import config from '#config'

const log = debug('api:transcribe')

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const unique = `transcribe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const ext = path.extname(file.originalname) || '.bin'
      cb(null, `${unique}${ext}`)
    }
  }),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/x-m4a',
      'audio/m4a'
    ]
    if (allowed.some((type) => file.mimetype.startsWith(type))) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`))
    }
  }
})

/**
 * Send audio file to the faster-whisper transcription service.
 *
 * The transcription service runs as a separate Python process (PM2-managed)
 * with the model pre-loaded for fast inference.
 *
 * @param {string} audio_path - Path to the audio file
 * @param {string} mime_type - MIME type of the audio file
 * @returns {Promise<{text: string, duration: number, audio_duration: number}>}
 */
async function transcribe_via_service(audio_path, mime_type) {
  const transcription_config = config.transcription || {}
  const service_url =
    transcription_config.service_url || 'http://127.0.0.1:8089'

  const audio_data = await fs.readFile(audio_path)

  const response = await fetch(`${service_url}/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': mime_type || 'audio/wav',
      'Content-Length': String(audio_data.length)
    },
    body: audio_data,
    signal: AbortSignal.timeout(60000) // 60 second timeout
  })

  if (!response.ok) {
    const err_data = await response.json().catch(() => ({}))
    throw new Error(
      err_data.error || `Transcription service error (${response.status})`
    )
  }

  return response.json()
}

const router = express.Router({ mergeParams: true })

/**
 * POST /api/transcribe
 * Accept audio file upload and transcribe via faster-whisper service.
 *
 * Requires JWT authentication.
 * Accepts multipart/form-data with 'audio' field.
 * Returns { text, duration, audio_duration }
 */
router.post('/', upload.single('audio'), async (req, res) => {
  const user_public_key = req.user?.user_public_key || null

  if (!user_public_key) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must be logged in to use transcription'
    })
  }

  if (!req.file) {
    return res.status(400).json({
      error: 'No audio file provided',
      message: 'Upload an audio file in the "audio" form field'
    })
  }

  const audio_path = req.file.path
  log(
    `Transcription request from ${user_public_key.slice(0, 8)}... file=${req.file.originalname} size=${req.file.size} mime=${req.file.mimetype}`
  )

  try {
    const result = await transcribe_via_service(audio_path, req.file.mimetype)
    log(
      `Transcription complete: ${result.text.length} chars in ${result.duration}s (audio: ${result.audio_duration}s)`
    )
    res.status(200).json(result)
  } catch (error) {
    log(`Transcription error: ${error.message}`)

    const is_connection_error =
      error.cause?.code === 'ECONNREFUSED' ||
      error.message.includes('ECONNREFUSED')
    const is_timeout = error.name === 'TimeoutError'

    if (is_connection_error) {
      res.status(503).json({
        error: 'Transcription service unavailable',
        message:
          'The transcription service is not running. Check PM2 status for transcription-service.'
      })
    } else if (is_timeout) {
      res.status(504).json({
        error: 'Transcription timed out',
        message: 'The transcription service took too long to respond'
      })
    } else {
      res.status(500).json({
        error: 'Transcription failed',
        message: safe_error_message(error)
      })
    }
  } finally {
    // Clean up temp file
    try {
      await fs.unlink(audio_path)
    } catch {
      // Ignore cleanup errors
    }
  }
})

// Handle multer errors
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large',
        message: 'Audio file must be under 25MB'
      })
    }
    return res.status(400).json({
      error: 'Upload error',
      message: err.message
    })
  }
  if (err.message?.startsWith('Unsupported audio format')) {
    return res.status(400).json({
      error: 'Invalid format',
      message: err.message
    })
  }
  next(err)
})

export default router
