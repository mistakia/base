import { useState, useCallback, useEffect, useRef } from 'react'

const COPY_SUCCESS_TIMEOUT_MS = 2000

export const use_copy_to_clipboard = () => {
  const [copied_value, set_copied_value] = useState(null)
  const timeout_ref = useRef(null)

  useEffect(() => {
    return () => {
      if (timeout_ref.current) {
        clearTimeout(timeout_ref.current)
      }
    }
  }, [])

  const copy_to_clipboard = useCallback((value) => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        set_copied_value(value)
        if (timeout_ref.current) {
          clearTimeout(timeout_ref.current)
        }
        timeout_ref.current = setTimeout(() => {
          set_copied_value(null)
          timeout_ref.current = null
        }, COPY_SUCCESS_TIMEOUT_MS)
      })
      .catch((err) => console.error('Failed to copy: ', err))
  }, [])

  return { copied_value, copy_to_clipboard }
}
