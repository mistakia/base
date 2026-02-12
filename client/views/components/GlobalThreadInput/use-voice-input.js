import { useState, useRef, useCallback, useEffect } from 'react'
import { useSelector } from 'react-redux'

import { API_URL } from '@core/constants'

const SUPPORTED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/wav'
]

const MAX_RECORDING_BYTES = 20 * 1024 * 1024 // 20MB client-side limit (server allows 25MB)

const get_supported_mime_type = () => {
  if (typeof MediaRecorder === 'undefined') return null
  return SUPPORTED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || null
}

const get_file_extension = (mime_type) => {
  if (mime_type.startsWith('audio/mp4')) return 'm4a'
  if (mime_type.startsWith('audio/webm')) return 'webm'
  if (mime_type.startsWith('audio/ogg')) return 'ogg'
  if (mime_type.startsWith('audio/wav')) return 'wav'
  return 'bin'
}

/**
 * Hook for voice input via MediaRecorder + server-side transcription.
 *
 * @param {Object} options
 * @param {Function} options.on_transcript - Called with transcribed text string
 * @returns {Object} Voice input controls and state
 */
export default function use_voice_input({ on_transcript } = {}) {
  const [is_recording, set_is_recording] = useState(false)
  const [is_transcribing, set_is_transcribing] = useState(false)
  const [error, set_error] = useState(null)

  const media_recorder_ref = useRef(null)
  const audio_chunks_ref = useRef([])
  const audio_size_ref = useRef(0)
  const stream_ref = useRef(null)

  const user_token = useSelector((state) => state.getIn(['app', 'user_token']))

  const cleanup_stream = useCallback(() => {
    if (stream_ref.current) {
      stream_ref.current.getTracks().forEach((track) => track.stop())
      stream_ref.current = null
    }
    media_recorder_ref.current = null
    audio_chunks_ref.current = []
    audio_size_ref.current = 0
  }, [])

  // Cleanup on unmount to release microphone stream
  useEffect(() => {
    return () => {
      if (
        media_recorder_ref.current &&
        media_recorder_ref.current.state === 'recording'
      ) {
        media_recorder_ref.current.stop()
      }
      if (stream_ref.current) {
        stream_ref.current.getTracks().forEach((track) => track.stop())
        stream_ref.current = null
      }
    }
  }, [])

  const transcribe_audio = useCallback(
    async (audio_blob, mime_type) => {
      set_is_transcribing(true)
      set_error(null)

      try {
        const ext = get_file_extension(mime_type)
        const form_data = new FormData()
        form_data.append('audio', audio_blob, `recording.${ext}`)

        const response = await fetch(`${API_URL}/transcribe`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${user_token}`
          },
          body: form_data,
          signal: AbortSignal.timeout(90000)
        })

        if (!response.ok) {
          const err_data = await response.json().catch(() => ({}))
          throw new Error(err_data.error || `Transcription failed (${response.status})`)
        }

        const result = await response.json()
        if (result.text && on_transcript) {
          on_transcript(result.text)
        }
        return result.text
      } catch (err) {
        const message =
          err.name === 'TimeoutError'
            ? 'Transcription timed out'
            : err.message
        set_error(message)
        return null
      } finally {
        set_is_transcribing(false)
      }
    },
    [user_token, on_transcript]
  )

  const start_recording = useCallback(async () => {
    set_error(null)

    const mime_type = get_supported_mime_type()
    if (!mime_type) {
      set_error('Audio recording is not supported in this browser')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream_ref.current = stream
      audio_chunks_ref.current = []
      audio_size_ref.current = 0

      const recorder = new MediaRecorder(stream, { mimeType: mime_type })
      media_recorder_ref.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audio_chunks_ref.current.push(event.data)
          audio_size_ref.current += event.data.size

          if (audio_size_ref.current >= MAX_RECORDING_BYTES) {
            set_error('Recording size limit reached')
            recorder.stop()
          }
        }
      }

      recorder.onstop = () => {
        const chunks = audio_chunks_ref.current
        if (chunks.length > 0) {
          const audio_blob = new Blob(chunks, { type: mime_type })
          transcribe_audio(audio_blob, mime_type)
        }
        cleanup_stream()
      }

      recorder.onerror = (event) => {
        set_error(event.error?.message || 'Recording error')
        set_is_recording(false)
        cleanup_stream()
      }

      recorder.start(1000) // Request data every 1s for size tracking
      set_is_recording(true)
    } catch (err) {
      set_error(
        err.name === 'NotAllowedError'
          ? 'Microphone access denied'
          : err.message
      )
      cleanup_stream()
    }
  }, [transcribe_audio, cleanup_stream])

  const stop_recording = useCallback(() => {
    if (
      media_recorder_ref.current &&
      media_recorder_ref.current.state === 'recording'
    ) {
      media_recorder_ref.current.stop()
    }
    set_is_recording(false)
  }, [])

  const is_supported =
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof MediaRecorder !== 'undefined'

  return {
    start_recording,
    stop_recording,
    is_recording,
    is_transcribing,
    is_supported,
    error
  }
}
